"""M1.2 deterministic lexical retrieval behaviour."""

from __future__ import annotations

from demo.contracts import PageText
from demo.retrieval import content_tokens, rank_excerpts

PAGES = [
    PageText(
        page=1,
        text=(
            "SECTION 4 ACCIDENTAL DAMAGE\n"
            "The company will indemnify accidental external damage to the insured vehicle."
        ),
        readable=True,
    ),
    PageText(
        page=2,
        text=(
            "SECTION 9 THIRD PARTY LIABILITY\n"
            "The company will cover third party property damage to another vehicle."
        ),
        readable=True,
    ),
]


def test_narrative_changes_excerpts() -> None:
    accidental = rank_excerpts(PAGES, "my car had accidental external damage")
    third_party = rank_excerpts(PAGES, "third party property damage to another vehicle")
    assert accidental and accidental[0].page == 1
    assert third_party and third_party[0].page == 2


def test_no_match_abstains() -> None:
    assert rank_excerpts(PAGES, "my bicycle was stolen at the beach yesterday") == []


def test_offsets_are_exact_code_points() -> None:
    citations = rank_excerpts(PAGES, "accidental external damage")
    assert citations
    for citation in citations:
        page = next(p for p in PAGES if p.page == citation.page)
        assert page.text[citation.start : citation.end] == citation.quote


def test_short_and_stopword_tokens_ignored() -> None:
    assert rank_excerpts(PAGES, "the a of to an it") == []
    assert "the" not in content_tokens("the damage")


def test_maximum_five_excerpts_and_non_overlapping() -> None:
    text = "\n\n".join(f"Paragraph {i} mentions damage clause" for i in range(12))
    pages = [PageText(page=1, text=text, readable=True)]
    citations = rank_excerpts(pages, "damage clause")
    assert 1 <= len(citations) <= 5
    spans = sorted((c.start, c.end) for c in citations)
    for (_, end), (start, _) in zip(spans, spans[1:]):
        assert end <= start


def test_ranking_uses_paragraph_not_window_score() -> None:
    # Page 1 paragraph is long: a 600-char window around the first match only
    # contains one token, but the whole paragraph contains three. Page 2 has two
    # tokens. Correct paragraph-level ranking must pick page 1.
    long_text = "accidental " + ("filler " * 120) + "external damage clause"
    pages = [
        PageText(page=1, text=long_text, readable=True),
        PageText(page=2, text="external damage clause", readable=True),
    ]
    citations = rank_excerpts(pages, "accidental external damage")
    assert citations
    assert citations[0].page == 1


def test_long_paragraph_match_is_case_insensitive() -> None:
    long_text = "ACCIDENTAL DAMAGE " + ("filler " * 120)
    pages = [PageText(page=1, text=long_text, readable=True)]
    citations = rank_excerpts(pages, "accidental damage")
    assert citations
    assert citations[0].page == 1


def test_unreadable_pages_skipped() -> None:
    pages = [
        PageText(page=1, text="accidental damage", readable=False),
        PageText(page=2, text="accidental damage is described here", readable=True),
    ]
    citations = rank_excerpts(pages, "accidental damage")
    assert citations
    assert all(c.page == 2 for c in citations)
