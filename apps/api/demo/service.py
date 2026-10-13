"""Deterministic demo service: validation, upload, explanation and reads."""

from __future__ import annotations

import hashlib
import json
import re
from uuid import UUID, uuid4

from .config import DemoLimits
from .contracts import (
    NOT_FOUND_TEXT,
    Citation,
    Document,
    Explanation,
    Finding,
    PageText,
)
from .errors import (
    Conflict,
    InvalidDocument,
    NotFound,
    PayloadTooLarge,
    RateLimited,
    UnsupportedMedia,
    ValidationError,
)
from .extraction import ParsingExecutor, parse_metadata
from .retrieval import STOPWORDS_VERSION, retrieve
from .store import (
    DemoSession,
    DemoStore,
    PreparedResult,
    SessionSnapshot,
    StoredResponse,
)

ALLOWED_MIME = {"application/pdf", "application/octet-stream"}
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def sanitize_filename(filename: str | None) -> str:
    if not filename:
        return "uploaded.pdf"
    name = filename.replace("\\", "/").split("/")[-1]
    name = _CONTROL_CHARS.sub("", name).strip()
    if not name:
        return "uploaded.pdf"
    return name[:255]


def _digest(*parts: bytes) -> str:
    hasher = hashlib.sha256()
    for part in parts:
        hasher.update(part)
        hasher.update(b"\x00")
    return hasher.hexdigest()


