import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from core.database import get_db
from core.security import require_role
from core.audit import log_action
from core.exceptions import NotFoundException, CoverAIException
import models
import schemas

admin_router = APIRouter(prefix="/admin", tags=["Admin"])


class AssignOfficerRequest(BaseModel):
    officer_id: uuid.UUID


@admin_router.post(
    "/claims/{claim_id}/assign",
    status_code=status.HTTP_200_OK,
    summary="Assign a claim to an insurer officer (admin only)"
)
async def admin_assign_claim(
    claim_id: uuid.UUID,
    request: Request,
    payload: AssignOfficerRequest,
    current_user: models.User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/v1/admin/claims/{claim_id}/assign
    - Role: admin only
    - Body: {officer_id: UUID}
    - Sets claim.assigned_officer_id
    - Transitions status to under_review if currently submitted
    """
    # 1. Fetch Claim
    claim = await db.get(models.Claim, claim_id)
    if not claim:
        raise NotFoundException("Claim not found.")

    # 2. Fetch Officer
    officer = await db.get(models.User, payload.officer_id)
    if not officer:
        raise NotFoundException("Officer not found.")

    if officer.role != models.UserRole.insurer_officer:
        raise CoverAIException(
            "Target user is not an insurer officer.",
            status_code=400,
            error_code="INVALID_ROLE"
        )

    before_state = {
        "assigned_officer_id": str(claim.assigned_officer_id) if claim.assigned_officer_id else None,
        "status": claim.status.value,
    }

    # 3. Assign officer
    claim.assigned_officer_id = officer.id

    # 4. Auto-transition submitted → under_review
    if claim.status == models.ClaimStatus.submitted:
        claim.status = models.ClaimStatus.under_review

    await db.flush()

    await log_action(
        db=db,
        actor_id=current_user.id,
        action="CLAIM_ASSIGN_OFFICER",
        resource_type="claim",
        resource_id=claim.id,
        before=before_state,
        after={
            "assigned_officer_id": str(officer.id),
            "status": claim.status.value,
        },
        request=request,
    )

    await db.commit()

    return {
        "claim_id": str(claim.id),
        "claim_number": claim.claim_number,
        "assigned_officer_id": str(officer.id),
        "status": claim.status.value,
        "message": f"Claim assigned to {officer.full_name}.",
    }


@admin_router.get(
    "/audit-logs",
    response_model=List[schemas.AuditLogOut],
    summary="Get all system audit logs (admin and insurer officer only)"
)
async def get_audit_logs(
    search: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    current_user: models.User = Depends(require_role("admin", "insurer_officer")),
    db: AsyncSession = Depends(get_db)
):
    """
    GET /api/v1/admin/audit-logs
    - Role: admin or insurer_officer
    - Queries all system audit logs, supports searching and paging.
    """
    from sqlalchemy import select, or_, and_
    
    offset = (page - 1) * limit
    
    stmt = select(models.AuditLog)
    filters = []
    
    if action:
        filters.append(models.AuditLog.action == action)
    if resource_type:
        filters.append(models.AuditLog.resource_type == resource_type)
    if search:
        # Search action, resource_type, ip_address, etc.
        search_filter = or_(
            models.AuditLog.action.ilike(f"%{search}%"),
            models.AuditLog.resource_type.ilike(f"%{search}%"),
            models.AuditLog.ip_address.ilike(f"%{search}%")
        )
        filters.append(search_filter)
        
    if filters:
        stmt = stmt.where(and_(*filters))
        
    stmt = stmt.order_by(models.AuditLog.created_at.desc()).offset(offset).limit(limit)
    
    result = await db.execute(stmt)
    logs = result.scalars().all()
    
    return logs

