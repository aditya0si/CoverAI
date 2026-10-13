"""M1.1 contract shape validation and fixed-copy assertions."""

from __future__ import annotations

import pytest
from pydantic import ValidationError as PydanticValidationError

from demo.contracts import (
    AMBIGUOUS_METADATA_DISPLAY,
    DETERMINISTIC_MODE_LABEL,
    METADATA_FIELD_NAMES,
    NOT_FOUND_TEXT,
    SIMULATION_WARNING,
    UNKNOWN_METADATA_DISPLAY,
    Citation,
    ExplainRequest,
    Finding,
    MetadataField,
    MetadataStatus,
    PageText,
)


def test_page_text_requires_positive_page() -> None:
    with pytest.raises(PydanticValidationError):
        PageText(page=0, text="x", readable=True)


def test_citation_requires_end_after_start() -> None:
    with pytest.raises(PydanticValidationError):
        Citation(page=1, start=10, end=10, quote="x")


def test_citation_offsets_non_negative() -> None:
    with pytest.raises(PydanticValidationError):
        Citation(page=1, start=-1, end=5, quote="x")


def test_metadata_unknown_shape() -> None:
    field = MetadataField(value=None, status=MetadataStatus.unknown, citations=[])
    assert field.value is None
    assert field.citations == []


def test_explain_request_rejects_unknown_fields() -> None:
    with pytest.raises(PydanticValidationError):
        ExplainRequest.model_validate(
            {
                "document_id": "00000000-0000-0000-0000-000000000000",
                "document_revision": 1,
                "narrative": "x" * 30,
                "mode": "deterministic",
                "extra": 1,
            }
        )


def test_explain_request_accepts_external_mode_contract() -> None:
    # The external model is disabled at the HTTP boundary (503), not by rejecting
    # the request shape, so the contract must accept the explicit mode.
    request = ExplainRequest.model_validate(
        {
            "document_id": "00000000-0000-0000-0000-000000000000",
            "document_revision": 1,
            "narrative": "x" * 30,
            "mode": "external_model",
        }
    )
    assert request.mode == "external_model"


def test_explain_request_rejects_unknown_mode() -> None:
    with pytest.raises(PydanticValidationError):
        ExplainRequest.model_validate(
            {
                "document_id": "00000000-0000-0000-0000-000000000000",
                "document_revision": 1,
                "narrative": "x" * 30,
                "mode": "auto",
            }
        )


def test_not_found_finding_has_no_citations() -> None:
    finding = Finding(kind="not_found", text=NOT_FOUND_TEXT, citations=[])
    assert finding.citations == []


def test_mandatory_copy_is_exact() -> None:
    assert SIMULATION_WARNING == (
        "Simulation only — no claim has been filed and no mechanic or insurer "
        "has been contacted. This is not a coverage decision."
    )
    assert DETERMINISTIC_MODE_LABEL == "Document excerpts — deterministic, not AI-generated."
    assert UNKNOWN_METADATA_DISPLAY == "Not found in readable policy text"
    assert AMBIGUOUS_METADATA_DISPLAY == "Conflicting values — review cited pages"
    assert NOT_FOUND_TEXT == (
        "No matching clause found in the readable pages. This does not establish "
        "coverage or exclusion."
    )


def test_metadata_field_names_fixed() -> None:
    assert set(METADATA_FIELD_NAMES) == {
        "insurer_name",
        "policy_number",
        "vehicle_registration",
        "vehicle_year",
        "premium",
        "insured_value",
        "start_date",
        "end_date",
    }


def test_public_contracts_reject_unknown_fields() -> None:
    from demo.contracts import Document, Finding, Handoff, InboxEntry, InboxResponse

    with pytest.raises(PydanticValidationError):
        PageText.model_validate({"page": 1, "text": "x", "readable": True, "extra": 1})
    with pytest.raises(PydanticValidationError):
        Citation.model_validate({"page": 1, "start": 0, "end": 1, "quote": "x", "extra": 1})
    with pytest.raises(PydanticValidationError):
        MetadataField.model_validate(
            {"value": None, "status": "unknown", "citations": [], "extra": 1}
        )
    with pytest.raises(PydanticValidationError):
        Finding.model_validate({"kind": "not_found", "text": "x", "citations": [], "extra": 1})
    with pytest.raises(PydanticValidationError):
        InboxResponse.model_validate({"simulated": True, "entries": [], "extra": 1})
    with pytest.raises(PydanticValidationError):
        InboxEntry.model_validate(
            {
                "id": "00000000-0000-0000-0000-000000000000",
                "recipient": "simulated_mechanic",
                "title": "t",
                "narrative": "n",
                "citations": [],
                "extra": 1,
            }
        )
    with pytest.raises(PydanticValidationError):
        Document.model_validate(
            {
                "id": "00000000-0000-0000-0000-000000000000",
                "revision": 1,
                "filename": "f.pdf",
                "page_count": 1,
                "unreadable_pages": [],
                "metadata": {},
                "extra": 1,
            }
        )
    with pytest.raises(PydanticValidationError):
        Handoff.model_validate(
            {
                "id": "00000000-0000-0000-0000-000000000000",
                "explanation_id": "00000000-0000-0000-0000-000000000000",
                "simulated": True,
                "status": "simulated_created",
                "mechanic": {
                    "id": "00000000-0000-0000-0000-000000000000",
                    "recipient": "simulated_mechanic",
                    "title": "t",
                    "narrative": "n",
                    "citations": [],
                },
                "officer": {
                    "id": "00000000-0000-0000-0000-000000000000",
                    "recipient": "simulated_officer",
                    "title": "t",
                    "narrative": "n",
                    "citations": [],
                },
                "created_at": "2026-01-01T00:00:00Z",
                "extra": 1,
            }
        )
