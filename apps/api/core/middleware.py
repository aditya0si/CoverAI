import uuid
import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("fastapi")

class SecurityAndRequestIdMiddleware(BaseHTTPMiddleware):
    """
    HTTP Middleware that:
    1. Injects a unique X-Request-ID header in every request and response.
    2. Adds security hardening headers:
       - X-Content-Type-Options: nosniff
       - X-Frame-Options: DENY
       - Referrer-Policy: strict-origin-when-cross-origin
       - Content-Security-Policy: default-src 'self'; frame-ancestors 'none';
    3. Calculates request processing latency in milliseconds.
    4. Logs request statistics as a structured JSON record.
    """
    async def dispatch(self, request: Request, call_next):
        # Retrieve or generate Request ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        
        # Mount Request ID to request.state so logger or routers can access it
        request.state.request_id = request_id
        
        start_time = time.time()
        
        # Proceed with request pipeline
        response = await call_next(request)
        
        # Calculate latency
        duration_ms = int((time.time() - start_time) * 1000)
        
        # Set response headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Relax or omit Content-Security-Policy for API docs to allow CDN/inline scripts to load
        path = request.url.path
        if path in ["/docs", "/redoc", "/api/v1/openapi.json"]:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "img-src 'self' data: https://fastapi.tiangolo.com; "
                "frame-ancestors 'none';"
            )
        else:
            response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none';"
        response.headers["X-Process-Time-Ms"] = str(duration_ms)
        
        # Extract user ID if authenticated
        user_id = None
        try:
            # Retrieve from state
            user = getattr(request.state, "user", None)
            if user and hasattr(user, "id"):
                user_id = str(user.id)
        except Exception:
            pass
            
        # Log structured request statistics
        logger_extra = {
            "request_id": request_id,
            "user_id": user_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms
        }
        
        logger.info(
            f"Processed {request.method} {request.url.path} -> {response.status_code} ({duration_ms}ms)",
            extra=logger_extra
        )
        
        return response
