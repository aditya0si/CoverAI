"""M1.2 policy upload, explanation and page HTTP contract tests."""

from __future__ import annotations

from uuid import uuid4

import fixtures

NARRATIVE = "my car had accidental external damage after a collision"


def _upload(session_client, pdf_bytes=None):
    session_client.create()
    return session_client.upload(pdf_bytes or fixtures.default_policy_pdf()).json()


def test_upload_returns_document_with_metadata(session_client) -> None:
    session_client.create()
    response = session_client.upload(fixtures.default_policy_pdf())
    assert response.status_code == 201
    document = response.json()
    assert document["revision"] == 1
    assert document["page_count"] == 3
    assert document["filename"] == "policy.pdf"
    assert document["metadata"]["insurer_name"]["status"] == "found"
    assert document["metadata"]["insurer_name"]["value"] == "Apex General Insurance"


def test_signature_mime_extension_checked(session_client) -> None:
    session_client.create()
    bad_ext = session_client.upload(fixtures.default_policy_pdf(), filename="policy.txt")
    assert bad_ext.status_code == 415

    bad_mime = session_client.upload(
        fixtures.default_policy_pdf(), filename="policy.pdf", content_type="text/plain"
    )
    assert bad_mime.status_code == 415

    bad_sig = session_client.upload(b"not a pdf", filename="policy.pdf")
    assert bad_sig.status_code == 422


def test_upload_size_limit(session_client) -> None:
    session_client.create()
    oversized = b"%PDF-" + b"0" * (10 * 1024 * 1024 + 64)
    response = session_client.upload(oversized)
    assert response.status_code == 413


def test_narrative_limits(session_client) -> None:
    document = _upload(session_client)
    too_short = session_client.explain(document["id"], document["revision"], "x" * 19)
    assert too_short.status_code == 422

    too_long = session_client.explain(document["id"], document["revision"], "x" * 4001)
    assert too_long.status_code == 422

    ok = session_client.explain(document["id"], document["revision"], "x" * 20)
    assert ok.status_code == 201


def test_explanation_findings_and_page_route(session_client) -> None:
    document = _upload(session_client)
    response = session_client.explain(document["id"], document["revision"], NARRATIVE)
    assert response.status_code == 201
    explanation = response.json()
    assert explanation["mode"] == "deterministic"
    assert explanation["document_revision"] == document["revision"]

    citations = [c for f in explanation["findings"] for c in f["citations"]]
    assert citations
    assert any(c["page"] == 2 for c in citations)
    for citation in citations:
        page = session_client.get_page(document["id"], citation["page"]).json()
        assert page["text"][citation["start"] : citation["end"]] == citation["quote"]


def test_external_mode_is_503_model_unavailable(session_client) -> None:
    document = _upload(session_client)
    response = session_client.explain(
        document["id"], document["revision"], NARRATIVE, mode="external_model"
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "MODEL_UNAVAILABLE"
    assert response.headers["cache-control"] == "no-store"

    # The disabled mode must not silently fall back or consume the session.
    deterministic = session_client.explain(document["id"], document["revision"], NARRATIVE)
    assert deterministic.status_code == 201
    assert deterministic.json()["mode"] == "deterministic"


def test_no_match_abstains_http(session_client) -> None:
    document = _upload(session_client)
    explanation = session_client.explain(
        document["id"], document["revision"], "my bicycle was stolen at the beach yesterday"
    ).json()
    findings = explanation["findings"]
    assert len(findings) == 1
    assert findings[0]["kind"] == "not_found"
    assert findings[0]["citations"] == []


def test_stale_revision_rejected(session_client) -> None:
    document = _upload(session_client)
    response = session_client.explain(
        document["id"], document["revision"] + 1, NARRATIVE
    )
    assert response.status_code == 409


def test_failed_replacement_preserves_prior_document(session_client) -> None:
    session_client.create()
    first = session_client.upload(fixtures.default_policy_pdf()).json()
    failed = session_client.upload(b"not a pdf", filename="broken.pdf")
    assert failed.status_code == 422

    view = session_client.get_session().json()
    assert view["document"]["id"] == first["id"]
    assert view["document"]["revision"] == 1
    assert session_client.get_page(first["id"], 2).status_code == 200


def test_successful_replacement_increments_revision_and_clears_state(session_client) -> None:
    document = _upload(session_client)
    explanation = session_client.explain(document["id"], document["revision"], NARRATIVE).json()
    assert session_client.get_explanation(explanation["id"]).status_code == 200

    second = session_client.upload(fixtures.conflicting_metadata_pdf()).json()
    assert second["revision"] == 2
    assert session_client.get_explanation(explanation["id"]).status_code == 404


def test_idempotent_upload_replay(session_client) -> None:
    session_client.create()
    key = uuid4()
    pdf = fixtures.default_policy_pdf()
    first = session_client.upload(pdf, key=key)
    second = session_client.upload(pdf, key=key)
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]


def test_replacement_invalidates_prior_idempotency_replay(session_client) -> None:
    session_client.create()
    first = session_client.upload(fixtures.default_policy_pdf(), key=uuid4()).json()

    explain_key = uuid4()
    explain_first = session_client.explain(
        first["id"], first["revision"], NARRATIVE, key=explain_key
    )
    assert explain_first.status_code == 201

    handoff_key = uuid4()
    handoff_first = session_client.handoff(explain_first.json()["id"], key=handoff_key)
    assert handoff_first.status_code == 201

    second = session_client.upload(fixtures.conflicting_metadata_pdf()).json()
    assert second["revision"] == 2

    # Same keys/payloads after replacement must NOT replay the pre-replacement result.
    replay_explain = session_client.explain(
        first["id"], first["revision"], NARRATIVE, key=explain_key
    )
    assert replay_explain.status_code == 404
    replay_handoff = session_client.handoff(explain_first.json()["id"], key=handoff_key)
    assert replay_handoff.status_code == 404


def test_conflicting_idempotency_payload(session_client) -> None:
    session_client.create()
    key = uuid4()
    session_client.upload(fixtures.default_policy_pdf(), key=key)
    conflicting = session_client.upload(fixtures.conflicting_metadata_pdf(), key=key)
    assert conflicting.status_code == 409


def test_unknown_document_page_is_404(session_client) -> None:
    session_client.create()
    assert session_client.get_page(str(uuid4()), 1).status_code == 404
    assert session_client.get_explanation(str(uuid4())).status_code == 404
