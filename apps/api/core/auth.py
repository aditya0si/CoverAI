import uuid
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.config import settings
import models

security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> models.User:
    """
    Authenticate the current user from either:
    1. Authorization: Bearer <token> header (API clients)
    2. access_token HttpOnly cookie (browser sessions)

    Decodes and verifies the JWT against settings.JWT_SECRET,
    then looks up the user in the database.
    Raises 401 if token is missing, invalid, expired, or user not found.
    """
    token: str | None = None

    # Try Authorization header first (API clients)
    if credentials:
        token = credentials.credentials

    # Fallback to HttpOnly cookie (browser sessions)
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Decode and verify JWT
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        user_id_str: str | None = payload.get("sub")
        if not user_id_str:
            raise HTTPException(status_code=401, detail="Invalid token payload.")
        user_id = uuid.UUID(user_id_str)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token. Please log in again.")
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid token payload.")

    # Look up user in database
    stmt = select(models.User).where(models.User.id == user_id)
    user: models.User | None = (await db.execute(stmt)).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not found.")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive.")

    return user
