import uuid
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field

from core.database import get_db
from core.exceptions import CoverAIException, NotFoundException, ForbiddenException
from core.security import require_role
from core.audit import log_action
import models

advisors_router = APIRouter(prefix="/advisors", tags=["Advisors"])

# ==========================================
# Pydantic Request Schemas
# ==========================================

class AssignmentRequest(BaseModel):
    advisor_email: str = Field(..., pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$", description="Email of the advisor to link")

# ==========================================
# Route Handlers
# ==========================================

@advisors_router.post("/assignments", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    request: Request,
    payload: AssignmentRequest,
    current_user: models.User = Depends(require_role("customer")),
    db: AsyncSession = Depends(get_db)
):
    """
    Allows an authenticated customer to assign/link an advisor to their profile using email.
    Verifies that the target user exists and has the 'advisor' role.
    """
    # 1. Look up target advisor by email
    stmt = select(models.User).where(
        models.User.email == payload.advisor_email,
        models.User.role == models.UserRole.advisor
    )
    advisor = (await db.execute(stmt)).scalar_one_or_none()
    
    if not advisor:
        raise NotFoundException("Advisor with this email not found.")

    if not advisor.is_active:
        raise CoverAIException("The selected advisor account is currently inactive.", status_code=400, error_code="BAD_REQUEST")

    # 2. Check if an active link already exists
    stmt = select(models.AdvisorAssignment).where(
        models.AdvisorAssignment.advisor_id == advisor.id,
        models.AdvisorAssignment.customer_id == current_user.id,
        models.AdvisorAssignment.is_active == True
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    
    if existing:
        return {
            "assignment_id": str(existing.id),
            "advisor_name": advisor.full_name,
            "advisor_email": advisor.email
        }

    # 3. Create new advisor assignment record
    assignment = models.AdvisorAssignment(
        advisor_id=advisor.id,
        customer_id=current_user.id,
        is_active=True
    )
    db.add(assignment)
    await db.flush()  # Populate assignment ID

    # 4. Log Action
    await log_action(
        db=db,
        actor_id=current_user.id,
        action="ASSIGN_ADVISOR",
        resource_type="advisor_assignment",
        resource_id=assignment.id,
        after_state={
            "advisor_id": str(advisor.id),
            "customer_id": str(current_user.id)
        },
        request=request
    )

    await db.commit()

    return {
        "assignment_id": str(assignment.id),
        "advisor_name": advisor.full_name,
        "advisor_email": advisor.email
    }


@advisors_router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: uuid.UUID,
    request: Request,
    current_user: models.User = Depends(require_role("customer")),
    db: AsyncSession = Depends(get_db)
):
    """
    Revokes an advisor assignment. Implements a soft delete by setting
    is_active=False and recording the revocation timestamp.
    """
    assignment = await db.get(models.AdvisorAssignment, assignment_id)
    
    if not assignment:
        raise NotFoundException("Advisor assignment not found.")

    if assignment.customer_id != current_user.id:
        raise ForbiddenException("You do not have permission to revoke this assignment.")

    if not assignment.is_active:
        return {"message": "Advisor assignment was already inactive."}

    # Perform soft-delete update
    assignment.is_active = False
    assignment.revoked_at = datetime.utcnow()

    # Log Action
    await log_action(
        db=db,
        actor_id=current_user.id,
        action="REVOKE_ADVISOR",
        resource_type="advisor_assignment",
        resource_id=assignment.id,
        request=request
    )

    await db.commit()

    return {"message": "Advisor assignment revoked successfully."}


@advisors_router.get("/my-customers")
async def get_my_customers(
    current_user: models.User = Depends(require_role("advisor")),
    db: AsyncSession = Depends(get_db)
):
    """
    Allows a logged in advisor to fetch all customers actively assigned to them.
    """
    stmt = select(models.AdvisorAssignment).where(
        models.AdvisorAssignment.advisor_id == current_user.id,
        models.AdvisorAssignment.is_active == True
    )
    result = await db.execute(stmt)
    assignments = result.scalars().all()

    customers = []
    for assignment in assignments:
        customer = await db.get(models.User, assignment.customer_id)
        if customer:
            # Count active policies
            policy_count_result = await db.execute(
                select(func.count(models.Policy.id)).where(
                    models.Policy.user_id == customer.id,
                    models.Policy.status == models.PolicyStatus.active,
                )
            )
            active_policy_count = policy_count_result.scalar() or 0

            # Count open claims (not approved/rejected/settled)
            open_statuses = [
                models.ClaimStatus.submitted,
                models.ClaimStatus.under_review,
                models.ClaimStatus.surveyor_assigned,
                models.ClaimStatus.draft,
            ]
            claim_count_result = await db.execute(
                select(func.count(models.Claim.id)).where(
                    models.Claim.claimant_id == customer.id,
                    models.Claim.status.in_(open_statuses),
                )
            )
            open_claim_count = claim_count_result.scalar() or 0

            customers.append({
                "customer_id": str(customer.id),
                "customer_name": customer.full_name,
                "customer_email": customer.email,
                "customer_phone": customer.phone,
                "active_policy_count": active_policy_count,
                "open_claim_count": open_claim_count,
                "assigned_at": assignment.granted_at,
            })

    return customers


async def _verify_advisor_customer(advisor_id: uuid.UUID, customer_id: uuid.UUID, db: AsyncSession):
    """Shared helper: verify that an advisor has an active assignment to the given customer."""
    stmt = select(models.AdvisorAssignment).where(
        models.AdvisorAssignment.advisor_id == advisor_id,
        models.AdvisorAssignment.customer_id == customer_id,
        models.AdvisorAssignment.is_active == True,
    )
    assignment = (await db.execute(stmt)).scalar_one_or_none()
    if not assignment:
        raise ForbiddenException("You do not have an active assignment for this customer.")


@advisors_router.get("/my-customers/{customer_id}/policies")
async def get_customer_policies(
    customer_id: uuid.UUID,
    current_user: models.User = Depends(require_role("advisor")),
    db: AsyncSession = Depends(get_db),
):
    """
    GET /advisors/my-customers/{customer_id}/policies
    Returns all policies for an assigned customer (advisor read-only view).
    """
    await _verify_advisor_customer(current_user.id, customer_id, db)

    stmt = select(models.Policy).where(models.Policy.user_id == customer_id).order_by(models.Policy.created_at.desc())
    policies = (await db.execute(stmt)).scalars().all()
    return policies


@advisors_router.get("/my-customers/{customer_id}/claims")
async def get_customer_claims(
    customer_id: uuid.UUID,
    current_user: models.User = Depends(require_role("advisor")),
    db: AsyncSession = Depends(get_db),
):
    """
    GET /advisors/my-customers/{customer_id}/claims
    Returns all claims for an assigned customer (advisor read-only view).
    """
    await _verify_advisor_customer(current_user.id, customer_id, db)

    stmt = select(models.Claim).where(models.Claim.claimant_id == customer_id).order_by(models.Claim.created_at.desc())
    claims = (await db.execute(stmt)).scalars().all()
    return claims
