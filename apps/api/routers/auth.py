import uuid
import re
from typing import Optional
from fastapi import APIRouter, Depends, status, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field, field_validator

from core.database import get_db
from core.exceptions import CoverAIException
from core.security import get_current_user
from core.audit import log_action
from core.encryption import hash_phone
from core.limiter import limiter
from services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    verify_google_token,
)
import models

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])

# ==========================================
# Pydantic Request Schemas
# ==========================================

class RegisterRequest(BaseModel):
    email: str = Field(..., pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    phone: str = Field(..., pattern=r"^[6-9]\d{9}$", description="10-digit Indian mobile number")
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=1)
    role: str = "customer"

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Ensure password contains at least one uppercase letter and at least one digit."""
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit.")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        """Validate that role is a valid UserRole enum value."""
        valid_roles = [r.value for r in models.UserRole]
        if v not in valid_roles:
            raise ValueError(f"Role must be one of {valid_roles}")
        return v

class LoginRequest(BaseModel):
    email: str = Field(..., pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    password: str

class GoogleAuthRequest(BaseModel):
    id_token: str = Field(..., min_length=10, description="Google ID token from Google Sign-In")


# ==========================================
# Helper: Set Auth Cookies on Response
# ==========================================

def _set_auth_cookies(response: Response, access_token: str) -> None:
    """
    Sets the HttpOnly access_token cookie and the readable refresh_token indicator cookie.
    Called consistently from both /login and /auth/google endpoints.
    """
    # HttpOnly cookie carrying the actual JWT — readable only by the server
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,   # Set to True in production (HTTPS)
        samesite="lax",
        max_age=15 * 60  # 15 minutes
    )
    # Non-HttpOnly indicator cookie — readable by Next.js edge middleware for
    # role-based redirect decisions (holds literal "authenticated", not the JWT)
    response.set_cookie(
        key="refresh_token",
        value="authenticated",
        httponly=False,
        secure=False,
        samesite="lax",
        max_age=7 * 24 * 3600  # 7 days
    )


# ==========================================
# Route Handlers
# ==========================================

@auth_router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def register(
    request: Request,
    payload: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Registers a new user inside CoverAI.
    Validates password strength, email formatting, and 10-digit Indian phone structure.
    Additionally spawns consent records and triggers an audit log action.
    """
    # 1. Check duplicate email
    stmt = select(models.User).where(models.User.email == payload.email)
    existing_user = (await db.execute(stmt)).scalar_one_or_none()
    if existing_user:
        raise CoverAIException("A user with this email already exists.", status_code=400, error_code="BAD_REQUEST")

    # 2. Check duplicate phone
    stmt = select(models.User).where(models.User.phone_hash == hash_phone(payload.phone))
    existing_phone = (await db.execute(stmt)).scalar_one_or_none()
    if existing_phone:
        raise CoverAIException("A user with this phone number already exists.", status_code=400, error_code="BAD_REQUEST")

    # 3. Create User record
    hashed_pw = hash_password(payload.password)
    new_user = models.User(
        email=payload.email,
        phone=payload.phone,
        phone_hash=hash_phone(payload.phone),
        hashed_password=hashed_pw,
        role=models.UserRole(payload.role),
        full_name=payload.full_name,
        is_active=True,
        is_verified=True  # Auto-verify during registration for seamless UX
    )
    db.add(new_user)
    await db.flush()  # Populate ID

    # 4. Create consent records (data_processing=True, ai_analysis=True)
    consent_processing = models.ConsentRecord(
        user_id=new_user.id,
        consent_type=models.ConsentType.data_processing,
        granted=True
    )
    consent_ai = models.ConsentRecord(
        user_id=new_user.id,
        consent_type=models.ConsentType.ai_analysis,
        granted=True
    )
    db.add_all([consent_processing, consent_ai])

    # 5. Record Audit Action
    await log_action(
        db=db,
        actor_id=new_user.id,
        action="REGISTER",
        resource_type="user",
        resource_id=new_user.id,
        after_state={
            "email": new_user.email,
            "role": new_user.role.value,
            "full_name": new_user.full_name
        },
        request=request
    )

    await db.commit()

    return {
        "user_id": str(new_user.id),
        "message": "User registered successfully."
    }


