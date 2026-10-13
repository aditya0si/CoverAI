"""Capability tokens, cookie policy, origin/CSRF checks and rate limiting."""

from __future__ import annotations

import hashlib
import secrets
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Callable, Iterable

from fastapi import Request

from .errors import Forbidden, RateLimited

SESSION_COOKIE = "coverai_demo_session"
SESSION_COOKIE_PATH = "/api/v1/demo"
CSRF_HEADER = "X-Demo-CSRF"


def new_capability() -> str:
    """256-bit URL-safe random capability."""
    return secrets.token_urlsafe(32)


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def digest_capability(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def sha256_hex(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def check_origin(request: Request, allowed_origins: Iterable[str]) -> None:
    """Require an exact, allowlisted Origin header for mutating requests.

    The comparison is byte-exact: no trailing-slash normalisation is applied, so a
    variant origin such as ``http://localhost:3000/`` is rejected.
    """
    origin = request.headers.get("origin")
    if not origin:
        raise Forbidden("A valid Origin header is required.")
    if origin not in set(allowed_origins):
        raise Forbidden("Origin is not allowed for demo requests.")


def check_csrf(request: Request, expected: str) -> None:
    supplied = request.headers.get(CSRF_HEADER)
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise Forbidden("Missing or invalid CSRF token.")


def client_ip(request: Request) -> str:
    """Trust only the transport-level peer address; never forwarded headers."""
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


class RateLimiter:
    """Fixed-window-ish sliding limiter backed by a bounded deque per key."""

    def __init__(self, clock: Callable[[], datetime]) -> None:
        self._clock = clock
        self._events: dict[str, deque[datetime]] = defaultdict(deque)

    def _prune(self, key: str, window_seconds: int, now: datetime) -> deque[datetime]:
        events = self._events[key]
        cutoff = now - timedelta(seconds=window_seconds)
        while events and events[0] <= cutoff:
            events.popleft()
        return events

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = self._clock()
        events = self._prune(key, window_seconds, now)
        if len(events) >= limit:
            retry_after = window_seconds
            if events:
                retry_after = max(
                    1, int((events[0] + timedelta(seconds=window_seconds) - now).total_seconds())
                )
            raise RateLimited(
                "Too many requests. Please retry shortly.", retry_after=retry_after
            )
        events.append(now)

    def reset(self, key: str) -> None:
        self._events.pop(key, None)

    def refund(self, key: str) -> None:
        """Remove the most recently recorded event for ``key``.

        Used to undo an admission charge when the mutation never successfully
        commits (e.g. a parser failure), so only first successes consume quota.
        Callers serialise per-session charges, so the last event is ours.
        """
        events = self._events.get(key)
        if events:
            events.pop()

    def forget(self, key: str) -> None:
        """Drop a single key (used when a session is purged or reset)."""
        self._events.pop(key, None)

    def forget_prefix(self, prefix: str) -> None:
        for key in [k for k in self._events if k.startswith(prefix)]:
            self._events.pop(key, None)

    def sweep(self, now: datetime, *, max_idle_seconds: int = 3_600) -> None:
        """Bound the key map by dropping empty/stale keys.

        Per-session keys are removed explicitly on purge/reset; this sweep is a
        backstop for per-IP and any other keys that would otherwise accumulate.
        """
        for key in list(self._events.keys()):
            events = self._events[key]
            if not events:
                self._events.pop(key, None)
                continue
            if now - events[-1] > timedelta(seconds=max_idle_seconds):
                self._events.pop(key, None)

    def active_keys(self) -> set[str]:
        return set(self._events.keys())

    def clear(self) -> None:
        self._events.clear()
