"""Faithful PDF text extraction and labelled-only metadata parsing.

Extraction runs in a bounded, separately-spawned child process so the parse
deadline terminates work rather than leaking an uncancellable thread. Metadata is
never guessed: only explicitly labelled values are reported, conflicts become
``ambiguous`` and everything else stays ``unknown``.
"""

from __future__ import annotations

import multiprocessing
import re
import threading
from typing import Any

from .config import DemoLimits
from .contracts import (
    METADATA_FIELD_NAMES,
    Citation,
    MetadataField,
    MetadataStatus,
    PageText,
)
from .errors import (
    Busy,
    DemoError,
    InvalidDocument,
    OCRNotAvailable,
    UpstreamTimeout,
    ValidationError,
)

PDF_SIGNATURE = b"%PDF-"
_HORIZONTAL_WS = re.compile(r"[ \t\f\v]+")

# Labelled metadata fingerprints (English only, explicit limitation).
FIELD_LABELS: dict[str, tuple[str, ...]] = {
    "insurer_name": ("insurer name", "insurance company", "insurer"),
    "policy_number": ("policy number", "policy no", "policy #", "policy number."),
    "vehicle_registration": (
        "vehicle registration",
        "registration number",
        "registration no",
        "vehicle number",
        "reg no",
    ),
    "vehicle_year": ("vehicle year", "year of manufacture", "manufacture year", "model year"),
    "premium": ("total premium", "premium amount", "premium"),
    "insured_value": ("insured declared value", "insured value", "sum insured", "idv"),
    "start_date": ("policy start date", "period from", "valid from", "start date", "from date"),
    "end_date": (
        "policy end date",
        "period to",
        "valid to",
        "valid till",
        "expiry date",
        "end date",
        "to date",
    ),
}


def canonicalize_text(text: str) -> str:
    """Normalise CRLF and horizontal whitespace only; preserve meaningful lines."""
    normalised = text.replace("\r\n", "\n").replace("\r", "\n")
    joined = "\n".join(_HORIZONTAL_WS.sub(" ", line).rstrip() for line in normalised.split("\n"))
    return joined.rstrip("\n")


def _encryption_metadata(doc: Any) -> str:
    """Return the parser's encryption label, or "" when the PDF is unencrypted.

    Owner-password-only PDFs report ``needs_pass == 0`` and (PyMuPDF 1.27)
    ``is_encrypted is False`` but still expose e.g. ``"Standard V5 R6 256-bit
    AES"`` here, so this is the reliable encryption signal for that case.
    """
    try:
        metadata = doc.metadata or {}
    except Exception:  # noqa: BLE001 - a metadata failure must not leak
        return ""
    value = metadata.get("encryption") or ""
    return value if isinstance(value, str) else ""


def _do_extract(fitz: Any, file_bytes: bytes, max_pages: int, max_chars: int) -> list[tuple[int, str, bool]]:
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:  # noqa: BLE001 - parser failures must not leak
        raise InvalidDocument("The file is not a readable PDF.") from exc

    try:
        # Encrypted PDFs must be rejected even when they open without a password.
        # Owner-password-only files open with ``needs_pass == 0`` and (on current
        # PyMuPDF) ``is_encrypted is False``, but still carry an /Encrypt
        # dictionary that PyMuPDF exposes via the document metadata. Checking only
        # ``needs_pass`` accepted them.
        if (
            doc.needs_pass
            or getattr(doc, "is_encrypted", False)
            or _encryption_metadata(doc)
        ):
            raise InvalidDocument("Encrypted PDFs are not supported.")
        # A document PyMuPDF had to repair is damaged: the recovered text may not
        # reflect the file the visitor selected, so fail honestly.
        if getattr(doc, "is_repaired", False):
            raise InvalidDocument("The PDF is damaged and could not be read safely.")
        page_count = doc.page_count
        if page_count <= 0:
            raise InvalidDocument("The PDF contains no pages.")
        if page_count > max_pages:
            raise ValidationError(f"The PDF has more than {max_pages} pages.")

        pages: list[tuple[int, str, bool]] = []
        total_chars = 0
        for index in range(page_count):
            try:
                page = doc.load_page(index)
                raw = page.get_text("text") or ""
            except Exception:  # noqa: BLE001
                raw = ""
            text = canonicalize_text(raw)
            readable = bool(text.strip())
            pages.append((index + 1, text, readable))
            total_chars += len(text)
            # Stop at the first cumulative exceedance: later pages must never be
            # loaded or extracted once the running total is already over budget.
            if total_chars > max_chars:
                raise ValidationError("The PDF contains too much extractable text.")

        if pages and all(not readable for _, _, readable in pages):
            raise OCRNotAvailable(
                "No selectable text was found. Upload a text-readable PDF; "
                "OCR is not available in this demo."
            )
        return pages
    finally:
        try:
            doc.close()
        except Exception:  # noqa: BLE001
            pass


