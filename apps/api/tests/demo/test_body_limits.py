"""Regression tests for the pure-ASGI request byte cap.

These drive the ASGI application directly with a hand-built ``receive`` stream so
that a body can be sent without a truthful ``Content-Length`` (the chunked case
FastAPI's multipart parser would otherwise spool to disk unbounded).
"""

from __future__ import annotations

import asyncio
import json

import fixtures

MIB = 1024 * 1024


def _scope(path: str, *, headers: list[tuple[bytes, bytes]] | None = None) -> dict:
    base: list[tuple[bytes, bytes]] = [(b"host", b"testserver")]
    if headers:
        base.extend(headers)
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("latin-1"),
        "query_string": b"",
        "root_path": "",
        "headers": base,
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }


def _chunks(total: int, size: int = MIB) -> list[dict]:
    messages: list[dict] = []
    remaining = total
    while remaining > 0:
        count = min(size, remaining)
        remaining -= count
        messages.append(
            {"type": "http.request", "body": b"x" * count, "more_body": remaining > 0}
        )
    if not messages:
        messages.append({"type": "http.request", "body": b"", "more_body": False})
    return messages


def _drive(app, scope: dict, messages: list[dict]) -> list[dict]:
    sent: list[dict] = []
    queue = list(messages)

    async def receive() -> dict:
        if queue:
            return queue.pop(0)
        return {"type": "http.disconnect"}

    async def send(message: dict) -> None:
        sent.append(message)

    asyncio.run(app(scope, receive, send))
    return sent


def _auth_headers(app) -> list[tuple[bytes, bytes]]:
    """Valid session/CSRF/Origin headers so the pre-auth body guard admits us."""
    store = app.state.demo_store
    created = store.create_session()
    return [
        (b"origin", b"http://localhost:3000"),
        (b"cookie", f"coverai_demo_session={created.token}".encode()),
        (b"x-demo-csrf", created.csrf_token.encode()),
        (b"idempotency-key", b"00000000-0000-0000-0000-000000000000"),
    ]


def _status(sent: list[dict]) -> int:
    assert sent and sent[0]["type"] == "http.response.start"
    return sent[0]["status"]


def _headers(sent: list[dict]) -> dict[str, str]:
    return {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in sent[0]["headers"]}


def _body(sent: list[dict]) -> bytes:
    return b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")


def test_chunked_body_without_length_beyond_cap_is_413(app) -> None:
    cap = app.state.demo_settings.limits.max_request_bytes
    scope = _scope(
        "/api/v1/demo/explanations",
        headers=_auth_headers(app) + [(b"content-type", b"application/json")],
    )
    sent = _drive(app, scope, _chunks(cap + MIB))

    assert _status(sent) == 413
    assert json.loads(_body(sent))["error"]["code"] == "PAYLOAD_TOO_LARGE"
    headers = _headers(sent)
    assert headers["cache-control"] == "no-store"
    assert headers["x-request-id"]


def test_misleading_small_content_length_beyond_cap_is_413(app) -> None:
    cap = app.state.demo_settings.limits.max_request_bytes
    scope = _scope(
        "/api/v1/demo/explanations",
        headers=_auth_headers(app)
        + [(b"content-type", b"application/json"), (b"content-length", b"10")],
    )
    sent = _drive(app, scope, _chunks(cap + MIB))

    assert _status(sent) == 413
    assert json.loads(_body(sent))["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_declared_length_over_cap_is_413(app) -> None:
    cap = app.state.demo_settings.limits.max_request_bytes
    scope = _scope(
        "/api/v1/demo/explanations",
        headers=_auth_headers(app)
        + [(b"content-type", b"application/json"), (b"content-length", str(cap + 1).encode())],
    )
    sent = _drive(
        app, scope, [{"type": "http.request", "body": b"", "more_body": False}]
    )

    assert _status(sent) == 413


def test_body_exactly_at_cap_is_not_rejected_by_cap(app) -> None:
    cap = app.state.demo_settings.limits.max_request_bytes
    sent = _drive(app, _scope("/api/v1/demo/cap-probe"), _chunks(cap))

    # The cap admits bodies up to and including the limit; routing decides the rest.
    assert _status(sent) == 404


def test_oversized_multipart_envelope_beyond_cap_is_413(app) -> None:
    cap = app.state.demo_settings.limits.max_request_bytes
    boundary = "----demo-body-cap"
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
        f'filename="policy.pdf"\r\nContent-Type: application/pdf\r\n\r\n'
    ).encode("latin-1") + b"%PDF-" + b"0" * cap + f"\r\n--{boundary}--\r\n".encode("latin-1")
    scope = _scope(
        "/api/v1/demo/policies",
        headers=[
            (b"content-type", f"multipart/form-data; boundary={boundary}".encode("latin-1")),
            *_auth_headers(app),
        ],
    )
    sent = _drive(app, scope, _chunks(len(body)))

    assert _status(sent) == 413
    assert json.loads(_body(sent))["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_oversized_upload_part_is_413(session_client) -> None:
    session_client.create()
    oversized = b"%PDF-" + b"0" * (10 * MIB + 64)
    response = session_client.upload(oversized)

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"
    assert response.headers["cache-control"] == "no-store"


def test_valid_upload_still_parses_in_memory(session_client) -> None:
    session_client.create()
    response = session_client.upload(fixtures.default_policy_pdf())

    assert response.status_code == 201
    assert response.json()["page_count"] == 3
