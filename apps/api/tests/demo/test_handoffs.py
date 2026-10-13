"""M1.3 simulated handoff and inbox behaviour."""

from __future__ import annotations

from uuid import uuid4

import fixtures

NARRATIVE = "my car had accidental external damage after a collision"


def _prepare(session_client):
    session_client.create()
    document = session_client.upload(fixtures.default_policy_pdf()).json()
    explanation = session_client.explain(
        document["id"], document["revision"], NARRATIVE
    ).json()
    return document, explanation


def test_handoff_two_simulated_entries(session_client) -> None:
    _document, explanation = _prepare(session_client)
    response = session_client.handoff(explanation["id"])
    assert response.status_code == 201
    handoff = response.json()
    assert handoff["simulated"] is True
    assert handoff["status"] == "simulated_created"
    assert handoff["mechanic"]["recipient"] == "simulated_mechanic"
    assert handoff["officer"]["recipient"] == "simulated_officer"
    assert handoff["mechanic"]["citations"]
    assert handoff["officer"]["citations"]

    mechanic = session_client.get_inbox("mechanic").json()
    officer = session_client.get_inbox("officer").json()
    assert mechanic["simulated"] is True
    assert len(mechanic["entries"]) == 1
    assert len(officer["entries"]) == 1


def test_repeat_same_key_same_response(session_client) -> None:
    _document, explanation = _prepare(session_client)
    key = uuid4()
    first = session_client.handoff(explanation["id"], key=key)
    second = session_client.handoff(explanation["id"], key=key)
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]


def test_same_key_different_payload_409(session_client) -> None:
    document, first_explanation = _prepare(session_client)
    second_explanation = session_client.explain(
        document["id"], document["revision"], "third party property damage to another vehicle"
    ).json()

    key = uuid4()
    assert session_client.handoff(first_explanation["id"], key=key).status_code == 201
    conflict = session_client.handoff(second_explanation["id"], key=key)
    assert conflict.status_code == 409


def test_new_key_same_explanation_no_duplicate(session_client) -> None:
    _document, explanation = _prepare(session_client)
    first = session_client.handoff(explanation["id"])
    second = session_client.handoff(explanation["id"])
    assert first.json()["id"] == second.json()["id"]
    assert len(session_client.get_inbox("mechanic").json()["entries"]) == 1


def test_foreign_explanation_no_handoff(session_client, make_client) -> None:
    _document, explanation = _prepare(session_client)
    other = make_client()
    other.create()
    assert other.handoff(explanation["id"]).status_code == 404
    assert other.get_inbox("mechanic").json()["entries"] == []


def test_unknown_recipient_404(session_client) -> None:
    _prepare(session_client)
    assert session_client.get_inbox("attacker").status_code == 404
