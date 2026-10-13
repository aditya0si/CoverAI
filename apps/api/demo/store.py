"""Bounded, ephemeral, single-process demo session store.

State disappears on restart. Exactly one worker is permitted. Capabilities are
stored only as SHA-256 digests; the raw token never enters the store or JSON.

Lifecycle guarantees
--------------------
* Expensive work (PDF parsing / explanation building) runs **outside** the session
  lock via a snapshot + ``PreparedResult``; the store only applies the prepared
  mutation atomically after re-checking TTL, generation and destruction.
* Concurrent *equal* operations (same operation/key/payload) resolve to the same
  stored result instead of duplicating work; a different operation while one is
  in flight returns ``BUSY`` (409).
* Expired capabilities are remembered in a **bounded** tombstone table so a known
  but expired capability returns 410 rather than collapsing into 401.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Mapping
from uuid import UUID, uuid4

from .config import DemoLimits
from .contracts import Document, Explanation, Handoff, PageText
from .errors import (
    Busy,
    CapacityExceeded,
    Conflict,
    GenerationStale,
    SessionExpired,
    SessionMissing,
)
from .security import RateLimiter, digest_capability, new_capability, new_csrf_token


@dataclass
class StoredResponse:
    status_code: int
    body: Any


@dataclass
class PreparedResult:
    """A response plus the mutation to apply atomically at commit time."""

    response: StoredResponse
    apply: Callable[["DemoSession"], None]


@dataclass(frozen=True)
class SessionSnapshot:
    """Immutable view captured under the session lock before expensive work.

    Also serves as the single atomic read boundary for the HTTP read routes: a
    snapshot is captured while holding ``session.lock`` after re-validating the
    session lifecycle, so callers never observe a torn document/page/revision
    state across a concurrent reupload, reset or expiry.
    """

    document: Document | None
    pages: tuple[PageText, ...]
    explanations: Mapping[str, Explanation]
    handoffs: Mapping[str, Handoff]
    generation: int = 1
    expires_at: datetime | None = None
    csrf_token: str = ""


@dataclass
class _Inflight:
    payload_digest: str
    event: threading.Event = field(default_factory=threading.Event)
    result: StoredResponse | None = None
    error: BaseException | None = None
    # The generation produced by the owner's own apply. Equal waiters accept this
    # generation (it proves the bump came from this operation, not a later
    # reset/replacement), while a further bump or destruction is refused.
    result_generation: int | None = None


@dataclass
class SessionCreated:
    token: str
    csrf_token: str
    expires_at: str
    mode: str = "deterministic"


class DemoSession:
    def __init__(
        self, *, token_digest: str, csrf_token: str, created_at: datetime, expires_at: datetime
    ) -> None:
        self.token_digest = token_digest
        self.csrf_token = csrf_token
        self.created_at = created_at
        self.expires_at = expires_at
        self.generation = 1
        self.destroyed = False
        self.lock = threading.RLock()

        self.document: Document | None = None
        self.pages: list[PageText] = []
        self.explanations: dict[str, Explanation] = {}
        self.handoffs: dict[str, Handoff] = {}
        # (operation, idempotency key) -> (payload digest, generation, response)
        self.idempotency: dict[tuple[str, str], tuple[str, int, StoredResponse]] = {}
        self.inflight: dict[tuple[str, str], _Inflight] = {}
        self.active_ops = 0

    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at

    def clear_contents(self) -> None:
        self.document = None
        self.pages = []
        self.explanations.clear()
        self.handoffs.clear()
        self.idempotency.clear()
        self.generation += 1

    def snapshot(self) -> SessionSnapshot:
        return SessionSnapshot(
            document=self.document,
            pages=tuple(self.pages),
            explanations=dict(self.explanations),
            handoffs=dict(self.handoffs),
            generation=self.generation,
            expires_at=self.expires_at,
            csrf_token=self.csrf_token,
        )


class DemoStore:
    def __init__(self, clock: Callable[[], datetime], limits: DemoLimits) -> None:
        self._clock = clock
        self.limits = limits
        self._sessions: dict[str, DemoSession] = {}
        self._lock = threading.RLock()
        self._limiter = RateLimiter(clock)
        # Bounded table of recently expired capability digests -> tombstone deadline.
        self._tombstones: dict[str, datetime] = {}
        self._tombstone_retention = timedelta(seconds=15 * 60)
        self._max_tombstones = 2_000

    # ── session lifecycle ─────────────────────────────────────────────────
    def create_session(self) -> SessionCreated:
        now = self._clock()
        with self._lock:
            self._purge_locked(now)
            if len(self._sessions) >= self.limits.max_sessions:
                raise CapacityExceeded(
                    "Demo capacity is full. Please retry shortly.",
                    retry_after=self.limits.purge_interval_seconds,
                )
            token = new_capability()
            csrf = new_csrf_token()
            digest = digest_capability(token)
            expires = now + timedelta(seconds=self.limits.session_ttl_seconds)
            session = DemoSession(
                token_digest=digest,
                csrf_token=csrf,
                created_at=now,
                expires_at=expires,
            )
            self._sessions[digest] = session
        return SessionCreated(
            token=token,
            csrf_token=csrf,
            expires_at=_iso(expires),
        )

    def resolve(self, token: str) -> DemoSession:
        digest = digest_capability(token)
        now = self._clock()
        with self._lock:
            self._prune_tombstones_locked(now)
            session = self._sessions.get(digest)
            if session is None:
                if digest in self._tombstones:
                    raise SessionExpired("The demo session has expired.")
                raise SessionMissing("No active demo session.")
            if session.is_expired(now) or session.destroyed:
                self._expire_session_locked(digest, session, now)
                raise SessionExpired("The demo session has expired.")
            return session

    def read_snapshot(self, session: DemoSession) -> SessionSnapshot:
        """Atomically snapshot a live session for a read route.

        Re-validates destruction/expiry while holding ``session.lock`` so a
        reset, expiry or concurrent reupload cannot land between a capability
        lookup and the read. Raises ``SessionExpired`` (410) for a known but
        destroyed/expired session.
        """
        with session.lock:
            now = self._clock()
            if session.destroyed or session.is_expired(now):
                raise SessionExpired("The demo session has expired.")
            return session.snapshot()

    def reset(self, token: str | None) -> None:
        if not token:
            return
        digest = digest_capability(token)
        with self._lock:
            session = self._sessions.pop(digest, None)
            if session is not None:
                with session.lock:
                    session.destroyed = True
                    session.clear_contents()
            self._limiter.forget(f"mutate:{digest}")
            self._limiter.forget(f"upload:{digest}")

    def purge_expired(self) -> int:
        with self._lock:
            return self._purge_locked(self._clock())

    def _purge_locked(self, now: datetime) -> int:
        self._prune_tombstones_locked(now)
        expired = [
            digest
            for digest, session in self._sessions.items()
            if session.is_expired(now) or session.destroyed
        ]
        for digest in expired:
            session = self._sessions.get(digest)
            if session is not None:
                self._expire_session_locked(digest, session, now)
        self._limiter.sweep(now)
        return len(expired)

    def _expire_session_locked(self, digest: str, session: DemoSession, now: datetime) -> None:
        self._sessions.pop(digest, None)
        with session.lock:
            session.destroyed = True
            session.clear_contents()
        self._tombstone_locked(digest, now)
        self._limiter.forget(f"mutate:{digest}")
        self._limiter.forget(f"upload:{digest}")

    def _tombstone_locked(self, digest: str, now: datetime) -> None:
        self._tombstones[digest] = now + self._tombstone_retention
        if len(self._tombstones) > self._max_tombstones:
            oldest = min(self._tombstones, key=self._tombstones.__getitem__)
            self._tombstones.pop(oldest, None)

    def _prune_tombstones_locked(self, now: datetime) -> None:
        stale = [digest for digest, deadline in self._tombstones.items() if deadline <= now]
        for digest in stale:
            self._tombstones.pop(digest, None)

    @property
    def live_session_count(self) -> int:
        now = self._clock()
        with self._lock:
            return sum(1 for s in self._sessions.values() if not s.is_expired(now))

    @property
    def tombstone_count(self) -> int:
        with self._lock:
            return len(self._tombstones)

    @property
    def rate_limiter(self) -> RateLimiter:
        return self._limiter

    # ── rate limiting ─────────────────────────────────────────────────────
    def check_session_rate(self, ip: str) -> None:
        self._limiter.check(
            f"session:{ip}",
            self.limits.session_create_per_minute,
            60,
        )

    def check_mutation_rate(self, session: DemoSession) -> None:
        self._limiter.check(
            f"mutate:{session.token_digest}",
            self.limits.mutations_per_minute,
            60,
        )

    def check_upload_rate(self, session: DemoSession) -> None:
        self._limiter.check(
            f"upload:{session.token_digest}",
            self.limits.uploads_per_minute,
            60,
        )

    # ── idempotent, generation-aware commit ───────────────────────────────
    def commit(
        self,
        session_digest: str,
        generation: int,
        operation: str,
        key: UUID,
        payload_digest: str,
        prepare: Callable[[SessionSnapshot], PreparedResult],
        rate_buckets: tuple[tuple[str, int, int], ...] = (),
    ) -> StoredResponse:
        with self._lock:
            session = self._sessions.get(session_digest)
            tombstoned = session_digest in self._tombstones
        if session is None:
            if tombstoned:
                raise SessionExpired("The demo session has expired.")
            raise SessionMissing("No active demo session.")

        cache_key = (operation, str(key))
        wait_target: _Inflight | None = None
        owner = False
        inflight: _Inflight | None = None
        snapshot: SessionSnapshot | None = None

        with session.lock:
            now = self._clock()
            if session.destroyed or session.is_expired(now):
                raise SessionExpired("The demo session has expired.")

            # 1. Idempotent replay: a completed result for this exact key at the
            #    *current* generation is returned verbatim, even when the caller
            #    captured an older generation (a request racing a completed
            #    upload). Replays never rebuild work and never consume quota.
            existing = session.idempotency.get(cache_key)
            if existing is not None and existing[1] == session.generation:
                if existing[0] == payload_digest:
                    return existing[2]
                raise Conflict("Idempotency key reused with a different payload.")

            # 2. An equal in-flight request attaches as a waiter instead of
            #    duplicating parsing; a conflicting payload is a 409.
            pending = session.inflight.get(cache_key)
            if pending is not None:
                if pending.payload_digest != payload_digest:
                    raise Conflict("Idempotency key reused with a different payload.")
                wait_target = pending
            else:
                # 3. New work only commits against the generation it captured.
                if session.generation != generation:
                    raise GenerationStale(
                        "The demo session changed before the request committed."
                    )
                if session.active_ops >= self.limits.max_parallel_ops:
                    raise Busy("Another operation is already in progress for this session.")
                owner = True
                inflight = _Inflight(payload_digest=payload_digest)
                session.inflight[cache_key] = inflight
                session.active_ops += 1
                # Admission charges quota only for a first attempt; a failed
                # prepare refunds it below so only first successes count.
                try:
                    self._charge_rates(rate_buckets)
                except BaseException:
                    session.active_ops -= 1
                    session.inflight.pop(cache_key, None)
                    raise
                snapshot = session.snapshot()

        if not owner:
            assert wait_target is not None
            # Wait for the equal in-flight operation to finish, then mirror it.
            wait_target.event.wait(timeout=self.limits.parse_deadline_seconds + 30)
            # Re-validate *after* the await: the owner may have committed and then
            # the session was reset, expired or replaced before this waiter woke.
            # A replay must never hand back a sensitive result from a state that
            # is no longer current.
            with session.lock:
                now = self._clock()
                if session.destroyed or session.is_expired(now):
                    raise SessionExpired("The demo session has expired.")
                expected = (
                    wait_target.result_generation
                    if wait_target.result_generation is not None
                    else generation
                )
                if session.generation != expected:
                    raise GenerationStale(
                        "The demo session changed before the request committed."
                    )
            if wait_target.error is not None:
                raise wait_target.error
            if wait_target.result is None:
                raise Busy("Another operation is already in progress for this session.")
            return wait_target.result

        assert inflight is not None and snapshot is not None
        applied = False
        try:
            prepared = prepare(snapshot)
            with session.lock:
                now = self._clock()
                if (
                    session.destroyed
                    or session.is_expired(now)
                    or session.generation != generation
                ):
                    raise GenerationStale(
                        "The demo session changed before the request committed."
                    )
                prepared.apply(session)
                applied = True
                # Record the post-apply generation so equal waiters can prove the
                # bump came from this operation rather than a later reset. Cache
                # against the same generation so a replacement atomically
                # invalidates all prior replay entries.
                inflight.result_generation = session.generation
                session.idempotency[cache_key] = (
                    payload_digest,
                    session.generation,
                    prepared.response,
                )
                inflight.result = prepared.response
            return prepared.response
        except BaseException as exc:  # noqa: BLE001 - mirrored to equal waiters
            with session.lock:
                inflight.error = exc
            if not applied:
                self._refund_rates(rate_buckets)
            raise
        finally:
            with session.lock:
                session.active_ops -= 1
                session.inflight.pop(cache_key, None)
                inflight.event.set()

    # ── quota admission: first success only ───────────────────────────────
    def _charge_rates(self, buckets: tuple[tuple[str, int, int], ...]) -> None:
        charged: list[str] = []
        try:
            for key, limit, window in buckets:
                self._limiter.check(key, limit, window)
                charged.append(key)
        except BaseException:
            for key in charged:
                self._limiter.refund(key)
            raise

    def _refund_rates(self, buckets: tuple[tuple[str, int, int], ...]) -> None:
        for key, _limit, _window in buckets:
            self._limiter.refund(key)

    def upload_rate_buckets(self, session: DemoSession) -> tuple[tuple[str, int, int], ...]:
        return (
            (f"mutate:{session.token_digest}", self.limits.mutations_per_minute, 60),
            (f"upload:{session.token_digest}", self.limits.uploads_per_minute, 60),
        )

    def mutation_rate_buckets(self, session: DemoSession) -> tuple[tuple[str, int, int], ...]:
        return ((f"mutate:{session.token_digest}", self.limits.mutations_per_minute, 60),)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def new_id() -> UUID:
    return uuid4()