@auth_router.post("/login")
@limiter.limit("5/minute")
async def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticates email and password, setting the access token in an HttpOnly cookie
    and the refresh_token indicator cookie for the Next.js edge middleware.
    Returns user information in the response body.
    """
    stmt = select(models.User).where(models.User.email == payload.email)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if not user or not user.hashed_password:
        raise CoverAIException(
            "Invalid email or password. If you signed up with Google, please use Google Sign-In.",
            status_code=401,
            error_code="UNAUTHORIZED"
        )

    if not verify_password(payload.password, user.hashed_password):
        raise CoverAIException("Invalid email or password.", status_code=401, error_code="UNAUTHORIZED")

    if not user.is_active:
        raise CoverAIException("Account is inactive.", status_code=400, error_code="BAD_REQUEST")

    # Issue access token and set cookies
    access_token = create_access_token(user.id, user.role.value, user.email, user.full_name)
    _set_auth_cookies(response, access_token)

    # Record Audit Action
    await log_action(
        db=db,
        actor_id=user.id,
        action="LOGIN",
        resource_type="user",
        resource_id=user.id,
        request=request
    )

    await db.commit()

    return {
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
        }
    }


@auth_router.post("/google")
@limiter.limit("10/minute")
async def google_auth(
    request: Request,
    response: Response,
    payload: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticates a user via Google Sign-In.

    Accepts a Google ID token from the frontend (obtained via Google Identity Services),
    verifies it with Google's tokeninfo API, then either:
    - Creates a new user account (first-time Google sign-in), or
    - Updates the existing user's Google ID and avatar (returning user)

    Sets the same HttpOnly access_token cookie as the standard /auth/login endpoint.
    """
    # 1. Verify the Google ID token with Google
    google_data = await verify_google_token(payload.id_token)
    google_id = google_data["google_id"]
    email = google_data["email"]
    full_name = google_data["full_name"]
    avatar_url = google_data["avatar_url"]

    # 2. Look up existing user by Google ID first, then by email
    user: Optional[models.User] = None

    stmt = select(models.User).where(models.User.google_id == google_id)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if not user:
        # Try matching by email (user may have registered via email/password before)
        stmt = select(models.User).where(models.User.email == email)
        user = (await db.execute(stmt)).scalar_one_or_none()

    if user:
        # Existing user: link Google ID if not already set, refresh avatar
        if user.google_id is None:
            user.google_id = google_id
        if avatar_url:
            user.avatar_url = avatar_url
        if not user.is_active:
            raise CoverAIException("Account is inactive.", status_code=400, error_code="BAD_REQUEST")
        action = "LOGIN_GOOGLE"
    else:
        # New user: create account via Google
        user = models.User(
            email=email,
            full_name=full_name,
            google_id=google_id,
            avatar_url=avatar_url,
            hashed_password=None,   # No password for Google-only accounts
            phone=None,
            phone_hash=None,
            role=models.UserRole.customer,
            is_active=True,
            is_verified=True,       # Google verifies emails
        )
        db.add(user)
        await db.flush()  # Populate ID

        # Create consent records for new Google users
        consent_processing = models.ConsentRecord(
            user_id=user.id,
            consent_type=models.ConsentType.data_processing,
            granted=True
        )
        consent_ai = models.ConsentRecord(
            user_id=user.id,
            consent_type=models.ConsentType.ai_analysis,
            granted=True
        )
        db.add_all([consent_processing, consent_ai])
        action = "REGISTER_GOOGLE"

    # 3. Issue access token and set cookies
    access_token = create_access_token(user.id, user.role.value, user.email, user.full_name or "")
    _set_auth_cookies(response, access_token)

    # 4. Audit log
    await log_action(
        db=db,
        actor_id=user.id,
        action=action,
        resource_type="user",
        resource_id=user.id,
        after_state={"email": user.email, "google_id": google_id},
        request=request
    )

    await db.commit()

    return {
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
        }
    }


@auth_router.post("/refresh")
async def refresh(
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Issues a new access token for an authenticated user and refreshes the HttpOnly cookie.
    Reads the current token from the cookie automatically via get_current_user.
    """
    new_access_token = create_access_token(
        current_user.id, 
        current_user.role.value, 
        current_user.email, 
        current_user.full_name or ""
    )

    # Refresh the HttpOnly cookie so the browser gets the new token automatically
    _set_auth_cookies(response, new_access_token)

    return {
        "access_token": new_access_token,
        "token_type": "bearer"
    }


@auth_router.post("/logout")
async def logout(response: Response):
    """
    Logs out the user by clearing both auth cookies.
    Does NOT require authentication — logout must always succeed even if the
    access token is expired or missing, so users can never get stuck logged in.
    """
    response.delete_cookie("access_token", path="/", samesite="lax")
    response.delete_cookie("refresh_token", path="/", samesite="lax")
    return {"message": "Logged out successfully."}


@auth_router.get("/me")
async def get_me(current_user: models.User = Depends(get_current_user)):
    """
    Returns the currently authenticated user's profile details.
    """
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "phone": current_user.phone,
        "role": current_user.role.value,
        "full_name": current_user.full_name,
        "avatar_url": current_user.avatar_url,
        "is_active": current_user.is_active,
        "is_verified": current_user.is_verified,
        "created_at": current_user.created_at,
        "updated_at": current_user.updated_at
    }
