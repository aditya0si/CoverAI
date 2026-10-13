"""Regression tests for the coverai-repair-r1 independent review findings.

Every test in this module was written *before* the corresponding repair so that
it fails on the pre-repair tree (RED) and passes afterwards (GREEN). Raw logs are
kept under ``.hermes/coverai-repair-r1/logs``.
"""

from __future__ import annotations

import asyncio
import dataclasses
import threading
from datetime import datetime, timezone
from uuid import uuid4

import pytest

import demo.store as store_mod
from demo.config import DemoLimits, DemoSettings
from demo.contracts import Document, PageText
from demo.errors import DemoError, SessionExpired, ValidationError
from demo.store import DemoStore, PreparedResult, StoredResponse
from demo_app import create_demo_app

SESSION_COOKIE = "coverai_demo_session"
CSRF_HEADER = "X-Demo-CSRF"
ORIGIN = "http://localhost:3000"
MIB = 1024 * 1024


# ── raw ASGI helpers (item 1) ──────────────────────────────────────────────
def _scope(path: str, *, method: str = "POST", headers=None) -> dict:
    base: list[tuple[bytes, bytes]] = [(b"host", b"testserver")]
    if headers:
        base.extend(headers)
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("latin-1"),
        "query_string": b"",
        "root_path": "",
        "headers": base,
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }


class _Recorder:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    async def send(self, message: dict) -> None:
        self.messages.append(message)

    @property
    def status(self) -> int | None:
        return self.messages[0]["status"] if self.messages else None


def _auth_headers(store: DemoStore, origin: str = ORIGIN) -> tuple:
    created = store.create_session()
    headers = [
        (b"origin", origin.encode()),
        (b"cookie", f"{SESSION_COOKIE}={created.token}".encode()),
        (b"x-demo-csrf", created.csrf_token.encode()),
        (b"idempotency-key", str(uuid4()).encode()),
    ]
    return created, headers


def test_unauthenticated_body_is_refused_before_receive(app) -> None:
    cap = app.state.demo_settings.limits.max_request_bytes
    receives = {"count": 0}

    async def receive() -> dict:
        receives["count"] += 1
        return {"type": "http.request", "body": b"x" * (cap + MIB), "more_body": False}

    recorder = _Recorder()
    scope = _scope(
        "/api/v1/demo/policies",
        headers=[(b"content-type", b"multipart/form-data; boundary=x")],
    )
    asyncio.run(app(scope, receive, recorder.send))

    assert recorder.status in (401, 403)
    assert receives["count"] == 0


def test_authenticated_body_over_cap_is_413(app) -> None:
    store = app.state.demo_store
    cap = app.state.demo_settings.limits.max_request_bytes
    _created, headers = _auth_headers(store)
    headers.append((b"content-type", b"application/json"))

    async def receive() -> dict:
        return {"type": "http.request", "body": b"x" * (cap + 1), "more_body": False}

    recorder = _Recorder()
    asyncio.run(app(_scope("/api/v1/demo/explanations", headers=headers), receive, recorder.send))

    assert recorder.status == 413


async def test_concurrent_body_buffering_is_bounded() -> None:
    limits = DemoLimits(max_concurrent_bodies=1)
    settings = DemoSettings(limits=limits)
    store = DemoStore(clock=lambda: datetime.now(timezone.utc), limits=limits)
    app = create_demo_app(store=store, settings=settings)
    _created, headers = _auth_headers(store)

    started = asyncio.Event()
    release = asyncio.Event()

    async def slow_receive() -> dict:
        if not started.is_set():
            started.set()
            return {"type": "http.request", "body": b"a" * 64, "more_body": True}
        await release.wait()
        return {"type": "http.request", "body": b"", "more_body": False}

    first = _Recorder()
    task = asyncio.create_task(
        app(_scope("/api/v1/demo/policies", headers=headers + [(b"content-type", b"multipart/form-data; boundary=x")]), slow_receive, first.send)
    )
    await asyncio.wait_for(started.wait(), timeout=5)

    second = _Recorder()

    async def small_receive() -> dict:
        return {"type": "http.request", "body": b"y" * 16, "more_body": False}

    await asyncio.wait_for(
        app(_scope("/api/v1/demo/handoffs", headers=headers + [(b"content-type", b"application/json")]), small_receive, second.send),
        timeout=5,
    )
    assert second.status in (429, 503)

    release.set()
    await asyncio.wait_for(task, timeout=5)


