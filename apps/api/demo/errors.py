"""Typed demo errors mapped to spec HTTP responses.

No raw parser/provider exceptions may leak; every demo failure is expressed as a
``DemoError`` carrying a stable code and an HTTP status.
"""

from __future__ import annotations

from typing import Any


class DemoError(Exception):
    status_code: int = 400
    code: str = "BAD_REQUEST"

    def __init__(
        self,
        message: str = "Bad request",
        *,
        status_code: int | None = None,
        code: str | None = None,
        retry_after: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code
        self.retry_after = retry_after
        self.extra = extra or {}


class SessionMissing(DemoError):
    status_code = 401
    code = "SESSION_MISSING"


class SessionExpired(DemoError):
    status_code = 410
    code = "SESSION_EXPIRED"


class GenerationStale(DemoError):
    status_code = 410
    code = "SESSION_EXPIRED"


class Forbidden(DemoError):
    status_code = 403
    code = "FORBIDDEN"


class NotFound(DemoError):
    status_code = 404
    code = "NOT_FOUND"


class Conflict(DemoError):
    status_code = 409
    code = "CONFLICT"


class Busy(DemoError):
    status_code = 409
    code = "BUSY"


class PayloadTooLarge(DemoError):
    status_code = 413
    code = "PAYLOAD_TOO_LARGE"


class UnsupportedMedia(DemoError):
    status_code = 415
    code = "UNSUPPORTED_MEDIA_TYPE"


class ValidationError(DemoError):
    status_code = 422
    code = "VALIDATION_ERROR"


class InvalidDocument(ValidationError):
    code = "INVALID_DOCUMENT"


class OCRNotAvailable(ValidationError):
    code = "OCR_NOT_AVAILABLE"


class RateLimited(DemoError):
    status_code = 429
    code = "RATE_LIMITED"


class CapacityExceeded(DemoError):
    status_code = 429
    code = "CAPACITY"


class ModelUnavailable(DemoError):
    status_code = 503
    code = "MODEL_UNAVAILABLE"


class UpstreamTimeout(DemoError):
    status_code = 504
    code = "TIMEOUT"
