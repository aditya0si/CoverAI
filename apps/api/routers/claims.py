"""
Claims router — thin HTTP adapter over ClaimService.

All claim business logic (state transitions, policy checks, audit logging,
background dispatch) lives in ``services.claim_service``; this module only
validates input, resolves access, and maps service results to responses.
"""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, require_role
from core.exceptions import NotFoundException, ForbiddenException
from core.background_tasks import dispatch
from schemas.claim import (
    ClaimCreate,
    ClaimStatusTransition,
    ClaimCreateResponse,
    ClaimSubmitResponse,
    ClaimDetailResponse,
)
from services.claim_service import ClaimService
import models

claims_router = APIRouter(prefix="/claims", tags=["Claims"])


# ── Access helper ───────────────────────────────────────────────────────────

async def _claim_with_access(
    claim_id: uuid.UUID,
    current_user: models.User,
    db: AsyncSession,
) -> models.Claim:
    """
    Load a claim and verify the actor may view/modify it.

    Allowed: admin and insurer officers (internal roles), the claimant,
    the assigned officer, and advisors with an active assignment to the claimant.
    """
    claim = await db.get(models.Claim, claim_id)
    if not claim:
        raise NotFoundException("Claim not found.")

    if current_user.role in (models.UserRole.admin, models.UserRole.insurer_officer):
        return claim

    if claim.claimant_id == current_user.id or claim.assigned_officer_id == current_user.id:
        return claim

    if current_user.role == models.UserRole.advisor:
        stmt = select(models.AdvisorAssignment).where(
            models.AdvisorAssignment.advisor_id == current_user.id,
            models.AdvisorAssignment.customer_id == claim.claimant_id,
            models.AdvisorAssignment.is_active.is_(True),
        )
        assignment = (await db.execute(stmt)).scalar_one_or_none()
        if assignment:
            return claim

    raise ForbiddenException("You do not have permission to access this claim.")


# ── Endpoints ───────────────────────────────────────────────────────────────

@claims_router.post(
    "",
    response_model=ClaimCreateResponse,
    status_code=201,
    summary="File a new claim (draft)",
)
async def create_claim(
    payload: ClaimCreate,
    request: Request,
    current_user: models.User = Depends(require_role("customer")),
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/v1/claims
    Creates a claim in draft status. Validates policy ownership, active status,
    and that the incident date falls inside the policy period.
    """
    service = ClaimService(db=db, user=current_user, request=request)
    result = await service.create(payload.model_dump())
    await db.commit()
    return result


@claims_router.get("", summary="List claims visible to the current user")
async def list_claims(
    status: models.ClaimStatus | None = None,
    claim_type: models.ClaimType | None = None,
    risk_level: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/v1/claims
    Role-scoped list:
    - customer: own claims
    - advisor: claims of assigned customers
    - insurer_officer: full non-draft queue
    - admin: everything
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


@claims_router.get(
    "/{claim_id}",
    response_model=ClaimDetailResponse,
    summary="Get full claim detail (images, history, policy)",
)
async def get_claim(
    claim_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/v1/claims/{claim_id}
    Returns claim metadata plus signed image URLs, audit history, and policy context.
    """
    await _claim_with_access(claim_id, current_user, db)
    service = ClaimService(db=db, user=current_user)
    return await service.get(claim_id)


@claims_router.post(
    "/{claim_id}/submit",
    response_model=ClaimSubmitResponse,
    summary="Submit a draft claim for review",
)
async def submit_claim(
    claim_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(require_role("customer")),
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/v1/claims/{claim_id}/submit
    Requires at least one uploaded image. Dispatches insurer notification and
    background AI triage after the transaction commits.
    """
    service = ClaimService(db=db, user=current_user)
    result = await service.submit(claim_id)
    await db.commit()

    # Fire background work only after the commit so the new session sees the claim.
    dispatch(background_tasks, result.get("_background_task"))
    dispatch(background_tasks, ("run_ai_triage", claim_id))

    return {k: v for k, v in result.items() if k != "_background_task"}


@claims_router.patch(
    "/{claim_id}/status",
    summary="Transition a claim to a new status (officer adjudication)",
)
async def update_claim_status(
    claim_id: uuid.UUID,
    payload: ClaimStatusTransition,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(require_role("insurer_officer", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    PATCH /api/v1/claims/{claim_id}/status
    Enforces the state machine (e.g. draft→approved is rejected). Approving
    requires an approved_amount. Notifies the customer on status change.
    """
    service = ClaimService(db=db, user=current_user)
    claim, task = await service.transition(
        claim_id,
        payload.status,
        remarks=payload.remarks,
        approved_amount=payload.approved_amount,
    )
    await db.commit()

    dispatch(background_tasks, task.get("_background_task"))
    return claim


@claims_router.post(
    "/{claim_id}/images",
    status_code=201,
    summary="Upload a claim damage image (JPEG/PNG/WebP, ≤10 MB)",
)
async def upload_claim_image(
    claim_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_role("customer")),
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/v1/claims/{claim_id}/images
    Validates file type, size, and magic bytes. Dispatches background vision
    analysis per uploaded image.
    """
    service = ClaimService(db=db, user=current_user)
    results = await service.upload_images(claim_id, [file])

    for result in results:
        dispatch(background_tasks, result.get("_background_task"))

    return {k: v for k, v in results[0].items() if k != "_background_task"}


@claims_router.get("/{claim_id}/images", summary="List images for a claim")
async def list_claim_images(
    claim_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/v1/claims/{claim_id}/images
    Returns images with signed URLs and AI damage metadata.
    """
    await _claim_with_access(claim_id, current_user, db)
    service = ClaimService(db=db, user=current_user)
    return await service.list_images(claim_id)