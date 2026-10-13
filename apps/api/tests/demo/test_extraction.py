"""M1.2 faithful extraction, labelled metadata and resource boundaries."""

from __future__ import annotations

import pytest

import fixtures
from demo.config import DemoLimits
from demo.contracts import MetadataStatus
from demo.errors import InvalidDocument, OCRNotAvailable, ValidationError
from demo.extraction import canonicalize_text, extract_pages, parse_metadata

LIMITS = DemoLimits()


def test_header_footer_terms_preserved() -> None:
    pages = extract_pages(fixtures.default_policy_pdf(), LIMITS)
    joined = "\n".join(page.text for page in pages)
    assert "Apex General Insurance" in joined
    assert "subject to the terms and conditions set out herein" in joined
    assert all(page.readable for page in pages)


def test_canonicalize_normalises_crlf_and_horizontal_whitespace() -> None:
    assert canonicalize_text("a\r\nb\t\t c  \r\n") == "a\nb c"


def test_missing_metadata_is_null() -> None:
    pages = extract_pages(fixtures.default_policy_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    assert metadata["insurer_name"].status == MetadataStatus.found
    assert metadata["insurer_name"].value == "Apex General Insurance"
    for field in ("vehicle_year", "premium", "insured_value", "start_date", "end_date"):
        assert metadata[field].status == MetadataStatus.unknown
        assert metadata[field].value is None
        assert metadata[field].citations == []


def test_conflicting_labeled_metadata_is_ambiguous() -> None:
    pages = extract_pages(fixtures.conflicting_metadata_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    field = metadata["policy_number"]
    assert field.status == MetadataStatus.ambiguous
    assert field.value is None
    assert len(field.citations) >= 2
    for citation in field.citations:
        page_text = next(p.text for p in pages if p.page == citation.page)
        assert page_text[citation.start : citation.end] == citation.quote
    # An unlabelled date-looking distractor must not be guessed as start_date.
    assert metadata["start_date"].status == MetadataStatus.unknown


def test_page_offsets_unicode_exact() -> None:
    from demo.retrieval import rank_excerpts

    pages = extract_pages(fixtures.unicode_page_pdf(), LIMITS)
    citations = rank_excerpts(pages, "accidental external damage to the vehicle")
    assert citations
    citation = citations[0]
    page_text = next(p.text for p in pages if p.page == citation.page)
    assert page_text[citation.start : citation.end] == citation.quote
    assert "accidental external damage" in citation.quote


def test_mixed_scan_warns() -> None:
    pdf = fixtures.build_policy_pdf([fixtures.PAGE_2, ""])
    pages = extract_pages(pdf, LIMITS)
    assert [p.page for p in pages if not p.readable] == [2]
    assert pages[0].readable


def test_scanned_encrypted_corrupt_rejected() -> None:
    with pytest.raises(OCRNotAvailable):
        extract_pages(fixtures.build_policy_pdf(["", ""]), LIMITS)
    with pytest.raises(InvalidDocument):
        extract_pages(fixtures.encrypted_pdf(), LIMITS)
    with pytest.raises(InvalidDocument):
        extract_pages(b"%PDF-1.4 this is not a real pdf body", LIMITS)
    with pytest.raises(InvalidDocument):
        extract_pages(b"not a pdf at all", LIMITS)


def test_limit_boundaries() -> None:
    fifty = fixtures.build_policy_pdf([fixtures.PAGE_2] * 50)
    pages = extract_pages(fifty, LIMITS)
    assert len(pages) == 50

    fifty_one = fixtures.build_policy_pdf([fixtures.PAGE_2] * 51)
    with pytest.raises(ValidationError):
        extract_pages(fifty_one, LIMITS)

    tight = DemoLimits(max_extracted_chars=1000)
    too_much_text = fixtures.build_policy_pdf([fixtures.PAGE_2] * 10)
    with pytest.raises(ValidationError):
        extract_pages(too_much_text, tight)
