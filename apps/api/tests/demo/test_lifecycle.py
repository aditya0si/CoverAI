"""Lifecycle, concurrency and boundary repairs (review findings).

These tests reproduce each finding: generation-aware commit that builds outside
the session lock, expiry tombstones returning 410 after purge, bounded rate
limiter cleanup, exact Origin matching, and strict upload media/signature rules.
"""

from __future__ import annotations

import threading
from uuid import uuid4

import pytest

import fixtures
from demo.errors import DemoError, SessionExpired, SessionMissing, UnsupportedMedia
from demo.security import digest_capability
from demo.store import PreparedResult, DemoStore, StoredResponse


class _Signal:
    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()
        self.applied = threading.Event()
        self.calls = 0


def _blocking_prepare(signal: _Signal):
    def prepare(snapshot):  # noqa: ANN001
        signal.calls += 1
        signal.started.set()
        assert signal.release.wait(10)

        def apply(_active) -> None:  # noqa: ANN001
            signal.applied.set()

        return PreparedResult(StoredResponse(status_code=201, body={"ok": True}), apply)

    return prepare


# ── tombstones / expiry ────────────────────────────────────────────────────
def test_expired_capability_after_purge_returns_410(store: DemoStore, clock) -> None:
    created = store.create_session()
    clock.advance(1_801)

    assert store.purge_expired() >= 1
    assert store.live_session_count == 0
    assert store.tombstone_count >= 1

    with pytest.raises(SessionExpired):
        store.resolve(created.token)


def test_reset_capability_returns_401_not_410(store: DemoStore) -> None:
    created = store.create_session()
    store.reset(created.token)
    with pytest.raises(SessionMissing):
        store.resolve(created.token)


def test_http_expired_after_purge_is_410(session_client, store: DemoStore, clock) -> None:
    session_client.create()
    clock.advance(1_801)
    store.purge_expired()
    assert session_client.get_session().status_code == 410


def test_tombstones_are_bounded(store: DemoStore, clock) -> None:
    now = clock.now()
    with store._lock:  # noqa: SLF001 - exercising the bound directly
        for index in range(store._max_tombstones + 25):  # noqa: SLF001
            store._tombstone_locked(f"digest-{index}", now)  # noqa: SLF001
    assert store.tombstone_count <= store._max_tombstones  # noqa: SLF001


# ── rate limiter cleanup ───────────────────────────────────────────────────
def test_purge_clears_per_session_rate_keys(store: DemoStore, clock) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    store.check_mutation_rate(session)
    store.check_upload_rate(session)
    keys = store.rate_limiter.active_keys()
    assert f"mutate:{session.token_digest}" in keys
    assert f"upload:{session.token_digest}" in keys

    clock.advance(1_801)
    store.purge_expired()
    keys = store.rate_limiter.active_keys()
    assert f"mutate:{session.token_digest}" not in keys
    assert f"upload:{session.token_digest}" not in keys


def test_reset_clears_per_session_rate_keys(store: DemoStore) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    store.check_mutation_rate(session)
    store.reset(created.token)
    assert f"mutate:{session.token_digest}" not in store.rate_limiter.active_keys()


# ── concurrent commit semantics ────────────────────────────────────────────
def test_concurrent_equal_commit_runs_once_same_result(store: DemoStore) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    digest = digest_capability(created.token)
    signal = _Signal()
    key = uuid4()
    results: list[StoredResponse] = []

    def run() -> None:
        results.append(
            store.commit(
                digest,
                session.generation,
                "upload",
                key,
                "same-payload",
                _blocking_prepare(signal),
            )
        )

    first = threading.Thread(target=run)
    second = threading.Thread(target=run)
    first.start()
    assert signal.started.wait(10)
    second.start()
    signal.release.set()
    first.join(10)
    second.join(10)

    assert signal.calls == 1
    assert len(results) == 2
    assert results[0] is results[1]