async def test_receive_deadline_aborts_and_releases_slot() -> None:
    limits = DemoLimits(max_concurrent_bodies=1, receive_deadline_seconds=0.2)
    settings = DemoSettings(limits=limits)
    store = DemoStore(clock=lambda: datetime.now(timezone.utc), limits=limits)
    app = create_demo_app(store=store, settings=settings)
    _created, headers = _auth_headers(store)

    async def stall_receive() -> dict:
        await asyncio.sleep(5)
        return {"type": "http.request", "body": b"", "more_body": False}

    stalled = _Recorder()
    await asyncio.wait_for(
        app(_scope("/api/v1/demo/policies", headers=headers + [(b"content-type", b"multipart/form-data; boundary=x")]), stall_receive, stalled.send),
        timeout=3,
    )
    assert stalled.status in (408, 429, 503, 504)

    second = _Recorder()

    async def small_receive() -> dict:
        return {"type": "http.request", "body": b"y" * 16, "more_body": False}

    await asyncio.wait_for(
        app(_scope("/api/v1/demo/handoffs", headers=headers + [(b"content-type", b"application/json")]), small_receive, second.send),
        timeout=3,
    )
    assert second.status not in (429, 503)


async def test_disconnect_releases_slot() -> None:
    limits = DemoLimits(max_concurrent_bodies=1)
    settings = DemoSettings(limits=limits)
    store = DemoStore(clock=lambda: datetime.now(timezone.utc), limits=limits)
    app = create_demo_app(store=store, settings=settings)
    _created, headers = _auth_headers(store)

    calls = {"n": 0}

    async def disconnect_receive() -> dict:
        calls["n"] += 1
        if calls["n"] == 1:
            return {"type": "http.request", "body": b"a" * 64, "more_body": True}
        return {"type": "http.disconnect"}

    aborted = _Recorder()
    await asyncio.wait_for(
        app(_scope("/api/v1/demo/policies", headers=headers + [(b"content-type", b"multipart/form-data; boundary=x")]), disconnect_receive, aborted.send),
        timeout=3,
    )

    second = _Recorder()

    async def small_receive() -> dict:
        return {"type": "http.request", "body": b"y" * 16, "more_body": False}

    await asyncio.wait_for(
        app(_scope("/api/v1/demo/handoffs", headers=headers + [(b"content-type", b"application/json")]), small_receive, second.send),
        timeout=3,
    )
    assert second.status not in (429, 503)


# ── item 2: atomic lifecycle-aware reads ───────────────────────────────────
def _seed_document(session, text: str = "OLD PAGE", *, doc_id=None) -> Document:
    document = Document(
        id=doc_id or uuid4(),
        revision=1,
        filename="policy.pdf",
        page_count=1,
        unreadable_pages=[],
        metadata={},
    )
    session.document = document
    session.pages = [PageText(page=1, text=text, readable=True)]
    return document


class _TornPages(list):
    """List whose first length/iteration read swaps in replacement state.

    Reproduces a reupload landing between the ``document`` identity check and the
    page indexing read in a non-atomic read path.
    """

    def __init__(self, items, swap) -> None:
        super().__init__(items)
        self._swap = swap
        self._fired = False

    def _fire(self) -> None:
        if not self._fired:
            self._fired = True
            self._swap()

    def __len__(self) -> int:
        self._fire()
        return super().__len__()

    def __iter__(self):
        self._fire()
        return super().__iter__()

    def __getitem__(self, index):
        self._fire()
        return super().__getitem__(index)


