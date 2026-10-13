"""Regression tests for the coverai-repair-r2 five-class adversarial repair.

Honest chronology: these tests were authored *after* the corresponding
production repairs had already been written, so this is not a strict test-first
(TDD) suite. Their discriminating power was captured by temporarily reverting
the repaired production files to their pre-repair baseline, running the suite
against that baseline (RED), and restoring the repaired files. Raw RED/GREEN
logs are kept under ``.hermes/coverai-repair-r2/logs``.

Classes covered:
1. failed DELETE reset retains capability and reports unconfirmed deletion
   (client-side; the backend controls are asserted here).
2. concurrent identical upload must converge to one 201 body / one parser call.
3. replay must not consume upload or mutation quota.
4. retrieval window must retain the matched first token at a paragraph boundary.
"""

from __future__ import annotations

import dataclasses
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import demo.store as store_mod
import fixtures
from demo.config import DemoLimits, DemoSettings
from demo.contracts import Document, PageText
from demo.errors import DemoError, InvalidDocument, SessionExpired
from demo.security import digest_capability
from demo.store import DemoStore, PreparedResult, StoredResponse
from demo_app import create_demo_app
from helpers import SessionClient

ORIGIN = "http://localhost:3000"
SESSION_COOKIE = "coverai_demo_session"


# ── helpers ────────────────────────────────────────────────────────────────
def _make_app(**limit_overrides):
    limits = DemoLimits(**limit_overrides)
    settings = DemoSettings(limits=limits)
    store = DemoStore(clock=lambda: datetime.now(timezone.utc), limits=limits)
    app = create_demo_app(store=store, settings=settings)
    return app, store


class _CountingParser:
    def __init__(self, pages=None) -> None:
        self.calls = 0
        self._pages = pages or [
            PageText(page=1, text="Collision damage is excluded.", readable=True)
        ]

    def parse(self, data, limits):  # noqa: ANN001, ARG002
        self.calls += 1
        return list(self._pages)


class _FailOnceParser(_CountingParser):
    def parse(self, data, limits):  # noqa: ANN001
        self.calls += 1
        if self.calls == 1:
            raise InvalidDocument("The file is not a readable PDF.")
        return list(self._pages)


class _BlockingParser(_CountingParser):
    def __init__(self, pages=None) -> None:
        super().__init__(pages)
        self.block = False
        self.entered = threading.Event()
        self.release = threading.Event()

    def parse(self, data, limits):  # noqa: ANN001
        self.calls += 1
        if self.block:
            self.entered.set()
            assert self.release.wait(10)
        return list(self._pages)


class _Signal:
    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()
        self.applied = threading.Event()
        self.calls = 0


def _bumping_prepare(signal: _Signal, body=None):
    """Prepare whose apply mimics a real upload: it increments the generation."""

    def prepare(snapshot):  # noqa: ANN001, ARG001
        signal.calls += 1
        signal.started.set()
        assert signal.release.wait(10)

        def apply(active) -> None:  # noqa: ANN001
            active.generation += 1
            signal.applied.set()

        return PreparedResult(
            StoredResponse(status_code=201, body=body or {"ok": True}), apply
        )

    return prepare


def _seed_document(session, text: str = "Collision damage is excluded.") -> Document:
    document = Document(
        id=uuid4(),
        revision=1,
        filename="policy.pdf",
        page_count=1,
        unreadable_pages=[],
        metadata={},
    )
    session.document = document
    session.pages = [PageText(page=1, text=text, readable=True)]
    return document


# ── class 2: concurrent identical upload converges ─────────────────────────
def test_concurrent_equal_upload_converges_after_owner_generation_bump(store) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    digest = digest_capability(created.token)
    key = uuid4()
    signal = _Signal()
    results: list = []

    def run() -> None:
        try:
            results.append(
                store.commit(
                    digest,
                    session.generation,
                    "upload",
                    key,
                    "same-payload",
                    _bumping_prepare(signal),
                )
            )
        except BaseException as exc:  # noqa: BLE001
            results.append(exc)

    first = threading.Thread(target=run)
    second = threading.Thread(target=run)
    first.start()
    assert signal.started.wait(10)
    second.start()
    time.sleep(0.2)
    signal.release.set()
    first.join(10)
    second.join(10)

    assert signal.calls == 1
    assert len(results) == 2
    assert not any(isinstance(item, BaseException) for item in results)
    assert results[0] is results[1]


def test_concurrent_identical_upload_http_converges_201(app) -> None:
    parser = _BlockingParser()
    app.state.demo_ctx.service.parser = parser
    origin = {"Origin": ORIGIN}

    with TestClient(app) as first_client, TestClient(app) as second_client:
        created = first_client.post(
            "/api/v1/demo/session", json={}, headers=origin
        ).json()
        second_client.cookies.set(
            SESSION_COOKIE, first_client.cookies.get(SESSION_COOKIE)
        )
        key = uuid4()

        def upload(client: TestClient):
            return client.post(
                "/api/v1/demo/policies",
                files={"file": ("synthetic.pdf", b"%PDF-synthetic", "application/pdf")},
                headers={
                    **origin,
                    "X-Demo-CSRF": created["csrf_token"],
                    "Idempotency-Key": str(key),
                },
            )

        parser.block = True
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(upload, first_client)
            assert parser.entered.wait(5)
            second = pool.submit(upload, second_client)
            time.sleep(0.3)
            parser.release.set()
            first_response = first.result(timeout=15)
            second_response = second.result(timeout=15)

    assert first_response.status_code == 201
    assert second_response.status_code == 201
    assert first_response.json()["id"] == second_response.json()["id"]
    assert parser.calls == 1


