"""HTTP boundary for the anonymous demo (base path ``/api/v1/demo``)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response

from .config import DemoSettings
from .contracts import (
    ExplainRequest,
    Explanation,
    Handoff,
    HandoffRequest,
    InboxResponse,
    SessionCreateRequest,
    SessionCreated,
    SessionView,
)
from .errors import ModelUnavailable, SessionMissing, ValidationError
from .handoffs import create_handoff, list_inbox
from .multipart import parse_policy_upload
from .security import (
    SESSION_COOKIE,
    SESSION_COOKIE_PATH,
    check_csrf,
    check_origin,
    client_ip,
)
from .service import DemoService
from .store import DemoSession, DemoStore


class DemoContext:
    def __init__(self, store: DemoStore, service: DemoService, settings: DemoSettings) -> None:
        self.store = store
        self.service = service
        self.settings = settings


def _ctx(request: Request) -> DemoContext:
    return request.app.state.demo_ctx


def _json(status_code: int, body: Any) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=jsonable_encoder(body))


def _set_session_cookie(response: Response, token: str, settings: DemoSettings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.limits.session_ttl_seconds,
        path=SESSION_COOKIE_PATH,
        httponly=True,
        samesite="strict",
        secure=settings.cookie_secure,
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path=SESSION_COOKIE_PATH, samesite="strict")


def _require_session(request: Request, ctx: DemoContext) -> DemoSession:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise SessionMissing("No active demo session.")
    return ctx.store.resolve(token)


def _require_origin(request: Request, ctx: DemoContext) -> None:
    check_origin(request, ctx.settings.allowed_origins)


def _require_csrf(request: Request, session: DemoSession) -> None:
    check_csrf(request, session.csrf_token)


def _idempotency_key(request: Request) -> UUID:
    raw = request.headers.get("Idempotency-Key")
    if not raw:
        raise ValidationError(
            "An Idempotency-Key header (UUID) is required.",
            status_code=400,
            code="INVALID_IDEMPOTENCY_KEY",
        )
    try:
        return UUID(raw)
    except (ValueError, AttributeError, TypeError):
        raise ValidationError(
            "The Idempotency-Key header must be a valid UUID.",
            status_code=400,
            code="INVALID_IDEMPOTENCY_KEY",
        )


router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "deterministic"}


@router.post("/session")
def create_session(request: Request, body: SessionCreateRequest | None = None) -> JSONResponse:
    ctx = _ctx(request)
    _require_origin(request, ctx)
    ctx.store.check_session_rate(client_ip(request))

    existing = request.cookies.get(SESSION_COOKIE)
    if existing:
        ctx.store.reset(existing)

    created = ctx.store.create_session()
    response = _json(
        201,
        SessionCreated(
            expires_at=created.expires_at,
            csrf_token=created.csrf_token,
            mode="deterministic",
        ),
    )
    _set_session_cookie(response, created.token, ctx.settings)
    return response


@router.get("/session")
def get_session(request: Request) -> JSONResponse:
    ctx = _ctx(request)
    session = _require_session(request, ctx)
    # Single atomic snapshot: the summary cannot mix a pre-reupload document with
    # post-reupload page state, and an expiry between lookup and read is a 410.
    snapshot = ctx.store.read_snapshot(session)
    expires_at = snapshot.expires_at or session.expires_at
    return _json(
        200,
        SessionView(
            expires_at=expires_at.isoformat(),
            mode="deterministic",
            csrf_token=snapshot.csrf_token,
            document=snapshot.document,
        ),
    )


@router.delete("/session")
def delete_session(request: Request) -> Response:
    ctx = _ctx(request)
    _require_origin(request, ctx)
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        try:
            session = ctx.store.resolve(token)
        except SessionMissing:
            session = None
        except Exception:
            session = None
        if session is not None:
            _require_csrf(request, session)
            ctx.store.check_mutation_rate(session)
        ctx.store.reset(token)
    response = Response(status_code=204)
    _clear_session_cookie(response)
    return response


@router.post("/policies")
def upload_policy(request: Request) -> JSONResponse:
    ctx = _ctx(request)
    _require_origin(request, ctx)
    session = _require_session(request, ctx)
    _require_csrf(request, session)
    key = _idempotency_key(request)

    # Quota is charged atomically on first successful commit (store.commit), not
    # here, so a replay of an equal request never consumes the upload quota.

    # The pure-ASGI body cap has already buffered the capped request in memory;
    # parse the multipart envelope in-process so no temporary file is ever used.
    raw_body = request.scope.get("demo.raw_body", b"")
    part = parse_policy_upload(
        raw_body,
        request.headers.get("content-type", ""),
        ctx.settings.limits.max_upload_bytes,
    )
    document = ctx.service.upload(
        session, part.data, part.filename, part.content_type, key
    )
    return _json(201, document)


@router.get("/policies/{document_id}/pages/{page}")
def get_policy_page(request: Request, document_id: UUID, page: int) -> JSONResponse:
    ctx = _ctx(request)
    session = _require_session(request, ctx)
    page_text = ctx.service.get_page(session, document_id, page)
    return _json(200, page_text)


@router.post("/explanations")
def create_explanation(request: Request, body: ExplainRequest) -> JSONResponse:
    ctx = _ctx(request)
    _require_origin(request, ctx)
    session = _require_session(request, ctx)
    _require_csrf(request, session)

    # The external model is a separately gated milestone and is disabled here. An
    # explicit request must fail closed with 503 before any provider or idempotency
    # machinery runs, never silently falling back to deterministic output.
    if body.mode == "external_model":
        raise ModelUnavailable(
            "External-model explanations are unavailable. Run deterministic mode."
        )

    key = _idempotency_key(request)

    explanation: Explanation = ctx.service.explain(
        session, body.document_id, body.document_revision, body.narrative, key
    )
    return _json(201, explanation)


@router.get("/explanations/{explanation_id}")
def read_explanation(request: Request, explanation_id: UUID) -> JSONResponse:
    ctx = _ctx(request)
    session = _require_session(request, ctx)
    explanation = ctx.service.get_explanation(session, explanation_id)
    return _json(200, explanation)


@router.post("/handoffs")
def create_handoff_route(request: Request, body: HandoffRequest) -> JSONResponse:
    ctx = _ctx(request)
    _require_origin(request, ctx)
    session = _require_session(request, ctx)
    _require_csrf(request, session)
    key = _idempotency_key(request)

    handoff: Handoff = create_handoff(ctx.service, session, body.explanation_id, key)
    return _json(201, handoff)


@router.get("/inboxes/{recipient}")
def read_inbox(request: Request, recipient: str) -> JSONResponse:
    ctx = _ctx(request)
    session = _require_session(request, ctx)
    inbox: InboxResponse = list_inbox(ctx.store, session, recipient)
    return _json(200, inbox)
