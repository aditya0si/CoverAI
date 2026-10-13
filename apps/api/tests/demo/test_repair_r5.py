"""coverai-r5 regressions: multiline metadata heading context.

r4 rejected a distractor *on the same line* as a label (for example
``Previous Policy Number: X``) by anchoring the label to the line start. That
fix missed the case where the distractor is a **heading on its own line** and
the ordinary label follows on the next line:

    Previous policy (expired):
    Policy Number: OLD-44

The parser promoted ``OLD-44`` as a current policy number because it evaluated
each line in isolation and retained no multiline context. These tests assert the
context repair: labels under a historical/example/negated heading are not
promoted, while genuine CURRENT schedule controls and section boundaries reset
the context (no broad suppression). All fixtures are real PyMuPDF PDFs and
citations are checked exactly.

Raw commands/logs live under ``.hermes/r5/``.
"""

from __future__ import annotations

from demo.config import DemoLimits
from demo.contracts import METADATA_FIELD_NAMES, MetadataStatus
from demo.extraction import extract_pages, parse_metadata

import fixtures

LIMITS = DemoLimits()


def _metadata_for(pdf: bytes) -> dict:
    return parse_metadata(extract_pages(pdf, LIMITS))


def _assert_unknown(metadata: dict, field: str) -> None:
    assert metadata[field].status == MetadataStatus.unknown, field
    assert metadata[field].value is None, field
    assert metadata[field].citations == [], field


def _assert_found_with_exact_citation(metadata: dict, pages, field: str, expected: str) -> None:
    assert metadata[field].status == MetadataStatus.found, field
    assert metadata[field].value == expected, field
    assert metadata[field].citations, field
    citation = metadata[field].citations[0]
    page_text = next(p.text for p in pages if p.page == citation.page)
    assert page_text[citation.start : citation.end] == citation.quote
    assert citation.quote == expected


# ── the three exact independent findings ──────────────────────────────────
def test_previous_policy_heading_does_not_promote_following_label() -> None:
    pages = extract_pages(fixtures.multiline_previous_heading_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    _assert_unknown(metadata, "policy_number")
    # No other field may be inferred from the suppressed label line.
    for field in METADATA_FIELD_NAMES:
        _assert_unknown(metadata, field)


def test_example_heading_does_not_promote_following_label() -> None:
    pages = extract_pages(fixtures.multiline_example_heading_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    _assert_unknown(metadata, "policy_number")


def test_do_not_use_heading_does_not_promote_following_label() -> None:
    pages = extract_pages(fixtures.multiline_do_not_use_heading_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    _assert_unknown(metadata, "policy_number")


# ── controls: no broad suppression ────────────────────────────────────────
def test_current_schedule_control_after_distractor_heading_is_found() -> None:
    pages = extract_pages(fixtures.heading_then_current_schedule_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    _assert_found_with_exact_citation(
        metadata, pages, "policy_number", "APX-2026-000123"
    )


def test_blank_line_boundary_resets_distractor_context() -> None:
    pages = extract_pages(fixtures.heading_blank_line_current_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    _assert_found_with_exact_citation(
        metadata, pages, "policy_number", "APX-2026-000123"
    )


def test_distractor_heading_suppresses_block_but_not_later_current_metadata() -> None:
    pages = extract_pages(fixtures.heading_suppresses_block_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    _assert_unknown(metadata, "policy_number")
    _assert_unknown(metadata, "vehicle_registration")
    _assert_found_with_exact_citation(
        metadata, pages, "insurer_name", "Apex General Insurance"
    )


def test_current_label_before_heading_is_not_retroactively_suppressed() -> None:
    pages = extract_pages(fixtures.current_before_heading_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    _assert_found_with_exact_citation(
        metadata, pages, "policy_number", "APX-2026-000123"
    )


# ── existing same-line anchoring behaviour is preserved (control) ─────────
def test_same_line_distractor_still_yields_only_current() -> None:
    pages = extract_pages(fixtures.distractor_and_current_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    _assert_found_with_exact_citation(
        metadata, pages, "policy_number", "APX-2026-000123"
    )


def test_all_same_line_distractor_labels_yield_no_metadata() -> None:
    pages = extract_pages(fixtures.distractor_metadata_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    for field in METADATA_FIELD_NAMES:
        _assert_unknown(metadata, field)


def test_supported_current_schedule_labels_still_found() -> None:
    pages = extract_pages(fixtures.supported_metadata_pdf(), LIMITS)
    metadata = parse_metadata(pages)
    for field, expected in fixtures.SUPPORTED_METADATA.items():
        _assert_found_with_exact_citation(metadata, pages, field, expected)


if __name__ == "__main__":  # pragma: no cover
    import pytest

    raise SystemExit(pytest.main([__file__, "-q"]))