class DemoService:
    def __init__(self, store: DemoStore, limits: DemoLimits, parser: ParsingExecutor) -> None:
        self.store = store
        self.limits = limits
        self.parser = parser

    # ── upload ─────────────────────────────────────────────────────────────
    def upload(
        self,
        session: DemoSession,
        file_bytes: bytes,
        filename: str | None,
        content_type: str | None,
        key: UUID,
    ) -> Document:
        display_name = sanitize_filename(filename)
        if not display_name.lower().endswith(".pdf"):
            raise UnsupportedMedia("Only .pdf policy files are accepted.")

        # Strict media contract: a MIME type must be present and allowlisted.
        base_type = (content_type or "").split(";")[0].strip().lower()
        if base_type not in ALLOWED_MIME:
            raise UnsupportedMedia("Only PDF uploads are accepted.")

        if not file_bytes:
            raise InvalidDocument("The uploaded file is empty.")
        if len(file_bytes) > self.limits.max_upload_bytes:
            raise PayloadTooLarge("The PDF exceeds the 10 MiB upload limit.")
        # The %PDF- signature must be at the very start of the file.
        if not file_bytes.startswith(b"%PDF-"):
            raise InvalidDocument("The file is not a valid PDF (missing signature).")

        payload_digest = _digest(file_bytes, display_name.encode("utf-8"))

        def prepare(snapshot: SessionSnapshot) -> PreparedResult:
            pages = self.parser.parse(file_bytes, self.limits)
            metadata = parse_metadata(pages)
            prior = snapshot.document
            revision = (prior.revision + 1) if prior else 1
            unreadable = [page.page for page in pages if not page.readable]
            document = Document(
                id=uuid4(),
                revision=revision,
                filename=display_name,
                page_count=len(pages),
                unreadable_pages=unreadable,
                metadata=metadata,
            )

            def apply(active: DemoSession) -> None:
                # Successful replacement clears prior accident/handoff state and,
                # by bumping the generation, invalidates every prior replay entry.
                active.document = document
                active.pages = list(pages)
                active.explanations.clear()
                active.handoffs.clear()
                active.idempotency.clear()
                active.generation += 1

            return PreparedResult(StoredResponse(status_code=201, body=document), apply)

        stored = self.store.commit(
            session.token_digest,
            session.generation,
            "upload",
            key,
            payload_digest,
            prepare,
            rate_buckets=self.store.upload_rate_buckets(session),
        )
        return stored.body  # type: ignore[return-value]

    # ── explanation ────────────────────────────────────────────────────────
    def explain(
        self,
        session: DemoSession,
        document_id: UUID,
        document_revision: int,
        narrative: str,
        key: UUID,
    ) -> Explanation:
        trimmed = narrative.strip()
        if len(trimmed) < self.limits.min_narrative:
            raise ValidationError(
                f"The accident description must be at least {self.limits.min_narrative} characters."
            )
        if len(trimmed) > self.limits.max_narrative:
            raise ValidationError(
                f"The accident description must be at most {self.limits.max_narrative} characters."
            )

        payload_digest = _digest(
            json.dumps(
                {
                    "document_id": str(document_id),
                    "document_revision": document_revision,
                    "narrative": trimmed,
                    "mode": "deterministic",
                },
                sort_keys=True,
            ).encode("utf-8")
        )

        def prepare(snapshot: SessionSnapshot) -> PreparedResult:
            document = snapshot.document
            if document is None or document.id != document_id:
                raise NotFound("The requested document is not available in this session.")
            if document.revision != document_revision:
                raise Conflict("The document revision is stale. Re-upload or reload.")
            if len(snapshot.explanations) >= self.limits.max_explanations:
                raise RateLimited("The explanation limit for this session has been reached.")

            pages = list(snapshot.pages)
            outcome = retrieve(
                pages,
                trimmed,
                max_excerpts=self.limits.max_excerpts,
                max_excerpt_chars=self.limits.max_excerpt_chars,
            )
            citations = outcome.citations
            self._verify_citations(pages, citations)

            findings: list[Finding] = []
            if citations:
                for citation in citations:
                    findings.append(
                        Finding(
                            kind="relevant_excerpt",
                            text=(
                                "The uploaded document contains this potentially relevant "
                                f"wording (page {citation.page}); applicability requires review."
                            ),
                            citations=[citation],
                        )
                    )
            else:
                findings.append(Finding(kind="not_found", text=NOT_FOUND_TEXT, citations=[]))

            limitations = [
                "Lexical keyword matching only; this is not a legal or coverage determination.",
                f"English-only tokenization (fixed stopword list {STOPWORDS_VERSION}).",
                "The accident description is user-reported and is not evidence of policy wording.",
            ]
            if document.unreadable_pages:
                limitations.append(
                    "Partial extraction: pages "
                    + ", ".join(str(p) for p in document.unreadable_pages)
                    + " could not be read as text and were not analysed."
                )
            if outcome.omitted_matches:
                limitations.append(
                    "Additional matching wording was found in the readable pages but not "
                    f"displayed: only the first {self.limits.max_excerpts} matching excerpts "
                    "are shown. Review the readable pages for a complete view."
                )
            if outcome.truncated_excerpts:
                limitations.append(
                    "A displayed excerpt was limited to the "
                    f"{self.limits.max_excerpt_chars}-character window; the cited page "
                    "contains additional wording around this passage."
                )

            explanation = Explanation(
                id=uuid4(),
                document_id=document.id,
                document_revision=document.revision,
                mode="deterministic",
                narrative=trimmed,
                findings=findings,
                limitations=limitations,
                created_at=_now_iso(),
            )

            def apply(active: DemoSession) -> None:
                active.explanations[str(explanation.id)] = explanation

            return PreparedResult(StoredResponse(status_code=201, body=explanation), apply)

        stored = self.store.commit(
            session.token_digest,
            session.generation,
            "explain",
            key,
            payload_digest,
            prepare,
            rate_buckets=self.store.mutation_rate_buckets(session),
        )
        return stored.body  # type: ignore[return-value]

    # ── reads ──────────────────────────────────────────────────────────────
    def get_page(self, session: DemoSession, document_id: UUID, page: int) -> PageText:
        # A single atomic snapshot is taken under the session lock after the
        # lifecycle re-check: a concurrent reupload/reset/expiry can never land
        # between the document identity check and the page indexing read.
        snapshot = self.store.read_snapshot(session)
        document = snapshot.document
        if document is None or document.id != document_id:
            raise NotFound("The requested document is not available in this session.")
        if page < 1 or page > len(snapshot.pages):
            raise NotFound("The requested page does not exist.")
        return snapshot.pages[page - 1]

    def get_explanation(self, session: DemoSession, explanation_id: UUID) -> Explanation:
        snapshot = self.store.read_snapshot(session)
        explanation = snapshot.explanations.get(str(explanation_id))
        if explanation is None:
            raise NotFound("The requested explanation is not available in this session.")
        return explanation

    @staticmethod
    def _verify_citations(pages: list[PageText], citations: list[Citation]) -> None:
        by_page = {page.page: page.text for page in pages}
        for citation in citations:
            text = by_page.get(citation.page)
            if text is None or text[citation.start : citation.end] != citation.quote:
                raise ValidationError("An internal citation failed verification.")


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
