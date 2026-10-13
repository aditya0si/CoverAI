"""Simulated handoff creation and per-session simulated inbox listing."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from .contracts import Citation, Handoff, InboxEntry, InboxResponse, Explanation
from .errors import NotFound, RateLimited
from .service import DemoService, _digest
from .store import DemoSession, DemoStore, PreparedResult, SessionSnapshot, StoredResponse

RECIPIENT_MECHANIC = "simulated_mechanic"
RECIPIENT_OFFICER = "simulated_officer"

_RECIPIENT_KEYS = {
    "mechanic": RECIPIENT_MECHANIC,
    "officer": RECIPIENT_OFFICER,
}


def _collect_citations(explanation: Explanation) -> list[Citation]:
    citations: list[Citation] = []
    seen: set[tuple[int, int, int]] = set()
    for finding in explanation.findings:
        for citation in finding.citations:
            marker = (citation.page, citation.start, citation.end)
            if marker not in seen:
                seen.add(marker)
                citations.append(citation)
    return citations


def _build_entry(recipient: str, title: str, explanation: Explanation) -> InboxEntry:
    return InboxEntry(
        id=uuid4(),
        recipient=recipient,  # type: ignore[arg-type]
        title=title,
        narrative=(
            "Simulated routing only. The visitor described: "
            f"\"{explanation.narrative}\" "
            "No real party has been contacted and no claim exists."
        ),
        citations=_collect_citations(explanation),
    )


def create_handoff(
    service: DemoService, session: DemoSession, explanation_id: UUID, key: UUID
) -> Handoff:
    payload_digest = _digest(str(explanation_id).encode("utf-8"))

    def prepare(snapshot: SessionSnapshot) -> PreparedResult:
        explanation = snapshot.explanations.get(str(explanation_id))
        if explanation is None:
            raise NotFound("The requested explanation is not available in this session.")

        # Exactly one handoff per explanation, even under a new idempotency key.
        for existing in snapshot.handoffs.values():
            if existing.explanation_id == explanation_id:
                return PreparedResult(
                    StoredResponse(status_code=201, body=existing), lambda _active: None
                )

        if len(snapshot.handoffs) >= service.limits.max_handoffs:
            raise RateLimited("The simulated handoff limit for this session has been reached.")

        handoff = Handoff(
            id=uuid4(),
            explanation_id=explanation_id,
            simulated=True,
            status="simulated_created",
            mechanic=_build_entry(
                RECIPIENT_MECHANIC,
                "Simulated mechanic inbox — policy wording for review",
                explanation,
            ),
            officer=_build_entry(
                RECIPIENT_OFFICER,
                "Simulated insurance officer inbox — policy wording for review",
                explanation,
            ),
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        def apply(active: DemoSession) -> None:
            active.handoffs[str(handoff.id)] = handoff

        return PreparedResult(StoredResponse(status_code=201, body=handoff), apply)

    stored = service.store.commit(
        session.token_digest,
        session.generation,
        "handoff",
        key,
        payload_digest,
        prepare,
        rate_buckets=service.store.mutation_rate_buckets(session),
    )
    return stored.body  # type: ignore[return-value]


def list_inbox(store: DemoStore, session: DemoSession, recipient: str) -> InboxResponse:
    recipient_key = _RECIPIENT_KEYS.get(recipient)
    if recipient_key is None:
        raise NotFound("Unknown simulated inbox recipient.")
    # Snapshot under the session lock so a concurrent reset cannot clear the
    # handoff table mid-iteration, and expiry returns 410 rather than stale rows.
    snapshot = store.read_snapshot(session)
    entries: list[InboxEntry] = []
    for handoff in snapshot.handoffs.values():
        if recipient_key == RECIPIENT_MECHANIC:
            entries.append(handoff.mechanic)
        else:
            entries.append(handoff.officer)
    return InboxResponse(simulated=True, entries=entries)