def _extract_job(send_conn: Any, file_bytes: bytes, max_pages: int, max_chars: int) -> None:
    try:
        import fitz  # imported only inside the child process

        pages = _do_extract(fitz, file_bytes, max_pages, max_chars)
        send_conn.send(("ok", pages))
    except DemoError as exc:
        send_conn.send(("error", (exc.status_code, exc.code, exc.message)))
    except Exception:  # noqa: BLE001
        send_conn.send(("error", (422, "INVALID_DOCUMENT", "The PDF could not be parsed.")))
    finally:
        try:
            send_conn.close()
        except Exception:  # noqa: BLE001
            pass


_ERROR_MAP: dict[str, type[DemoError]] = {
    "OCR_NOT_AVAILABLE": OCRNotAvailable,
    "INVALID_DOCUMENT": InvalidDocument,
    "VALIDATION_ERROR": ValidationError,
}


def _raise_from_payload(payload: tuple[int, str, str]) -> None:
    _status, code, message = payload
    cls = _ERROR_MAP.get(code, InvalidDocument)
    raise cls(message)


class ParsingExecutor:
    """Bounded spawn-per-parse executor with hard deadline and termination."""

    def __init__(self, max_workers: int = 2) -> None:
        self._max = max(1, max_workers)
        self._active = 0
        self._lock = threading.Lock()

    @property
    def active(self) -> int:
        with self._lock:
            return self._active

    def parse(self, file_bytes: bytes, limits: DemoLimits) -> list[PageText]:
        with self._lock:
            if self._active >= self._max:
                raise Busy("The document parser is busy. Please retry.")
            self._active += 1
        try:
            return self._run(file_bytes, limits)
        finally:
            with self._lock:
                self._active -= 1

    def _run(self, file_bytes: bytes, limits: DemoLimits) -> list[PageText]:
        ctx = multiprocessing.get_context("spawn")
        recv, send = ctx.Pipe(duplex=False)
        process = ctx.Process(
            target=_extract_job,
            args=(send, file_bytes, limits.max_pages, limits.max_extracted_chars),
            daemon=True,
        )
        process.start()
        send.close()
        try:
            if not recv.poll(limits.parse_deadline_seconds):
                raise UpstreamTimeout("Policy parsing timed out.")
            status, payload = recv.recv()
        finally:
            try:
                recv.close()
            except Exception:  # noqa: BLE001
                pass
            if process.is_alive():
                process.terminate()
            process.join(2)

        if status == "ok":
            return [PageText(page=p, text=t, readable=r) for p, t, r in payload]
        _raise_from_payload(payload)
        raise AssertionError("unreachable")  # pragma: no cover


def extract_pages(
    file_bytes: bytes, limits: DemoLimits, executor: ParsingExecutor | None = None
) -> list[PageText]:
    executor = executor or ParsingExecutor(limits.max_parse_workers)
    return executor.parse(file_bytes, limits)


# ── Metadata parsing ───────────────────────────────────────────────────────
def _field_patterns() -> dict[str, list[re.Pattern[str]]]:
    patterns: dict[str, list[re.Pattern[str]]] = {}
    for field, labels in FIELD_LABELS.items():
        compiled = []
        for label in sorted(set(labels), key=len, reverse=True):
            # Anchor the label to the start of the line so a *current* label is
            # required. Unanchored search treated "Example Policy Number:",
            # "Previous Policy Number:" and "Not the Vehicle Registration:" as
            # current values instead of ignoring them.
            compiled.append(
                re.compile(
                    r"(?i)^[ \t]*" + re.escape(label) + r"\s*[:\-]\s*(.+?)\s*$"
                )
            )
        patterns[field] = compiled
    return patterns


_FIELD_PATTERNS = _field_patterns()

