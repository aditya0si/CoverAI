#!/usr/bin/env python
"""Runnable corrected adversarial probe for the coverai-repair-r2 five classes.

This is the repo-local, standalone equivalent of the historical scratch harness
in ``.hermes/coverai-repair-r2/adversarial-context.md``. It preserves the original
attack *inputs* (synthetic PDF bytes, an Idempotency-Key reused for replays, a
second independent session reading a foreign page, a wrong-CSRF mutation, a
clock advance past the fixed TTL, a confirmed reset, and the paragraph-boundary
narrative ``collision happened outside yesterday``) but *inverts and strengthens*
the historical assertions:

* concurrent equal uploads converge to ``201``/``201`` with byte-identical JSON
  and exactly one parser call (historically asserted ``201``/``410``);
* four identical uploads are all ``201`` (historically ``[201,201,201,429]``);
* a foreign page is ``404``, a wrong CSRF is ``403``, an expired page is ``410``
  and a confirmed reset is ``204`` then the old id is ``401``;
* the paragraph-boundary quote *retains* the matched first word and its exact
  code-point offsets (historically asserted the match was lost).

It never runs the original bug assertions as acceptance. Run standalone (it is
intentionally not named ``test_*.py`` so pytest does not collect it)::

    cd apps/api
    poetry run python tests/demo/adversarial_probe_r2.py

Exits ``0`` only when every corrected assertion holds, otherwise ``1``.
"""

from __future__ import annotations

import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

sys.dont_write_bytecode = True

_API_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _API_ROOT not in sys.path:
    sys.path.insert(0, _API_ROOT)

from fastapi.testclient import TestClient  # noqa: E402

from demo.config import DemoSettings  # noqa: E402
from demo.contracts import PageText  # noqa: E402
from demo.retrieval import rank_excerpts  # noqa: E402
from demo.store import DemoStore  # noqa: E402
from demo_app import create_demo_app  # noqa: E402

ORIGIN = {"Origin": "http://localhost:3000"}
SESSION_COOKIE = "coverai_demo_session"
PDF_BYTES = b"%PDF-synthetic"
PARSED_TEXT = "Collision damage is excluded. Policy number: SYNTHETIC"
NARRATIVE = "collision happened outside yesterday"
BOUNDARY_TEXT = "Collision " + ("ordinary unrelated text " * 40)

_failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> bool:
    line = f"{'PASS' if condition else 'FAIL'} {name}"
    if detail:
        line = f"{line} :: {detail}"
    print(line, flush=True)
    if not condition:
        _failures.append(name)
    return condition


class _Parser:
    """Controllable fake parser (the real parser is exercised by the suite)."""

    def __init__(self) -> None:
        self.calls = 0
        self.block = False
        self.entered = threading.Event()
        self.release = threading.Event()

    def parse(self, data, limits):  # noqa: ANN001, ARG002
        self.calls += 1
        if self.block:
            self.entered.set()
            assert self.release.wait(10)
        return [PageText(page=1, text=PARSED_TEXT, readable=True)]