def test_page_read_is_atomic_under_reupload(store, app) -> None:
    service = app.state.demo_ctx.service
    created = store.create_session()
    session = store.resolve(created.token)
    document = _seed_document(session, "OLD PAGE")

    def swap() -> None:
        session.document = Document(
            id=uuid4(),
            revision=2,
            filename="replacement.pdf",
            page_count=1,
            unreadable_pages=[],
            metadata={},
        )
        session.pages = [PageText(page=1, text="NEW PAGE", readable=True)]

    session.pages = _TornPages(session.pages, swap)

    page = service.get_page(session, document.id, 1)
    assert page.text == "OLD PAGE"


def test_expiry_barrier_blocks_stale_page_read(store, clock, app) -> None:
    service = app.state.demo_ctx.service
    created = store.create_session()
    session = store.resolve(created.token)
    document = _seed_document(session, "STALE PAGE")
    assert service.get_page(session, document.id, 1).text == "STALE PAGE"

    clock.advance(1_801)
    with pytest.raises(SessionExpired):
        service.get_page(session, document.id, 1)


def test_reset_barrier_blocks_page_read(store, app) -> None:
    service = app.state.demo_ctx.service
    created = store.create_session()
    session = store.resolve(created.token)
    document = _seed_document(session, "SECRET PAGE")

    store.reset(created.token)
    with pytest.raises(SessionExpired):
        service.get_page(session, document.id, 1)


def test_expiry_barrier_blocks_stale_explanation_read(store, clock, app) -> None:
    from demo.contracts import Explanation, Finding

    service = app.state.demo_ctx.service
    created = store.create_session()
    session = store.resolve(created.token)
    explanation = Explanation(
        id=uuid4(),
        document_id=uuid4(),
        document_revision=1,
        mode="deterministic",
        narrative="narrative",
        findings=[Finding(kind="not_found", text="x", citations=[])],
        limitations=[],
        created_at="2026-01-01T00:00:00+00:00",
    )
    session.explanations[str(explanation.id)] = explanation

    clock.advance(1_801)
    with pytest.raises(SessionExpired):
        service.get_explanation(session, explanation.id)


def test_expiry_barrier_blocks_inbox_read(store, clock, app) -> None:
    from demo.store import DemoStore as _Store  # noqa: F401  (type anchoring)

    session = store.resolve(store.create_session().token)
    clock.advance(1_801)
    with pytest.raises(SessionExpired):
        store.read_snapshot(session)


# ── item 3: equal-waiter replay revalidation ───────────────────────────────
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


def _install_hooked_inflight(monkeypatch, after_callback, events):
    class HookedEvent(threading.Event):
        def __init__(self) -> None:
            super().__init__()
            self.entered = threading.Event()

        def wait(self, timeout=None):  # noqa: ANN001
            self.entered.set()
            result = super().wait(timeout)
            after_callback()
            return result

    def factory():
        event = HookedEvent()
        events.append(event)
        return event

    @dataclasses.dataclass
    class HookedInflight(store_mod._Inflight):
        event: threading.Event = dataclasses.field(default_factory=factory)

    monkeypatch.setattr(store_mod, "_Inflight", HookedInflight)


