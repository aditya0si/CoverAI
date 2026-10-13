"""Standalone demo FastAPI application.

Runs independently from the production app. It imports only demo modules and
never initialises production settings, database, Redis, models or schedulers.
Run with exactly one worker::

    uvicorn demo_app:app --host 127.0.0.1 --port 8001 --workers 1
"""

from __future__ import annotations

import asyncio
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.datastructures import MutableHeaders

from demo.config import DemoSettings
from demo.contracts import ErrorBody, ErrorEnvelope
from demo.errors import (
    CapacityExceeded,
    DemoError,
    Forbidden,
    PayloadTooLarge,
    SessionMissing,
    UpstreamTimeout,
)
from demo.extraction import ParsingExecutor
from demo.router import DemoContext, router as demo_router
from demo.security import SESSION_COOKIE
from demo.service import DemoService
from demo.store import DemoStore


def _error_response(
    status_code: int,
    code: str,
    message: str,
    request_id: str,
    retry_after: int | None = None,
) -> JSONResponse:
    envelope = ErrorEnvelope(error=ErrorBody(code=code, message=message, request_id=request_id))
    headers = {
        "Cache-Control": "no-store",
        "Vary": "Cookie",
        "X-Request-ID": request_id,
    }
    if retry_after is not None:
        headers["Retry-After"] = str(retry_after)
    return JSONResponse(
        status_code=status_code,
        content=envelope.model_dump(mode="json"),
        headers=headers,
    )


