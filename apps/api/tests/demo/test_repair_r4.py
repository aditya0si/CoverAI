"""coverai independent-review repai — RED regression tests (r4).

Authored test-first: each finding below is asserted against the current tree and
is expected to FAIL (RED) until the GREEN phase repairs product behaviour. Raw
commands/logs are kept under ``.hermes/verification/independent-repair-red/``.

Findings covered (backend):
* 2 — real PyMuPDF ``is_repaired`` PDFs and owner-password-only encrypted PDFs
  (``needs_pass`` False) must be rejected with a sanitized 422, preserving the
  valid previous document.
* 3 — metadata labels must be anchored to current wording; negated/example/
  historical distractors must not be reported as found, while supported current
  labels are found with exact citations.
* 4 — a long single paragraph whose distant positive and exclusion clauses both
  match must retain both windows (or explicitly disclose omission); retrieval
  must never infer coverage.
Proof gap — a real astral-Unicode PDF fixture with known code-point citations.

Controls are included so a repair cannot pass by special-casing fixture strings.
"""

from __future__ import annotations

import fitz
import pytest

import fixtures
from demo.config import DemoLimits
from demo.contracts import METADATA_FIELD_NAMES, MetadataStatus, PageText
from demo.errors import InvalidDocument
from demo.extraction import extract_pages, parse_metadata
from demo.retrieval import rank_excerpts

LIMITS = DemoLimits()


def _open(data: bytes) -> "fitz.Document":
    return fitz.open(stream=data, filetype="pdf")


# ── finding 2: damaged / owner-password-only PDFs ──────────────────────────
def test_owner_password_only_fixture_properties() -> None:
    """Control: the fixture really is encrypted yet opens without a password."""
    data = fixtures.owner_password_only_pdf()
    doc = _open(data)
    try:
        assert not doc.needs_pass
        assert (doc.metadata.get("encryption") or ""), "fixture is not actually encrypted"
    finally:
        doc.close()


def test_owner_password_only_pdf_is_rejected() -> None:
    with pytest.raises(InvalidDocument):
        extract_pages(fixtures.owner_password_only_pdf(), LIMITS)


def test_repaired_fixture_properties() -> None:
    """Control: the fixture is only openable because PyMuPDF repaired it."""
    data = fixtures.repaired_policy_pdf()
    doc = _open(data)
    try:
        assert doc.is_repaired is True
        assert not doc.needs_pass
    finally:
        doc.close()


def test_repaired_pdf_is_rejected() -> None:
    with pytest.raises(InvalidDocument):
        extract_pages(fixtures.repaired_policy_pdf(), LIMITS)


def _assert_sanitized_422_error(body: dict) -> None:
    assert set(body.keys()) == {"error"}
    assert set(body["error"].keys()) == {"code", "message", "request_id"}
    assert body["error"]["code"] in {"INVALID_DOCUMENT", "VALIDATION_ERROR"}
    lowered = body["error"]["message"].lower()
    for leak in ("fitz", "mupdf", "traceback", "pymupdf", "exception", "stack"):
        assert leak not in lowered, leak


def test_owner_password_only_upload_is_sanitized_422_and_preserves_previous(session_client) -> None:
    session_client.create()
    first = session_client.upload(fixtures.default_policy_pdf()).json()

    denied = session_client.upload(fixtures.owner_password_only_pdf(), filename="owner.pdf")
    assert denied.status_code == 422
    _assert_sanitized_422_error(denied.json())

    view = session_client.get_session().json()
    assert view["document"]["id"] == first["id"]
    assert view["document"]["revision"] == 1
    assert session_client.get_page(first["id"], 2).status_code == 200


def test_repaired_upload_is_sanitized_422_and_preserves_previous(session_client) -> None:
    session_client.create()
    first = session_client.upload(fixtures.default_policy_pdf()).json()

    denied = session_client.upload(fixtures.repaired_policy_pdf(), filename="repaired.pdf")
    assert denied.status_code == 422
    _assert_sanitized_422_error(denied.json())

    view = session_client.get_session().json()
    assert view["document"]["id"] == first["id"]
    assert view["document"]["revision"] == 1
    assert session_client.get_page(first["id"], 2).status_code == 200


def test_valid_upload_still_succeeds_after_damaged_rejections(session_client) -> None:
    """Control: the rejection path must not poison a later valid upload."""
    session_client.create()
    assert (
        session_client.upload(fixtures.owner_password_only_pdf(), filename="owner.pdf").status_code
        == 422
    )
    assert (
        session_client.upload(fixtures.repaired_policy_pdf(), filename="repaired.pdf").status_code
        == 422
    )
    ok = session_client.upload(fixtures.default_policy_pdf(), filename="good.pdf")
    assert ok.status_code == 201
    assert ok.json()["revision"] == 1


