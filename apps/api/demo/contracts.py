"""Public contracts for the anonymous demo.

These shapes mirror ``apps/web/src/demo/contracts.ts`` exactly. Request models
forbid unknown fields so malformed clients fail loudly rather than silently.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

# ── Mandatory persistent copy ──────────────────────────────────────────────
SIMULATION_WARNING = (
    "Simulation only — no claim has been filed and no mechanic or insurer has "
    "been contacted. This is not a coverage decision."
)
DETERMINISTIC_MODE_LABEL = "Document excerpts — deterministic, not AI-generated."
EXTERNAL_MODEL_MODE_LABEL = "External-model explanation — verify against the cited pages."
HANDOFF_BUTTON_LABEL = "Create simulated handoff"
NOT_FOUND_TEXT = (
    "No matching clause found in the readable pages. This does not establish "
    "coverage or exclusion."
)
METADATA_FIELD_NAMES = (
    "insurer_name",
    "policy_number",
    "vehicle_registration",
    "vehicle_year",
    "premium",
    "insured_value",
    "start_date",
    "end_date",
)
UNKNOWN_METADATA_DISPLAY = "Not found in readable policy text"
AMBIGUOUS_METADATA_DISPLAY = "Conflicting values — review cited pages"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PageText(StrictModel):
    page: int = Field(ge=1)
    text: str
    readable: bool


class Citation(StrictModel):
    page: int = Field(ge=1)
    start: int = Field(ge=0)
    end: int
    quote: str

    @model_validator(mode="after")
    def _end_after_start(self) -> "Citation":
        if self.end <= self.start:
            raise ValueError("citation end must be greater than start")
        return self


class MetadataStatus(str, Enum):
    found = "found"
    unknown = "unknown"
    ambiguous = "ambiguous"


class MetadataField(StrictModel):
    value: str | None = None
    status: MetadataStatus
    citations: list[Citation] = Field(default_factory=list)


class Document(StrictModel):
    id: UUID
    revision: int = Field(ge=1)
    filename: str
    page_count: int = Field(ge=0)
    unreadable_pages: list[int] = Field(default_factory=list)
    metadata: dict[str, MetadataField]


class Finding(StrictModel):
    kind: Literal["relevant_excerpt", "not_found"]
    text: str
    citations: list[Citation] = Field(default_factory=list)


class Explanation(StrictModel):
    id: UUID
    document_id: UUID
    document_revision: int
    mode: Literal["deterministic", "external_model"]
    narrative: str
    findings: list[Finding]
    limitations: list[str]
    created_at: str


class InboxEntry(StrictModel):
    id: UUID
    recipient: Literal["simulated_mechanic", "simulated_officer"]
    title: str
    narrative: str
    citations: list[Citation] = Field(default_factory=list)


class Handoff(StrictModel):
    id: UUID
    explanation_id: UUID
    simulated: bool = True
    status: Literal["simulated_created"] = "simulated_created"
    mechanic: InboxEntry
    officer: InboxEntry
    created_at: str


# ── Request models ─────────────────────────────────────────────────────────
class SessionCreateRequest(StrictModel):
    """Empty JSON body for POST /session."""


class ExplainRequest(StrictModel):
    document_id: UUID
    document_revision: int = Field(ge=1)
    narrative: str
    mode: Literal["deterministic", "external_model"] = "deterministic"


class HandoffRequest(StrictModel):
    explanation_id: UUID


# ── Response models ────────────────────────────────────────────────────────
class SessionCreated(StrictModel):
    expires_at: str
    csrf_token: str
    mode: Literal["deterministic"] = "deterministic"


class SessionView(StrictModel):
    expires_at: str
    mode: Literal["deterministic"] = "deterministic"
    csrf_token: str
    document: Document | None = None


class InboxResponse(StrictModel):
    simulated: bool = True
    entries: list[InboxEntry] = Field(default_factory=list)


class ErrorBody(StrictModel):
    code: str
    message: str
    request_id: str


class ErrorEnvelope(StrictModel):
    error: ErrorBody