def test_late_equal_request_racing_completed_upload_returns_cached(store) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    digest = digest_capability(created.token)
    key = uuid4()

    signal = _Signal()
    signal.release.set()
    first = store.commit(
        digest, session.generation, "upload", key, "same", _bumping_prepare(signal)
    )

    def must_not_run(snapshot):  # noqa: ANN001, ARG001
        raise AssertionError("a completed replay must not rebuild the result")

    # The late request captured the *pre-bump* generation and must still be
    # served from the idempotency cache rather than collapsing into a 410.
    second = store.commit(digest, 1, "upload", key, "same", must_not_run)
    assert second is first


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


def test_waiter_refuses_after_subsequent_replacement(store, monkeypatch) -> None:
    created = store.create_session()
    session = store.resolve(created.token)
    digest = digest_capability(created.token)
    key = uuid4()
    events: list = []

    def replacement_after_owner_commit() -> None:
        # Runs inside the waiter's event wait, i.e. after the owner applied but
        # before the waiter re-validates. A different upload replaces the doc.
        replacement_signal = _Signal()
        replacement_signal.release.set()
        store.commit(
            digest,
            session.generation,
            "upload",
            uuid4(),
            "different",
            _bumping_prepare(replacement_signal),
        )

    _install_hooked_inflight(monkeypatch, replacement_after_owner_commit, events)

    signal = _Signal()
    owner_outcome: list = []

    def owner_run() -> None:
        try:
            owner_outcome.append(
                store.commit(
                    digest,
                    session.generation,
                    "upload",
                    key,
                    "same",
                    _bumping_prepare(signal),
                )
            )
        except BaseException as exc:  # noqa: BLE001
            owner_outcome.append(exc)

    owner = threading.Thread(target=owner_run)
    owner.start()
    assert signal.started.wait(10)

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
                    _bumping_prepare(_Signal()),
                )
            )
        except BaseException as exc:  # noqa: BLE001
            waiter_outcome.append(exc)

    waiter = threading.Thread(target=waiter_run)
    waiter.start()
    assert events and events[0].entered.wait(10)

    signal.release.set()
    owner.join(10)
    waiter.join(10)

    assert not any(isinstance(item, BaseException) for item in owner_outcome)
    assert waiter_outcome and isinstance(waiter_outcome[0], DemoError)
    assert waiter_outcome[0].status_code == 410


# ── class 3: replay does not consume quota ─────────────────────────────────
def test_four_identical_uploads_all_201_parser_once(app) -> None:
    parser = _CountingParser()
    app.state.demo_ctx.service.parser = parser
    with TestClient(app) as client:
        session = SessionClient(client)
        session.create()
        key = uuid4()
        responses = [session.upload(b"%PDF-synthetic", key=key) for _ in range(4)]
    assert [response.status_code for response in responses] == [201, 201, 201, 201]
    assert len({response.json()["id"] for response in responses}) == 1
    assert parser.calls == 1


def test_distinct_uploads_hit_configured_quota() -> None:
    app, _store = _make_app(uploads_per_minute=3)
    app.state.demo_ctx.service.parser = _CountingParser()
    with TestClient(app) as client:
        session = SessionClient(client)
        session.create()
        codes = [
            session.upload(b"%PDF-synthetic", key=uuid4()).status_code
            for _ in range(4)
        ]
    assert codes == [201, 201, 201, 429]


def test_invalid_parse_does_not_consume_upload_quota() -> None:
    app, _store = _make_app(uploads_per_minute=1)
    app.state.demo_ctx.service.parser = _FailOnceParser()
    with TestClient(app) as client:
        session = SessionClient(client)
        session.create()
        failed = session.upload(b"%PDF-synthetic", key=uuid4())
        assert failed.status_code == 422
        recovered = session.upload(b"%PDF-synthetic", key=uuid4())
    assert recovered.status_code == 201


def test_mutation_replay_does_not_consume_quota() -> None:
    app, store = _make_app(mutations_per_minute=1)
    with TestClient(app) as client:
        session = SessionClient(client)
        session.create()
        raw = store.resolve(client.cookies.get(SESSION_COOKIE))
        document = _seed_document(raw, "Collision damage to the insured vehicle.")
        key = uuid4()
        narrative = "collision damage to the insured vehicle"
        first = session.explain(str(document.id), document.revision, narrative, key=key)
        replay = session.explain(str(document.id), document.revision, narrative, key=key)
        distinct = session.explain(
            str(document.id), document.revision, narrative, key=uuid4()
        )
    assert first.status_code == 201
    assert replay.status_code == 201
    assert first.json()["id"] == replay.json()["id"]
    assert distinct.status_code == 429


