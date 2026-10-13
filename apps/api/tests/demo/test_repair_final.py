"""Final completeness RED/GREEN tests: silent excerpt-cap omission and truncation.

The deterministic retrieval caps output at five excerpts and at 600 code points
per excerpt. Before this repair it dropped further *matching* clauses silently,
so a visitor could see the positive wording while a distant exclusion was
omitted with no disclosure. The user requirement is: retain multiple matching
positive/exclusion clauses **or** disclose the matching omission / truncation.

These tests are class-level (they assert disclosure based on actual retrieval,
not on any fixture string). Raw logs are kept under
``.hermes/verification/independent-repair-final/``.
"""

from __future__ import annotations

import pytest

import fixtures
from demo.contracts import PageText

OMISSION_TOKENS = (
    "not displayed",
    "omitted",
    "additional matching",
    "only the first",
    "not shown",
)
TRUNCATION_TOKENS = (
    "truncated",
    "display limit",
    "character window",
    "limited to the",
    "additional wording",
)


def _citations(explanation: dict) -> list[dict]:
    return [citation for finding in explanation["findings"] for citation in finding["citations"]]


def _limitations(explanation: dict) -> str:
    return " ".join(explanation["limitations"]).lower()


def _quotes(explanation: dict) -> str:
    return " ".join(citation["quote"].lower() for citation in _citations(explanation))


def _assert_no_coverage_inference(explanation: dict) -> None:
    blob = " ".join(finding["text"].lower() for finding in explanation["findings"])
    for banned in ("covered", "not covered", "entitled", "approved", "payout", "liable"):
        assert banned not in blob, banned


def test_more_than_five_matching_clusters_disclose_matching_omission(session_client) -> None:
    session_client.create()
    document = session_client.upload(fixtures.many_clause_paragraph_pdf()).json()
    explanation = session_client.explain(
        document["id"], document["revision"], "collision accidental damage"
    ).json()

    citations = _citations(explanation)
    assert citations, "expected excerpts"
    assert len(citations) <= 5, "retrieval must cap excerpts at five"

    exclusion_shown = "wear and tear" in _quotes(explanation)
    disclosed = any(token in _limitations(explanation) for token in OMISSION_TOKENS)
    assert exclusion_shown or disclosed, (
        "matching clauses beyond the five-excerpt cap were omitted without disclosure"
    )
    _assert_no_coverage_inference(explanation)


def test_clause_extending_past_window_is_retained_or_truncation_disclosed(session_client) -> None:
    session_client.create()
    document = session_client.upload(fixtures.boundary_clause_paragraph_pdf()).json()
    explanation = session_client.explain(
        document["id"], document["revision"], "collision exclusion applies"
    ).json()

    citations = _citations(explanation)
    assert citations, "expected excerpts"

    clause_retained = "wear and tear" in _quotes(explanation)
    disclosed = any(token in _limitations(explanation) for token in TRUNCATION_TOKENS)
    assert clause_retained or disclosed, (
        "an exclusion clause cut off at the excerpt window was not disclosed"
    )
    _assert_no_coverage_inference(explanation)


def test_retrieval_outcome_reports_omission_and_truncation() -> None:
    # The diagnostics are class-level signals derived from actual matching, and
    # are what the deterministic explanation uses to disclose.
    from demo.retrieval import retrieve

    many = retrieve(
        [PageText(page=1, text=fixtures.MANY_CLAUSE_PARAGRAPH, readable=True)],
        "collision accidental damage",
    )
    assert len(many.citations) <= 5
    assert many.omitted_matches is True

    boundary = retrieve(
        [PageText(page=1, text=fixtures.BOUNDARY_CLAUSE_PARAGRAPH, readable=True)],
        "collision exclusion applies",
    )
    assert boundary.citations
    assert boundary.truncated_excerpts is True


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
