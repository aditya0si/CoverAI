import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from core.config import settings
from core.scheduler import init_scheduler, scheduler
from core.limiter import limiter
from core.middleware import SecurityAndRequestIdMiddleware
from core.logging_config import setup_logging
from prometheus_fastapi_instrumentator import Instrumentator

# Set up structured JSON logging
setup_logging()
from core.exceptions import (  # noqa: E402
    CoverAIException,
    coverai_exception_handler,
    validation_exception_handler,
    http_exception_handler,
    generic_exception_handler,
)
from routers import (  # noqa: E402
    users_router,
    vehicles_router,
    policies_router,
    claims_router,
    conversations_router,
    auth_router,
    advisors_router,
    admin_router,
    consent_router,
    evals_router,
)

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the retention scheduler on boot and shut it down on exit."""
    init_scheduler()
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Connect slowapi rate limiter
app.state.limiter = limiter

# Set up CORS middleware
if settings.ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.ALLOWED_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Connect security and Request ID tracking middleware
app.add_middleware(SecurityAndRequestIdMiddleware)

# Register Global Exception Handlers
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(CoverAIException, coverai_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Include Routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(advisors_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.API_V1_STR)
app.include_router(users_router, prefix=settings.API_V1_STR)
app.include_router(vehicles_router, prefix=settings.API_V1_STR)
app.include_router(policies_router, prefix=settings.API_V1_STR)
app.include_router(claims_router, prefix=settings.API_V1_STR)
app.include_router(conversations_router, prefix=settings.API_V1_STR)
app.include_router(consent_router, prefix=settings.API_V1_STR)
app.include_router(evals_router, prefix=settings.API_V1_STR)

# Instrument FastAPI application with Prometheus telemetry
Instrumentator().instrument(app)

@app.get("/metrics", tags=["metrics"])
async def metrics():
    """
    Exposes Prometheus scrape metrics including standard HTTP telemetry,
    plus dynamically collected business gauges like unresolved claims.
    """
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    from fastapi import Response
    from sqlalchemy import select, func
    from core.database import SessionLocal
    from core.metrics import active_claims_gauge
    import models
    
    # Query database dynamically for active claims count
    async with SessionLocal() as db:
        try:
            stmt = select(func.count(models.Claim.id)).where(
                models.Claim.status.notin_([
                    models.ClaimStatus.approved,
                    models.ClaimStatus.rejected,
                    models.ClaimStatus.settled
                ])
            )
            count = (await db.execute(stmt)).scalar() or 0
            active_claims_gauge.set(count)
        except Exception as exc:
            logger.warning("Failed to refresh active claims gauge: %s", exc)
            
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/health", tags=["health"])
async def health_check():
    """
    Endpoint for monitoring application health, database, and Redis connectivity.
    """
    from sqlalchemy import text
    from core.database import SessionLocal
    from services.auth_service import redis_client
    
    db_status = "ok"
    try:
        async with SessionLocal() as db:
            await db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"
        
    redis_status = "ok"
    try:
        await redis_client.ping()
    except Exception:
        redis_status = "error"

    healthy = db_status == "ok" and redis_status == "ok"
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "ok" if healthy else "error",
            "db": db_status,
            "redis": redis_status,
            "version": "1.0.0",
        },
    )