# ── finding 3: anchored current metadata labels ────────────────────────────
def test_metadata_rejects_example_previous_and_negated_distractors() -> None:
    pages = extract_pages(fixtures.distractor_metadata_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    for field in METADATA_FIELD_NAMES:
        assert metadata[field].status == MetadataStatus.unknown, field
        assert metadata[field].value is None, field
        assert metadata[field].citations == [], field


def test_metadata_finds_current_supported_labels_with_exact_citations() -> None:
    pages = extract_pages(fixtures.supported_metadata_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    for field, expected in fixtures.SUPPORTED_METADATA.items():
        assert metadata[field].status == MetadataStatus.found, field
        assert metadata[field].value == expected, field
        assert metadata[field].citations, field
        citation = metadata[field].citations[0]
        page_text = next(p.text for p in pages if p.page == citation.page)
        assert page_text[citation.start : citation.end] == citation.quote
        assert citation.quote == expected


def test_metadata_prefers_current_label_over_previous_on_same_page() -> None:
    pages = extract_pages(fixtures.distractor_and_current_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    field = metadata["policy_number"]
    assert field.status == MetadataStatus.found
    assert field.value == "APX-2026-000123"


# ── finding 4: distant clauses in one long paragraph ───────────────────────
def test_long_paragraph_retains_distant_positive_and_exclusion_clauses() -> None:
    pages = [PageText(page=1, text=fixtures.LONG_CLAUSE_PARAGRAPH, readable=True)]
    citations = rank_excerpts(pages, "accidental external damage exclusions wear tear")
    assert citations
    joined = " ".join(c.quote.lower() for c in citations)
    assert "accidental external damage" in joined, "positive clause omitted"
    assert "wear and tear" in joined, "distant exclusion clause silently omitted"

    assert len(citations) <= 5
    spans = sorted((c.start, c.end) for c in citations)
    for citation in citations:
        assert len(citation.quote) <= 600
        assert pages[0].text[citation.start : citation.end] == citation.quote
    for (_, end), (start, _) in zip(spans, spans[1:]):
        assert end <= start, "citations overlap"


def test_long_paragraph_explanation_no_coverage_inference(session_client) -> None:
    session_client.create()
    document = session_client.upload(fixtures.long_paragraph_pdf()).json()
    explanation = session_client.explain(
        document["id"],
        document["revision"],
        "accidental external damage exclusions wear tear",
    ).json()

    findings = explanation["findings"]
    assert findings
    assert all(f["kind"] == "relevant_excerpt" for f in findings)

    blob = " ".join(f["text"].lower() for f in findings)
    for banned in (
        "covered",
        "not covered",
        "entitled",
        "approved",
        "rejected",
        "payout",
        "liable",
        "guarantee",
    ):
        assert banned not in blob, banned

    quotes = " ".join(c["quote"].lower() for f in findings for c in f["citations"])
    shown = ("accidental external damage" in quotes) and ("wear and tear" in quotes)
    limitations = " ".join(explanation["limitations"]).lower()
    disclosed = any(
        token in limitations
        for token in ("omit", "not shown", "additional match", "further match", "only the first")
    )
    assert shown or disclosed, "distant exclusion clause omitted without disclosure"


# ── proof gap: real astral Unicode PDF with known code-point citations ─────
def test_astral_pdf_citations_use_code_point_offsets() -> None:
    data = fixtures.astral_policy_pdf()
    doc = _open(data)
    try:
        raw = doc.load_page(0).get_text("text")
    finally:
        doc.close()
    assert fixtures.ASTRAL_CHAR in raw, "fixture control: no astral code point extracted"

    pages = extract_pages(data, LIMITS)
    page = pages[0]
    assert fixtures.ASTRAL_CHAR in page.text

    citations = rank_excerpts(pages, "accidental external damage")
    assert citations
    citation = citations[0]
    assert page.text[citation.start : citation.end] == citation.quote
    assert "accidental external damage" in citation.quote

    prefix = page.text[: citation.start]
    assert fixtures.ASTRAL_CHAR in prefix, "astral code point must precede the citation window"
    utf16_units = len(prefix.encode("utf-16-le")) // 2
    assert utf16_units == citation.start + 1, "offsets are UTF-16, not Unicode code points"


# ── server-side finding 1 control: replacement clears prior state ──────────
def test_replacement_clears_prior_inboxes_and_explanations(session_client) -> None:
    session_client.create()
    document = session_client.upload(fixtures.default_policy_pdf()).json()
    explanation = session_client.explain(
        document["id"],
        document["revision"],
        "my car suffered accidental external damage in a collision",
    ).json()
    assert session_client.handoff(explanation["id"]).status_code == 201
    assert len(session_client.get_inbox("mechanic").json()["entries"]) == 1

    second = session_client.upload(fixtures.supported_metadata_pdf()).json()
    assert second["revision"] == 2
    assert session_client.get_explanation(explanation["id"]).status_code == 404
    assert session_client.get_inbox("mechanic").json()["entries"] == []
    assert session_client.get_inbox("officer").json()["entries"] == []
