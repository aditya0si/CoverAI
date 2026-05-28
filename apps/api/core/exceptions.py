import uuid
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

class CoverAIException(Exception):
    """Base application exception for CoverAI."""
    def __init__(self, detail: str, status_code: int = 500, error_code: str = "INTERNAL_ERROR"):
        self.detail = detail
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(self.detail)

class NotFoundException(CoverAIException):
    """Exception raised when a resource is not found (404)."""
    def __init__(self, detail: str = "Resource not found."):
        super().__init__(detail, status_code=404, error_code="NOT_FOUND")

class ForbiddenException(CoverAIException):
    """Exception raised when access is denied (403)."""
    def __init__(self, detail: str = "Permission denied."):
        super().__init__(detail, status_code=403, error_code="FORBIDDEN")


async def coverai_exception_handler(request: Request, exc: CoverAIException) -> JSONResponse:
    """Handles custom CoverAI application exceptions."""
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "detail": exc.detail,
            "request_id": request_id
        }
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handles request validation (422) exceptions, formatting detail as structured items."""
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "VALIDATION_ERROR",
            "detail": exc.errors(),
            "request_id": request_id
        }
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handles standard HTTPExceptions from FastAPI/Starlette frameworks."""
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    
    error_code = "HTTP_ERROR"
    if exc.status_code == 404:
        error_code = "NOT_FOUND"
    elif exc.status_code == 403:
        error_code = "FORBIDDEN"
    elif exc.status_code == 401:
        error_code = "UNAUTHORIZED"
    elif exc.status_code == 400:
        error_code = "BAD_REQUEST"

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": error_code,
            "detail": exc.detail,
            "request_id": request_id
        }
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Fallback handler for unhandled internal exceptions (500)."""
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    # To ease local debugging, print the exception trace
    import traceback
    traceback.print_exc()
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "INTERNAL_SERVER_ERROR",
            "detail": "An unexpected error occurred. Please try again later.",
            "request_id": request_id
        }
    )