def test_conflicting_payload_while_inflight_is_409(store: DemoStore) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    digest = digest_capability(created.token)
    signal = _Signal()
    key = uuid4()

    def run() -> None:
        store.commit(
            digest,
            session.generation,
            "upload",
            key,
            "payload-a",
            _blocking_prepare(signal),
        )

    owner = threading.Thread(target=run)
    owner.start()
    assert signal.started.wait(10)
    try:
        from demo.errors import Conflict

        with pytest.raises(Conflict):
            store.commit(
                digest,
                session.generation,
                "upload",
                key,
                "payload-b",
                _blocking_prepare(_Signal()),
            )
    finally:
        signal.release.set()
        owner.join(10)


def test_other_operation_while_inflight_is_busy(store: DemoStore) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    digest = digest_capability(created.token)
    signal = _Signal()

    def run() -> None:
        store.commit(
            digest,
            session.generation,
            "upload",
            uuid4(),
            "payload-a",
            _blocking_prepare(signal),
        )

    owner = threading.Thread(target=run)
    owner.start()
    assert signal.started.wait(10)
    try:
        from demo.errors import Busy

        with pytest.raises(Busy):
            store.commit(
                digest,
                session.generation,
                "explain",
                uuid4(),
                "payload-b",
                _blocking_prepare(_Signal()),
            )
    finally:
        signal.release.set()
        owner.join(10)


def test_reset_during_prepare_does_not_resurrect(store: DemoStore) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    digest = digest_capability(created.token)
    signal = _Signal()
    outcome: list[BaseException] = []

    def run() -> None:
        try:
            store.commit(
                digest,
                session.generation,
                "upload",
                uuid4(),
                "payload",
                _blocking_prepare(signal),
            )
        except BaseException as exc:  # noqa: BLE001
            outcome.append(exc)

    owner = threading.Thread(target=run)
    owner.start()
    assert signal.started.wait(10)
    store.reset(created.token)
    signal.release.set()
    owner.join(10)

    assert outcome and isinstance(outcome[0], DemoError)
    assert outcome[0].status_code == 410
    assert not signal.applied.is_set()


def test_expiry_during_prepare_does_not_commit(store: DemoStore, clock) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    digest = digest_capability(created.token)
    signal = _Signal()
    outcome: list[BaseException] = []

    def run() -> None:
        try:
            store.commit(
                digest,
                session.generation,
                "explain",
                uuid4(),
                "payload",
                _blocking_prepare(signal),
            )
        except BaseException as exc:  # noqa: BLE001
            outcome.append(exc)

    owner = threading.Thread(target=run)
    owner.start()
    assert signal.started.wait(10)
    clock.advance(1_801)
    signal.release.set()
    owner.join(10)

    assert outcome and isinstance(outcome[0], DemoError)
    assert outcome[0].status_code == 410
    assert not signal.applied.is_set()


# ── exact Origin ───────────────────────────────────────────────────────────
def test_origin_trailing_slash_is_rejected(session_client) -> None:
    rejected = session_client.create(origin="http://localhost:3000/")
    assert rejected.status_code == 403


def test_origin_trailing_slash_rejected_on_mutation(session_client) -> None:
    session_client.create()
    response = session_client.upload(
        fixtures.default_policy_pdf(), origin=False, extra={"Origin": "http://localhost:3000/"}
    )
    assert response.status_code == 403


# ── strict upload media / signature ────────────────────────────────────────
def test_upload_requires_mime_type(app, store: DemoStore) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    service = app.state.demo_ctx.service
    with pytest.raises(UnsupportedMedia):
        service.upload(session, fixtures.default_policy_pdf(), "policy.pdf", None, uuid4())


def test_upload_signature_must_be_at_start(app, store: DemoStore) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    service = app.state.demo_ctx.service
    with pytest.raises(DemoError):
        service.upload(
            session,
            b"x%PDF-1.4 not at start",
            "policy.pdf",
            "application/pdf",
            uuid4(),
        )
