"""M1.1 session ownership, cookie policy, CSRF/Origin and lifecycle tests."""

from __future__ import annotations

import os
import subprocess
import sys
from uuid import uuid4

import fixtures

API_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_session_needs_no_production_settings() -> None:
    env = {
        key: value
        for key, value in os.environ.items()
        if key
        not in {"DATABASE_URL", "REDIS_URL", "GEMINI_API_KEY", "JWT_SECRET", "STORAGE_BUCKET"}
    }
    env["PYTHONPATH"] = API_ROOT + os.pathsep + env.get("PYTHONPATH", "")
    code = (
        "import demo_app; "
        "app = demo_app.create_demo_app(); "
        "paths = {r.path for r in app.routes}; "
        "assert '/api/v1/demo/session' in paths; "
        "print('demo-import-ok')"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert result.returncode == 0, result.stderr
    assert "demo-import-ok" in result.stdout


def test_cookie_flags_and_path(session_client) -> None:
    response = session_client.create()
    assert response.status_code == 201
    set_cookie = response.headers.get("set-cookie", "")
    lowered = set_cookie.lower()
    assert "coverai_demo_session=" in set_cookie
    assert "httponly" in lowered
    assert "samesite=strict" in lowered
    assert "path=/api/v1/demo" in lowered
    assert "max-age=1800" in lowered
    assert "secure" not in lowered  # local HTTP development omits Secure

    body = response.json()
    assert body["mode"] == "deterministic"
    assert body["csrf_token"]

    token = set_cookie.split("coverai_demo_session=")[1].split(";")[0]
    assert token
    assert token not in response.text


def test_origin_csrf_rejected(session_client) -> None:
    rejected = session_client.create(origin="http://evil.example")
    assert rejected.status_code == 403

    session_client.create()
    no_csrf = session_client.upload(fixtures.default_policy_pdf(), csrf=False)
    assert no_csrf.status_code == 403

    no_origin = session_client.upload(fixtures.default_policy_pdf(), origin=False)
    assert no_origin.status_code == 403


def test_independent_clients_distinct(make_client, session_client) -> None:
    session_client.create()
    first = session_client.get_session().json()["csrf_token"]
    other = make_client()
    other.create()
    second = other.get_session().json()["csrf_token"]
    assert first != second


def test_foreign_id_is_404(session_client, make_client) -> None:
    session_client.create()
    document = session_client.upload(fixtures.default_policy_pdf()).json()
    other = make_client()
    other.create()

    assert other.get_page(document["id"], 1).status_code == 404
    assert (
        other.explain(
            document["id"],
            document["revision"],
            "my car suffered accidental external damage in a collision",
        ).status_code
        == 404
    )


def test_reset_invalidates_all_state(session_client) -> None:
    session_client.create()
    document = session_client.upload(fixtures.default_policy_pdf()).json()
    explanation = session_client.explain(
        document["id"], document["revision"], "accidental external damage to my parked car"
    ).json()
    assert session_client.get_session().status_code == 200

    reset = session_client.delete_session()
    assert reset.status_code == 204

    assert session_client.get_session().status_code == 401
    assert session_client.get_explanation(explanation["id"]).status_code == 401
    assert session_client.get_page(document["id"], 1).status_code == 401


def test_fixed_ttl_no_extension(session_client, clock) -> None:
    session_client.create()
    clock.advance(1000)
    assert session_client.get_session().status_code == 200  # no sliding extension
    clock.advance(799)
    assert session_client.get_session().status_code == 200  # t+1799
    clock.advance(1)
    assert session_client.get_session().status_code == 410  # exactly t+1800


def test_contract_rejects_unknown_fields(session_client) -> None:
    session_client.create()
    response = session_client.http.post(
        "/api/v1/demo/explanations",
        json={
            "document_id": str(uuid4()),
            "document_revision": 1,
            "narrative": "a" * 30,
            "mode": "deterministic",
            "unexpected": True,
        },
        headers=session_client.headers(csrf=True, origin=True, key=uuid4()),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_get_session_supplies_csrf_without_persistence(session_client) -> None:
    created = session_client.create().json()
    view = session_client.get_session().json()
    assert view["csrf_token"] == created["csrf_token"]
    assert view["document"] is None
    assert "coverai_demo_session" not in session_client.get_session().text


def test_missing_idempotency_key_is_400(session_client) -> None:
    session_client.create()
    response = session_client.http.post(
        "/api/v1/demo/policies",
        files={"file": ("policy.pdf", fixtures.default_policy_pdf(), "application/pdf")},
        headers=session_client.headers(csrf=True, origin=True),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IDEMPOTENCY_KEY"