# ── Multiline heading context ──────────────────────────────────────────────
# A distractor can be a *heading on its own line* whose labelled values follow
# on later lines ("Previous policy (expired):\nPolicy Number: OLD-44"). Line
# anchoring alone cannot see that context, so the parser would promote the old
# value as current. These helpers retain a bounded heading context per page: a
# historical/example/negated heading suppresses the labels that follow it until
# a section boundary (a blank line) or a genuine CURRENT schedule heading
# re-opens the current context. This is deliberately *not* a broad blacklist:
# a heading never suppresses a label that survives as a complete field label
# after its qualifier words are removed (so "Previous Policy Number: X" stays a
# self-contained same-line distractor handled by anchoring).
_CONTEXT_DISTRACTOR_RE = re.compile(
    r"(?i)\b(previous|prior|old|historical|expired|cancelled|canceled|lapsed|"
    r"superseded|example|sample|illustration|specimen|ignore|invalid|"
    r"do not use|not this policy|not the current|not current)\b"
)
_CONTEXT_CURRENT_RE = re.compile(
    r"(?i)\b(current|schedule|policy details|statement of fact|declaration|section)\b"
)
_DISTRACTOR_QUALIFIER_WORDS = frozenset(
    {
        "previous",
        "prior",
        "old",
        "historical",
        "expired",
        "cancelled",
        "canceled",
        "lapsed",
        "superseded",
        "example",
        "sample",
        "illustration",
        "specimen",
        "ignore",
        "invalid",
        "do",
        "not",
        "use",
        "this",
        "these",
        "values",
        "only",
        "the",
        "a",
        "an",
        "for",
        "of",
        "below",
        "above",
    }
)
_FIELD_LABEL_PHRASES = tuple(
    sorted(
        {label.lower() for labels in FIELD_LABELS.values() for label in labels},
        key=len,
        reverse=True,
    )
)


def _normalised_words(text: str) -> list[str]:
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).split()


def _is_distractor_heading(line: str) -> bool:
    """True when a line is a historical/example/negated heading (not a label)."""
    if not _CONTEXT_DISTRACTOR_RE.search(line):
        return False
    remaining = " ".join(
        word
        for word in _normalised_words(line)
        if word not in _DISTRACTOR_QUALIFIER_WORDS
    )
    return not any(label in remaining for label in _FIELD_LABEL_PHRASES)


def _is_current_heading(line: str) -> bool:
    """True when a line re-opens the current schedule context (a boundary)."""
    if _CONTEXT_DISTRACTOR_RE.search(line):
        return False
    if not _CONTEXT_CURRENT_RE.search(line):
        return False
    joined = " ".join(_normalised_words(line))
    return not any(label in joined for label in _FIELD_LABEL_PHRASES)


def _iter_lines(text: str):
    offset = 0
    for line in text.split("\n"):
        yield offset, line
        offset += len(line) + 1


def parse_metadata(pages: list[PageText]) -> dict[str, MetadataField]:
    occurrences: dict[str, list[tuple[str, Citation]]] = {name: [] for name in METADATA_FIELD_NAMES}

    for page in pages:
        if not page.readable or not page.text:
            continue
        # Context resets at the start of each page and at every section boundary.
        suppressed = False
        for line_offset, line in _iter_lines(page.text):
            if not line.strip():
                suppressed = False
                continue
            if _is_distractor_heading(line):
                suppressed = True
                continue
            if _is_current_heading(line):
                suppressed = False
                continue
            if suppressed:
                continue
            for field, patterns in _FIELD_PATTERNS.items():
                for pattern in patterns:
                    match = pattern.search(line)
                    if not match:
                        continue
                    value = match.group(1).strip()
                    if not value:
                        break
                    value_start = line_offset + match.start(1)
                    value_end = line_offset + match.end(1)
                    quote = page.text[value_start:value_end]
                    citation = Citation(
                        page=page.page,
                        start=value_start,
                        end=value_end,
                        quote=quote,
                    )
                    occurrences[field].append((value, citation))
                    break

    result: dict[str, MetadataField] = {}
    for field in METADATA_FIELD_NAMES:
        found = occurrences[field]
        if not found:
            result[field] = MetadataField(
                value=None, status=MetadataStatus.unknown, citations=[]
            )
            continue
        normalised = {re.sub(r"\s+", " ", value).strip().lower() for value, _ in found}
        citations = [citation for _, citation in found]
        if len(normalised) > 1:
            result[field] = MetadataField(
                value=None, status=MetadataStatus.ambiguous, citations=citations
            )
        else:
            result[field] = MetadataField(
                value=found[0][0], status=MetadataStatus.found, citations=citations
            )
    return result
