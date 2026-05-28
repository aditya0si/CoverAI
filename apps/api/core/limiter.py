from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

def rate_limit_key_func(request: Request) -> str:
    """
    Custom rate limiting key function that attempts to rate limit by authenticated
    user ID first, falling back to standard remote IP address if unauthenticated.
    """
    # Check if a user has been mounted to the request state by auth middleware
    user = getattr(request.state, "user", None)
    if user and hasattr(user, "id"):
        return f"user:{user.id}"
    return get_remote_address(request)

# Initialize global rate limiter with a default limit of 60 requests per minute
limiter = Limiter(
    key_func=rate_limit_key_func,
    default_limits=["60/minute"]
)