def _probe_http() -> None:
    now = [datetime(2026, 10, 13, tzinfo=timezone.utc)]
    settings = DemoSettings()
    store = DemoStore(lambda: now[0], settings.limits)
    app = create_demo_app(store=store, settings=settings)
    parser = _Parser()
    app.state.demo_ctx.service.parser = parser

    def upload(client, key, csrf):
        return client.post(
            "/api/v1/demo/policies",
            files={"file": ("synthetic.pdf", PDF_BYTES, "application/pdf")},
            headers={
                **ORIGIN,
                "X-Demo-CSRF": csrf,
                "Idempotency-Key": str(key),
            },
        )

    with TestClient(app) as owner, TestClient(app) as equal, TestClient(app) as foreign:
        ca = owner.post("/api/v1/demo/session", json={}, headers=ORIGIN).json()
        foreign.post("/api/v1/demo/session", json={}, headers=ORIGIN)
        # The equal client shares the owner's capability to exercise a genuine
        # concurrent in-flight dedup rather than two unrelated sessions.
        equal.cookies.set(SESSION_COOKIE, owner.cookies.get(SESSION_COOKIE))

        # ── class 2: concurrent identical upload converges to 201/201 ──────
        key = uuid4()
        parser.calls = 0
        parser.block = True
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                first = pool.submit(upload, owner, key, ca["csrf_token"])
                assert parser.entered.wait(5), "parser never entered"
                second = pool.submit(upload, equal, key, ca["csrf_token"])
                time.sleep(0.3)
                parser.release.set()
                r1 = first.result(timeout=30)
                r2 = second.result(timeout=30)
        finally:
            parser.block = False

        check(
            "concurrent_equal_upload_is_201_201",
            r1.status_code == 201 and r2.status_code == 201,
            f"codes={r1.status_code},{r2.status_code}",
        )
        check(
            "concurrent_equal_upload_identical_json",
            r1.json() == r2.json(),
            f"ids={r1.json().get('id')},{r2.json().get('id')}",
        )
        check(
            "concurrent_equal_upload_parser_called_once",
            parser.calls == 1,
            f"calls={parser.calls}",
        )

        # ── class 3: four identical replays are all 201, one parse ─────────
        ca = owner.post("/api/v1/demo/session", json={}, headers=ORIGIN).json()
        replay_key = uuid4()
        parser.calls = 0
        results = [upload(owner, replay_key, ca["csrf_token"]) for _ in range(4)]
        codes = [response.status_code for response in results]
        check("four_identical_replays_all_201", codes == [201, 201, 201, 201], f"codes={codes}")
        check(
            "four_identical_replays_parser_once",
            parser.calls == 1,
            f"calls={parser.calls}",
        )
        document = results[0].json()

        # ── class 1/5 controls: foreign / CSRF / expiry / reset ────────────
        foreign_page = foreign.get(f"/api/v1/demo/policies/{document['id']}/pages/1")
        check("foreign_page_is_404", foreign_page.status_code == 404, f"code={foreign_page.status_code}")

        wrong_csrf = upload(owner, uuid4(), "wrong")
        check("wrong_csrf_is_403", wrong_csrf.status_code == 403, f"code={wrong_csrf.status_code}")

        now[0] += timedelta(seconds=1_800)
        expired = owner.get(f"/api/v1/demo/policies/{document['id']}/pages/1")
        check("expired_page_is_410", expired.status_code == 410, f"code={expired.status_code}")

        ca = owner.post("/api/v1/demo/session", json={}, headers=ORIGIN).json()
        reset_doc = upload(owner, uuid4(), ca["csrf_token"]).json()
        reset_response = owner.delete(
            "/api/v1/demo/session",
            headers={**ORIGIN, "X-Demo-CSRF": ca["csrf_token"]},
        )
        check("reset_is_204", reset_response.status_code == 204, f"code={reset_response.status_code}")
        old_page = owner.get(f"/api/v1/demo/policies/{reset_doc['id']}/pages/1")
        check("old_id_after_reset_is_401", old_page.status_code == 401, f"code={old_page.status_code}")


def _probe_citation() -> None:
    citations = rank_excerpts(
        [PageText(page=1, text=BOUNDARY_TEXT, readable=True)], NARRATIVE
    )
    check("boundary_quote_present", bool(citations), f"count={len(citations)}")
    if citations:
        citation = citations[0]
        check(
            "boundary_quote_retains_collision",
            "collision" in citation.quote.lower(),
            f"quote={citation.quote[:40]!r}",
        )
        check(
            "boundary_quote_exact_offsets",
            BOUNDARY_TEXT[citation.start : citation.end] == citation.quote,
            f"start={citation.start} end={citation.end}",
        )
        check(
            "boundary_quote_within_600",
            len(citation.quote) <= 600,
            f"len={len(citation.quote)}",
        )


def main() -> int:
    print("== coverai-repair-r2 corrected adversarial probe ==", flush=True)
    _probe_http()
    _probe_citation()
    print("--", flush=True)
    if _failures:
        print(f"RESULT FAIL ({len(_failures)}): {', '.join(_failures)}", flush=True)
        return 1
    print("RESULT PASS (0 failures)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