class DemoGuardMiddleware:
    """Pure-ASGI response-header guard.

    Implemented as raw ASGI rather than ``@app.middleware("http")`` so it does not
    wrap the app in ``BaseHTTPMiddleware``: an outer middleware that replays the
    request body (``BoundedBodyMiddleware``) is incompatible with
    ``BaseHTTPMiddleware`` and silently drops response bodies.
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = ""
        for name, value in scope.get("headers", []):
            if name == b"x-request-id":
                request_id = value.decode("latin-1", "replace")
                break
        if not request_id:
            request_id = str(uuid.uuid4())
        state = scope.setdefault("state", {})
        if isinstance(state, dict):
            state["request_id"] = request_id

        async def send_wrapper(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = "no-store"
                headers["Vary"] = "Cookie"
                headers["X-Request-ID"] = request_id
            await send(message)

        await self.app(scope, receive, send_wrapper)


# Only these POST endpoints ever need their request body buffered. Every other
# route (including unknown paths) is passed straight through, so an oversized
# body sent to an unknown path is never drained.
_BUFFERED_ROUTES = frozenset({"session", "policies", "explanations", "handoffs"})


def _header_map(scope: dict[str, Any]) -> dict[bytes, bytes]:
    return {name.lower(): value for name, value in scope.get("headers", [])}


def _request_id_from(scope: dict[str, Any]) -> str:
    value = _header_map(scope).get(b"x-request-id")
    return value.decode("latin-1", "replace") if value else str(uuid.uuid4())


def _cookie_value(headers: dict[bytes, bytes], name: str) -> str | None:
    raw = headers.get(b"cookie")
    if not raw:
        return None
    for part in raw.decode("latin-1").split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value
    return None


class BoundedBodyMiddleware:
    """Pure-ASGI pre-auth body guard.

    Starlette parses multipart/JSON request bodies before a route's dependencies
    run, so a ``Content-Length`` check inside an HTTP middleware is insufficient:
    a chunked body is unbounded until the parser is already consuming it. This
    middleware therefore owns the receive loop for the known body-bearing demo
    routes and:

    * performs the Origin/session/CSRF authorization checks *before* the first
      ``receive`` call, so an unauthenticated slow upload is refused (401/403/410)
      without buffering a single byte;
    * enforces a global concurrency cap and an aggregate in-flight byte budget so
      many parallel uploads cannot exhaust memory;
    * applies an overall receive deadline and releases the slot/budget on
      disconnect or timeout (bounded cancellation);
    * caps each body at ``max_request_bytes``, replaying the buffered bytes to the
      application without ever spooling to disk.
    """

    def __init__(self, app: Any, *, store: DemoStore, settings: DemoSettings) -> None:
        self.app = app
        self.store = store
        self.settings = settings
        self.limits = settings.limits
        self.max_bytes = settings.limits.max_request_bytes
        self._state_lock = asyncio.Lock()
        self._active_bodies = 0
        self._inflight_bytes = 0

    def _route(self, method: str, path: str) -> str | None:
        if method != "POST":
            return None
        prefix = "/api/v1/demo/"
        if not path.startswith(prefix):
            return None
        rest = path[len(prefix) :].strip("/")
        if "/" in rest or rest not in _BUFFERED_ROUTES:
            return None
        return rest

    def _preauthorize(self, route: str, headers: dict[bytes, bytes]) -> None:
        origin = headers.get(b"origin", b"").decode("latin-1")
        if not origin:
            raise Forbidden("A valid Origin header is required.")
        if origin not in set(self.settings.allowed_origins):
            raise Forbidden("Origin is not allowed for demo requests.")
        if route == "session":
            return
        token = _cookie_value(headers, SESSION_COOKIE)
        if not token:
            raise SessionMissing("No active demo session.")
        session = self.store.resolve(token)
        supplied = headers.get(b"x-demo-csrf", b"").decode("latin-1")
        if not supplied or not secrets.compare_digest(supplied, session.csrf_token):
            raise Forbidden("Missing or invalid CSRF token.")

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "").upper()
        route = self._route(method, scope.get("path", ""))
        if route is None:
            await self.app(scope, receive, send)
            return

        request_id = _request_id_from(scope)
        headers = _header_map(scope)

        # 1. Authorize before touching the body. No `receive` call has happened.
        try:
            self._preauthorize(route, headers)
        except DemoError as exc:
            await self._fail(scope, receive, send, request_id, exc)
            return

        # 2. Reserve a concurrency slot; reject immediately at capacity.
        async with self._state_lock:
            if self._active_bodies >= self.limits.max_concurrent_bodies:
                over_concurrency = True
            else:
                over_concurrency = False
                self._active_bodies += 1
        if over_concurrency:
            await self._fail(
                scope,
                receive,
                send,
                request_id,
                CapacityExceeded("Too many uploads are in progress. Please retry shortly.", retry_after=1),
            )
            return

        added = 0
        try:
            declared_length = headers.get(b"content-length")
            if declared_length is not None:
                try:
                    if int(declared_length) > self.max_bytes:
                        await self._reject_too_large(scope, receive, send, request_id)
                        return
                except ValueError:
                    await self._reject_too_large(scope, receive, send, request_id)
                    return

            loop = asyncio.get_running_loop()
            deadline = loop.time() + self.limits.receive_deadline_seconds
            body = bytearray()
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    await self._fail(
                        scope,
                        receive,
                        send,
                        request_id,
                        UpstreamTimeout("The request body was not received in time."),
                    )
                    return
                try:
                    message = await asyncio.wait_for(receive(), timeout=remaining)
                except asyncio.TimeoutError:
                    await self._fail(
                        scope,
                        receive,
                        send,
                        request_id,
                        UpstreamTimeout("The request body was not received in time."),
                    )
                    return
                if message["type"] == "http.disconnect":
                    return
                if message["type"] != "http.request":
                    continue
                chunk = message.get("body", b"")
                if chunk:
                    async with self._state_lock:
                        if self._inflight_bytes + len(chunk) > self.limits.max_inflight_bytes:
                            over_budget = True
                        else:
                            over_budget = False
                            self._inflight_bytes += len(chunk)
                            added += len(chunk)
                    if over_budget:
                        await self._fail(
                            scope,
                            receive,
                            send,
                            request_id,
                            CapacityExceeded(
                                "Server upload capacity is exhausted. Please retry shortly.",
                                retry_after=1,
                            ),
                        )
                        return
                    body.extend(chunk)
                    if len(body) > self.max_bytes:
                        await self._reject_too_large(scope, receive, send, request_id)
                        return
                if not message.get("more_body", False):
                    break

            raw = bytes(body)
            del body
            scope["demo.raw_body"] = raw

            replayed = False

            async def replay() -> dict[str, Any]:
                nonlocal replayed
                if replayed:
                    return {"type": "http.disconnect"}
                replayed = True
                return {"type": "http.request", "body": raw, "more_body": False}

            await self.app(scope, replay, send)
        finally:
            async with self._state_lock:
                self._active_bodies -= 1
                self._inflight_bytes -= added

    async def _reject_too_large(self, scope, receive, send, request_id: str) -> None:  # noqa: ANN001
        response = _error_response(
            PayloadTooLarge.status_code,
            "PAYLOAD_TOO_LARGE",
            "The request body exceeds the permitted size.",
            request_id,
        )
        await response(scope, receive, send)

    async def _fail(self, scope, receive, send, request_id: str, exc: DemoError) -> None:  # noqa: ANN001
        response = _error_response(
            exc.status_code, exc.code, exc.message, request_id, retry_after=exc.retry_after
        )
        await response(scope, receive, send)


def create_demo_app(
    *,
    store: DemoStore | None = None,
    settings: DemoSettings | None = None,
) -> FastAPI:
    settings = settings or DemoSettings.from_env()
    clock = lambda: datetime.now(timezone.utc)  # noqa: E731
    store = store or DemoStore(clock=clock, limits=settings.limits)
    parser = ParsingExecutor(settings.limits.max_parse_workers)
    service = DemoService(store, settings.limits, parser)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> Any:
        if settings.workers != 1:
            raise RuntimeError(
                "The demo API requires exactly one worker (set DEMO_WORKERS=1)."
            )
        purge_task = asyncio.create_task(_purge_loop(store, settings.limits.purge_interval_seconds))
        try:
            yield
        finally:
            purge_task.cancel()
            try:
                await purge_task
            except asyncio.CancelledError:
                pass

    app = FastAPI(
        title="CoverAI Anonymous Demo API",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.state.demo_ctx = DemoContext(store=store, service=service, settings=settings)
    app.state.demo_settings = settings
    app.state.demo_store = store

    app.add_middleware(DemoGuardMiddleware)

    @app.exception_handler(DemoError)
    async def _demo_error_handler(request: Request, exc: DemoError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        return _error_response(
            exc.status_code, exc.code, exc.message, request_id, retry_after=exc.retry_after
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        return _error_response(400, "INVALID_REQUEST", "The request was malformed.", request_id)

    @app.exception_handler(Exception)
    async def _generic_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        return _error_response(
            500, "INTERNAL_ERROR", "An unexpected error occurred.", request_id
        )

    # Added last so it wraps the demo guard and sits outside every parsing layer.
    # It is constructed with the live store/settings so authorization can run
    # before the request body is received.
    app.add_middleware(BoundedBodyMiddleware, store=store, settings=settings)

    app.include_router(demo_router, prefix="/api/v1/demo")
    return app


async def _purge_loop(store: DemoStore, interval: int) -> None:
    while True:
        await asyncio.sleep(interval)
        try:
            store.purge_expired()
        except Exception:  # noqa: BLE001 - background cleanup must never crash the app
            pass


app = create_demo_app()


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001, workers=1)
