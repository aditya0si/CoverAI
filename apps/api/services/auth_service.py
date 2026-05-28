import uuid
import jwt
import httpx
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import bcrypt
import redis.asyncio as aioredis

from core.config import settings
from core.exceptions import CoverAIException

# Async Redis client using REDIS_URL from settings
redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

def hash_password(password: str) -> str:
    """Hash a plain text password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hashed value."""
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def create_access_token(user_id: uuid.UUID, role: str, email: str = "", full_name: str = "", expires_delta: Optional[timedelta] = None) -> str:
    """Create a short-lived access JWT token."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
        
    payload = {
        "sub": str(user_id),
        "role": role,
        "email": email,
        "fullName": full_name,
        "exp": expire,
        "type": "access"
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

async def create_refresh_token(user_id: uuid.UUID) -> str:
    """Create a long-lived refresh JWT token and store it in Redis."""
    expire = datetime.utcnow() + timedelta(days=7)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "refresh"
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    
    # Store refresh token in Redis with a 7-day expiration
    await redis_client.setex(
        f"refresh:{user_id}",
        timedelta(days=7),
        token
    )
    return token

def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT token. Raises 401 CoverAIException if invalid/expired."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise CoverAIException("Token has expired.", status_code=401, error_code="UNAUTHORIZED")
    except jwt.InvalidTokenError:
        raise CoverAIException("Invalid token.", status_code=401, error_code="UNAUTHORIZED")


async def verify_google_token(id_token: str) -> Dict[str, Any]:
    """
    Verify a Google ID token by calling Google's tokeninfo endpoint.
    Returns a dict with keys: sub (google_id), email, name, picture.
    Raises CoverAIException on failure.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": id_token}
            )
        except httpx.RequestError as exc:
            raise CoverAIException(
                "Failed to reach Google authentication servers. Please try again.",
                status_code=503,
                error_code="SERVICE_UNAVAILABLE"
            )

    if response.status_code != 200:
        raise CoverAIException(
            "Invalid Google token. Please sign in again.",
            status_code=401,
            error_code="UNAUTHORIZED"
        )

    token_data = response.json()

    # Validate the audience matches our client ID (if configured)
    google_client_id = getattr(settings, "GOOGLE_CLIENT_ID", None)
    if google_client_id and token_data.get("aud") != google_client_id:
        raise CoverAIException(
            "Google token audience mismatch.",
            status_code=401,
            error_code="UNAUTHORIZED"
        )

    # Ensure email is present and verified
    if not token_data.get("email"):
        raise CoverAIException(
            "Google account has no associated email address.",
            status_code=400,
            error_code="BAD_REQUEST"
        )
    if token_data.get("email_verified") not in ("true", True):
        raise CoverAIException(
            "Google account email is not verified.",
            status_code=400,
            error_code="BAD_REQUEST"
        )

    return {
        "google_id": token_data["sub"],
        "email": token_data["email"],
        "full_name": token_data.get("name", ""),
        "avatar_url": token_data.get("picture", ""),
    }