def test_equal_waiter_does_not_return_result_after_reset(store, monkeypatch) -> None:
    from demo.security import digest_capability

    created = store.create_session()
    session = store.resolve(created.token)
    digest = digest_capability(created.token)
    events: list = []
    _install_hooked_inflight(monkeypatch, lambda: store.reset(created.token), events)

    signal = _Signal()
    key = uuid4()
    owner_outcome: list = []

    def owner_run() -> None:
        try:
            owner_outcome.append(
                store.commit(
                    digest, session.generation, "upload", key, "same", _blocking_prepare(signal)
                )
            )
        except BaseException as exc:  # noqa: BLE001
            owner_outcome.append(exc)

    owner = threading.Thread(target=owner_run)
    owner.start()
    assert signal.started.wait(10)
    assert events

    waiter_outcome: list = []

    def waiter_run() -> None:
        try:
            waiter_outcome.append(
                store.commit(
                    digest,
                    session.generation,
                    "upload",
                    key,
                    "same",
                    _blocking_prepare(_Signal()),
                )
            )
        except BaseException as exc:  # noqa: BLE001
            waiter_outcome.append(exc)

    waiter = threading.Thread(target=waiter_run)
    waiter.start()
    assert events[0].entered.wait(10)

    signal.release.set()
    owner.join(10)
    waiter.join(10)

    assert not isinstance(owner_outcome[0], BaseException)
    assert waiter_outcome and isinstance(waiter_outcome[0], SessionExpired)


def test_equal_waiter_does_not_return_result_after_generation_change(store, monkeypatch) -> None:
    from demo.security import digest_capability

    created = store.create_session()
    session = store.resolve(created.token)
    digest = digest_capability(created.token)
    events: list = []
    _install_hooked_inflight(monkeypatch, session.clear_contents, events)

    signal = _Signal()
    key = uuid4()
    owner_outcome: list = []
    waiter_outcome: list = []

    def owner_run() -> None:
        try:
            owner_outcome.append(
                store.commit(
                    digest, session.generation, "upload", key, "same", _blocking_prepare(signal)
                )
            )
        except BaseException as exc:  # noqa: BLE001
            owner_outcome.append(exc)

    owner = threading.Thread(target=owner_run)
    owner.start()
    assert signal.started.wait(10)
    assert events

    def waiter_run() -> None:
        try:
            waiter_outcome.append(
                store.commit(
                    digest,
                    session.generation,
                    "upload",
                    key,
                    "same",
                    _blocking_prepare(_Signal()),
                )
            )
        except BaseException as exc:  # noqa: BLE001
            waiter_outcome.append(exc)

    waiter = threading.Thread(target=waiter_run)
    waiter.start()
    assert events[0].entered.wait(10)

    signal.release.set()
    owner.join(10)
    waiter.join(10)

    assert waiter_outcome and isinstance(waiter_outcome[0], DemoError)
    assert waiter_outcome[0].status_code == 410


# ── item 4: extraction stops at first cumulative exceedance ─────────────────
def test_extraction_stops_at_first_cumulative_exceedance() -> None:
    from demo.extraction import _do_extract

    class _Page:
        def get_text(self, kind: str) -> str:  # noqa: ARG002
            return "x" * 10

    class _Doc:
        def __init__(self) -> None:
            self.loaded: list[int] = []
            self.page_count = 3
            self.needs_pass = False

        def load_page(self, index: int):
            self.loaded.append(index)
            return _Page()

        def close(self) -> None:
            pass

    doc = _Doc()

    class _FakeFitz:
        @staticmethod
        def open(stream, filetype):  # noqa: ANN001, ARG004
            return doc

    with pytest.raises(ValidationError):
        _do_extract(_FakeFitz, b"%PDF-1.4", max_pages=50, max_chars=5)

    assert doc.loaded == [0]


def test_extraction_allows_text_exactly_at_max_chars() -> None:
    from demo.extraction import _do_extract

    class _Page:
        def get_text(self, kind: str) -> str:  # noqa: ARG002
            return "x" * 10

    class _Doc:
        def __init__(self) -> None:
            self.loaded: list[int] = []
            self.page_count = 3
            self.needs_pass = False

        def load_page(self, index: int):
            self.loaded.append(index)
            return _Page()

        def close(self) -> None:
            pass

    doc = _Doc()

    class _FakeFitz:
        @staticmethod
        def open(stream, filetype):  # noqa: ANN001, ARG004
            return doc

    pages = _do_extract(_FakeFitz, b"%PDF-1.4", max_pages=50, max_chars=30)
    assert len(pages) == 3
    assert doc.loaded == [0, 1, 2]
