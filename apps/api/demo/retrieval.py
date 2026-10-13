"""Deterministic, lexical, English-only excerpt retrieval.

No embeddings, no model, no inference. Ranks readable page paragraphs by the
number of *distinct* narrative tokens they contain, with stable tie-breaks.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .contracts import Citation, PageText

STOPWORDS_VERSION = "en-v1"

# Fixed, versioned English stopword list (explicit limitation: English only).
STOPWORDS: frozenset[str] = frozenset(
    """
    a about above after again against all am an and any are aren't as at be because
    been before being below between both but by can't cannot could couldn't did didn't
    do does doesn't doing don't down during each few for from further had hadn't has
    hasn't have haven't having he he'd he'll he's her here here's hers herself him
    himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself
    let's me more most mustn't my myself no nor not of off on once only or other ought
    our ours ourselves out over own same shan't she she'd she'll she's should shouldn't
    so some such than that that's the their theirs them themselves then there there's
    these they they'd they'll they're they've this those through to too under until up
    very was wasn't we we'd we'll we're we've were weren't what what's when when's where
    where's which while who who's whom why why's with won't would wouldn't you you'd
    you'll you're you've your yours yourself yourselves
    """.split()
)

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_PARAGRAPH_RE = re.compile(r"\n[ \t]*\n")
# Case-insensitive so a token in SHOUTED/Title case in the page still matches.
_MATCH_RE = re.compile(r"[a-z0-9]+", re.IGNORECASE)


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def content_tokens(text: str) -> set[str]:
    return {t for t in tokenize(text) if len(t) >= 3 and t not in STOPWORDS}


def _iter_paragraphs(text: str):
    start = 0
    for match in _PARAGRAPH_RE.finditer(text):
        end = match.start()
        if end > start:
            yield (start, end)
        start = match.end()
    if start < len(text):
        yield (start, len(text))


def _trim(text: str, start: int, end: int) -> tuple[int, int]:
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    return start, end


def _window(
    page_text: str,
    para_start: int,
    para_end: int,
    tokens: set[str],
    max_chars: int,
) -> tuple[int, int] | None:
    """Return an exact substring window of <= max_chars that retains the match.

    The window start snaps *backwards* to a word boundary so the matched token is
    never skipped, and the end snaps backwards (but never before the end of the
    matched token) so a partial word is not emitted. Offsets are exact Unicode
    code-point offsets into ``page_text``.
    """
    if para_end - para_start <= max_chars:
        return _trim(page_text, para_start, para_end)

    segment = page_text[para_start:para_end]
    first_match: tuple[int, int] | None = None
    for match in _MATCH_RE.finditer(segment):
        token = match.group(0).lower()
        if token in tokens and len(token) >= 3:
            first_match = (para_start + match.start(), para_start + match.end())
            break
    if first_match is None:
        return None
    match_start, match_end = first_match

    # Start at (or up to 40 code points before) the matching word, then walk
    # back to the previous whitespace so no leading word is cut. Walking forward
    # is what previously dropped the matched first word at a boundary.
    desired = max(para_start, match_start - 40)
    win_start = desired
    while win_start > para_start and not page_text[win_start - 1].isspace():
        win_start -= 1
    if win_start > match_start:
        win_start = match_start

    win_end = min(para_end, win_start + max_chars)
    # Never cut the matched token off the end of the window.
    if win_end < match_end:
        win_end = min(para_end, match_end)
    while win_end > match_end and not page_text[win_end - 1].isspace():
        win_end -= 1

    win_start, win_end = _trim(page_text, win_start, win_end)
    if win_end <= win_start or win_end - win_start > max_chars:
        return None
    if not (win_start <= match_start and win_end >= match_end):
        return None
    return win_start, win_end


def _windows_for_paragraph(
    page_text: str,
    para_start: int,
    para_end: int,
    tokens: set[str],
    max_chars: int,
) -> list[tuple[int, int]]:
    """Return non-overlapping exact windows covering every matching region.

    A paragraph can contain several matching clauses far apart (for example a
    positive clause near the start and an exclusion near the end). Returning a
    single window around the first match silently dropped the others, so this
    walks each uncovered match and emits one bounded window per far-apart
    cluster. Matches that fall inside an accepted window are skipped, keeping
    the emitted windows non-overlapping.
    """
    segment = page_text[para_start:para_end]
    matches: list[tuple[int, int]] = []
    for match in _MATCH_RE.finditer(segment):
        token = match.group(0).lower()
        if len(token) >= 3 and token in tokens:
            matches.append((para_start + match.start(), para_start + match.end()))
    if not matches:
        return []
    if para_end - para_start <= max_chars:
        return [_trim(page_text, para_start, para_end)]

    windows: list[tuple[int, int]] = []
    index = 0
    while index < len(matches):
        match_start, match_end = matches[index]
        desired = max(para_start, match_start - 40)
        win_start = desired
        while win_start > para_start and not page_text[win_start - 1].isspace():
            win_start -= 1
        if win_start > match_start:
            win_start = match_start

        win_end = min(para_end, win_start + max_chars)
        # Extend the window over any further matches that still fit, then snap
        # the end back to a word boundary *without* cutting the last included
        # match (snapping only to the current match previously truncated a
        # later clause such as "wear and tear").
        last_end = match_end
        probe = index + 1
        while probe < len(matches) and matches[probe][1] <= win_end:
            last_end = matches[probe][1]
            probe += 1
        if win_end < last_end:
            win_end = min(para_end, last_end)
        while win_end > last_end and not page_text[win_end - 1].isspace():
            win_end -= 1

        win_start, win_end = _trim(page_text, win_start, win_end)
        if (
            win_end > win_start
            and win_end - win_start <= max_chars
            and win_start <= match_start
            and win_end >= last_end
        ):
            windows.append((win_start, win_end))
            index += 1
            while index < len(matches) and matches[index][0] < win_end:
                index += 1
        else:  # pragma: no cover - defensive; falls back to the single window
            index += 1
    return windows


@dataclass(frozen=True)
class RetrievalOutcome:
    """Selected citations plus honest signals about what was *not* shown.

    ``omitted_matches`` is True when the number of distinct matching excerpt
    windows exceeds the display cap, so matching wording (which may include a
    contrary/exclusion clause) is not displayed. ``truncated_excerpts`` is True
    when a displayed window ends before its paragraph does, so the passage was
    limited to the character window. Callers must disclose these rather than
    silently suppressing the omitted wording.
    """

    citations: list[Citation] = field(default_factory=list)
    omitted_matches: bool = False
    truncated_excerpts: bool = False


def retrieve(
    pages: list[PageText],
    narrative: str,
    *,
    max_excerpts: int = 5,
    max_excerpt_chars: int = 600,
) -> RetrievalOutcome:
    tokens = content_tokens(narrative)
    if not tokens:
        return RetrievalOutcome()

    # Rank whole paragraphs by distinct matching tokens (spec), then crop each
    # selected paragraph to exact <=max_excerpt_chars quote windows for output.
    # A long paragraph may yield several non-overlapping windows so distant
    # matching (including contrary) clauses are not suppressed.
    candidates: list[tuple[int, int, int, int, int]] = []
    for page in pages:
        if not page.readable or not page.text:
            continue
        for para_start, para_end in _iter_paragraphs(page.text):
            paragraph_tokens = content_tokens(page.text[para_start:para_end])
            score = len(paragraph_tokens & tokens)
            if score <= 0:
                continue
            for win_start, win_end in _windows_for_paragraph(
                page.text, para_start, para_end, tokens, max_excerpt_chars
            ):
                candidates.append((score, page.page, win_start, win_end, para_end))

    candidates.sort(key=lambda c: (-c[0], c[1], c[2]))

    results: list[Citation] = []
    taken: dict[int, list[tuple[int, int]]] = {}
    truncated = False
    page_texts = {p.page: p.text for p in pages}
    for _score, page_no, win_start, win_end, para_end in candidates:
        if len(results) >= max_excerpts:
            break
        spans = taken.setdefault(page_no, [])
        if any(not (win_end <= s or win_start >= e) for s, e in spans):
            continue
        spans.append((win_start, win_end))
        if win_end < para_end:
            # Text after this window in the same paragraph was not displayed.
            truncated = True
        quote = page_texts[page_no][win_start:win_end]
        results.append(
            Citation(page=page_no, start=win_start, end=win_end, quote=quote)
        )

    omitted = len(candidates) > max_excerpts
    return RetrievalOutcome(
        citations=results,
        omitted_matches=omitted,
        truncated_excerpts=truncated,
    )


def rank_excerpts(
    pages: list[PageText],
    narrative: str,
    *,
    max_excerpts: int = 5,
    max_excerpt_chars: int = 600,
) -> list[Citation]:
    """Backward-compatible list API; see :func:`retrieve` for the diagnostics."""
    return retrieve(
        pages,
        narrative,
        max_excerpts=max_excerpts,
        max_excerpt_chars=max_excerpt_chars,
    ).citations