def test_replay_still_requires_origin_and_csrf(app) -> None:
    parser = _CountingParser()
    app.state.demo_ctx.service.parser = parser
    with TestClient(app) as client:
        session = SessionClient(client)
        session.create()
        key = uuid4()
        assert session.upload(b"%PDF-synthetic", key=key).status_code == 201

        no_csrf = session.upload(b"%PDF-synthetic", key=key, csrf=False)
        assert no_csrf.status_code == 403
        no_origin = session.upload(b"%PDF-synthetic", key=key, origin=False)
        assert no_origin.status_code == 403


# ── class 4: retrieval retains the matched first token ─────────────────────
def _first_citation(text: str, narrative: str):
    citations = rank(text, narrative)
    assert citations, "expected at least one citation"
    return citations[0]


def rank(text: str, narrative: str):
    from demo.retrieval import rank_excerpts

    return rank_excerpts([PageText(page=1, text=text, readable=True)], narrative)


def test_window_retains_first_word_at_paragraph_start() -> None:
    text = "Collision " + ("ordinary unrelated text " * 40)
    citation = _first_citation(text, "collision happened outside yesterday")
    assert "collision" in citation.quote.lower()
    assert text[citation.start : citation.end] == citation.quote
    assert len(citation.quote) <= 600


def test_window_retains_first_word_at_second_paragraph_offset() -> None:
    text = "Intro paragraph without any relevant wording.\n\n" + (
        "Collision " + ("ordinary unrelated text " * 40)
    )
    citation = _first_citation(text, "collision happened outside yesterday")
    assert "collision" in citation.quote.lower()
    assert text[citation.start : citation.end] == citation.quote


def test_window_retains_match_at_paragraph_end() -> None:
    text = ("ordinary unrelated text " * 40) + "collision damage clause"
    citation = _first_citation(text, "collision happened outside yesterday")
    assert "collision" in citation.quote.lower()
    assert text[citation.start : citation.end] == citation.quote
    assert len(citation.quote) <= 600


def test_window_retains_match_after_unicode_preamble() -> None:
    text = ("préface café ☕ " * 60) + "Collision damage is excluded"
    citation = _first_citation(text, "collision damage excluded")
    assert "collision" in citation.quote.lower()
    assert text[citation.start : citation.end] == citation.quote
    assert len(citation.quote) <= 600


def test_window_leading_whitespace_retains_match() -> None:
    text = "    Collision " + ("ordinary unrelated text " * 40)
    citation = _first_citation(text, "collision happened outside yesterday")
    assert "collision" in citation.quote.lower()
    assert text[citation.start : citation.end] == citation.quote


def test_window_no_match_abstains() -> None:
    text = "ordinary unrelated wording " * 40
    assert rank(text, "bicycle stolen beach") == []


def test_window_non_overlapping_multi_paragraph() -> None:
    text = "\n\n".join(
        f"Collision paragraph {index} " + ("filler text " * 60) for index in range(4)
    )
    from demo.retrieval import rank_excerpts

    citations = rank_excerpts([PageText(page=1, text=text, readable=True)], "collision")
    assert citations
    spans = sorted((c.start, c.end) for c in citations)
    for (_, end), (start, _) in zip(spans, spans[1:]):
        assert end <= start
    for citation in citations:
        assert "collision" in citation.quote.lower()
        assert len(citation.quote) <= 600


# ── class 1 backend control: DELETE requires CSRF and retains capability ────
def test_delete_wrong_csrf_is_403_and_retains_capability(session_client) -> None:
    session_client.create()
    document = session_client.upload(fixtures.default_policy_pdf()).json()
    rejected = session_client.http.request(
        "DELETE",
        "/api/v1/demo/session",
        headers={"Origin": ORIGIN, "X-Demo-CSRF": "wrong"},
    )
    assert rejected.status_code == 403
    # The capability is retained: the session and its document are still live.
    assert session_client.get_session().status_code == 200
    assert session_client.get_page(document["id"], 1).status_code == 200

    confirmed = session_client.delete_session()
    assert confirmed.status_code == 204
    assert session_client.get_page(document["id"], 1).status_code == 401


def test_reset204_then_old_id_is_401(session_client) -> None:
    session_client.create()
    document = session_client.upload(fixtures.default_policy_pdf()).json()
    assert session_client.delete_session().status_code == 204
    assert session_client.get_page(document["id"], 1).status_code == 401


def test_foreign_page_is_404_and_csrf_is_403(session_client, make_client) -> None:
    session_client.create()
    document = session_client.upload(fixtures.default_policy_pdf()).json()
    other = make_client()
    other.create()
    assert other.get_page(document["id"], 1).status_code == 404
    assert session_client.upload(fixtures.default_policy_pdf(), csrf=False).status_code == 403


def test_expired_page_is_410(session_client, clock) -> None:
    session_client.create()
    document = session_client.upload(fixtures.default_policy_pdf()).json()
    clock.advance(1_801)
    assert session_client.get_page(document["id"], 1).status_code == 410
