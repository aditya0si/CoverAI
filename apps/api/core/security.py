import uuid
from typing import Optional
from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.config import settings
from core.database import get_db
from core.exceptions import CoverAIException, NotFoundException, ForbiddenException
from services.auth_service import decode_token
import models

# Standard OAuth2 scheme using Authorization header (Bearer token)
# auto_error=False lets us handle missing tokens ourselves (cookie fallback)
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False
)

async def get_current_user(
    request: Request,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> models.User:
    """
    Decodes the JWT access token from the HttpOnly cookie (set during login) or
    the Authorization: Bearer header as a fallback. Validates the user exists
    in the database and is active. Raises 401 on any failure.

    Cookie-first strategy ensures the standard login flow (which sets HttpOnly
    cookies) works correctly without requiring client-side Bearer header management.
    """
    # 1. Try HttpOnly cookie first (set by /auth/login and /auth/google)
    token: Optional[str] = request.cookies.get("access_token")

    # 2. Fall back to Authorization: Bearer header (API clients / Swagger)
    if not token:
        token = bearer_token

    if not token:
        raise CoverAIException(
            "Not authenticated. Please log in.",
            status_code=401,
            error_code="UNAUTHORIZED"
        )

    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise CoverAIException("Invalid token payload: missing subject.", status_code=401, error_code="UNAUTHORIZED")
        
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise CoverAIException("Invalid token payload: subject is not a valid UUID.", status_code=401, error_code="UNAUTHORIZED")
        
    stmt = select(models.User).where(models.User.id == user_uuid)
    user = (await db.execute(stmt)).scalar_one_or_none()
    
    if not user:
        raise CoverAIException("Authenticated user not found.", status_code=401, error_code="UNAUTHORIZED")
        
    if not user.is_active:
        raise CoverAIException("User account is inactive.", status_code=401, error_code="UNAUTHORIZED")
        
    return user

def require_role(*roles: str):
    """
    Dependency factory to check if the authenticated user has one of the allowed roles.
    Raises 403 Forbidden if not authorized.
    """
    async def dependency(current_user: models.User = Depends(get_current_user)) -> models.User:
        if current_user.role.value not in roles:
            raise ForbiddenException("You do not have permission to access this resource.")
        return current_user
    return dependency

async def require_policy_owner(
    policy_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> models.Policy:
    """
    FastAPI dependency that loads a policy by ID and verifies that the current user
    either owns the policy OR is an advisor with an active assignment to the owner.
    """
    policy = await db.get(models.Policy, policy_id)
    if not policy:
        raise NotFoundException("Policy not found.")
        
    # Check if policy owner
    if policy.user_id == current_user.id:
        return policy
        
    # Check if advisor and has active assignment to owner
    if current_user.role == models.UserRole.advisor:
        stmt = select(models.AdvisorAssignment).where(
            models.AdvisorAssignment.advisor_id == current_user.id,
            models.AdvisorAssignment.customer_id == policy.user_id,
            models.AdvisorAssignment.is_active == True
        )
        assignment = (await db.execute(stmt)).scalar_one_or_none()
        if assignment:
            return policy
            
    raise ForbiddenException("You do not have permission to access this policy.")

async def require_claim_access(
    claim_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> models.Claim:
    """
    FastAPI dependency that loads a claim by ID and verifies that the current user is
    either the claimant (owner), the assigned insurer officer, or an advisor with an active
    assignment to the claimant.
    """
    claim = await db.get(models.Claim, claim_id)
    if not claim:
        raise NotFoundException("Claim not found.")
        
    # Check if claimant (owner)
    if claim.claimant_id == current_user.id:
        return claim
        
    # Check if assigned insurer officer
    if claim.assigned_officer_id == current_user.id:
        return claim
        
    # Check if advisor and has active assignment to owner (claimant)
    if current_user.role == models.UserRole.advisor:
        stmt = select(models.AdvisorAssignment).where(
            models.AdvisorAssignment.advisor_id == current_user.id,
            models.AdvisorAssignment.customer_id == claim.claimant_id,
            models.AdvisorAssignment.is_active == True
        )
        assignment = (await db.execute(stmt)).scalar_one_or_none()
        if assignment:
            return claim
            
    raise ForbiddenException("You do not have permission to access this claim.")
