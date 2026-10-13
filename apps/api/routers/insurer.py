"""
Insurer router — queue and adjudication endpoints for insurer officers.

Mirrors the customer-facing claims router but is scoped to the internal
insurer workflow: pull from the queue, self-assign, assign surveyors,
and adjudicate (approve/reject).
"""
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from core.database import get_db
from core.security import require_role
from core.exceptions import CoverAIException
from core.background_tasks import dispatch
from services.claim_service import ClaimService
import models

insurer_router = APIRouter(prefix="/insurer", tags=["Insurer"])


# ── Request schemas ─────────────────────────────────────────────────────────

class SurveyorAssignRequest(BaseModel):
    surveyor_id: uuid.UUID


class AdjudicateRequest(BaseModel):
    decision: str
    approved_amount: Optional[float] = None
    rejection_reason: Optional[str] = None
    internal_notes: Optional[str] = None


# ── Endpoints ───────────────────────────────────────────────────────────────

@insurer_router.get(
    "/claims/queue",
    summary="Get the shared insurer claim queue (all non-draft claims)",
)
async def get_claims_queue(
    status: models.ClaimStatus | None = None,
    claim_type: models.ClaimType | None = None,
    risk_level: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    current_user: models.User = Depends(require_role("insurer_officer", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/v1/insurer/claims/queue
    Every submitted and active claim awaiting review, regardless of assignment.
    Supports status/type/risk/date filters and pagination.
    """
    service = ClaimService(db=db, user=current_user)
    return await service.list(
        status=status,
        claim_type=claim_type,
        risk_level=risk_level,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )


@insurer_router.post(
    "/claims/{claim_id}/assign-self",
    summary="Self-assign a claim (submitted → under_review)",
)
async def assign_self(
    claim_id: uuid.UUID,
    current_user: models.User = Depends(require_role("insurer_officer", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/v1/insurer/claims/{claim_id}/assign-self
    Claims the claim for the current officer. If the claim is submitted,
    it auto-transitions to under_review.
    """
    service = ClaimService(db=db, user=current_user)
    claim = await service.assign_self(claim_id)
    await db.commit()
    return claim


@insurer_router.post(
    "/claims/{claim_id}/assign-surveyor",
    summary="Assign a surveyor for field inspection (under_review → surveyor_assigned)",
)
async def assign_surveyor(
    claim_id: uuid.UUID,
    payload: SurveyorAssignRequest,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(require_role("insurer_officer", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/v1/insurer/claims/{claim_id}/assign-surveyor
    Transitions the claim to surveyor_assigned with the surveyor recorded in
    the audit trail.
    """
    service = ClaimService(db=db, user=current_user)
    claim, task = await service.transition(
        claim_id,
        models.ClaimStatus.surveyor_assigned,
        remarks=f"Surveyor {payload.surveyor_id} assigned for field inspection.",
    )
    await db.commit()

    dispatch(background_tasks, task.get("_background_task"))

    return {
        "message": "Surveyor assigned successfully.",
        "claim_id": str(claim.id),
        "surveyor_id": str(payload.surveyor_id),
    }


@insurer_router.post(
    "/claims/{claim_id}/adjudicate",
    summary="Approve or reject a claim",
)
async def adjudicate_claim(
    claim_id: uuid.UUID,
    payload: AdjudicateRequest,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(require_role("insurer_officer", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/v1/insurer/claims/{claim_id}/adjudicate
    Convenience wrapper over the status transition: decision must be
    'approved' or 'rejected'. Approval requires an approved_amount.
    """
    decision = (payload.decision or "").lower()
    if decision not in ("approved", "rejected"):
        raise CoverAIException(
            "decision must be either 'approved' or 'rejected'.",
            status_code=400,
            error_code="INVALID_DECISION",
        )

    target = (
        models.ClaimStatus.approved
        if decision == "approved"
        else models.ClaimStatus.rejected
    )
    remarks = payload.rejection_reason or payload.internal_notes or f"Adjudicated: {decision}"

    service = ClaimService(db=db, user=current_user)
    claim, task = await service.transition(
        claim_id,
        target,
        remarks=remarks,
        approved_amount=payload.approved_amount if decision == "approved" else None,
    )
    await db.commit()

    dispatch(background_tasks, task.get("_background_task"))
    return claim