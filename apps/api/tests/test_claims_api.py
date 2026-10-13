"""End-to-end integration tests for the claims + insurer workflows.

Exercises the real routers over an ASGI transport against a disposable
PostgreSQL database (pgvector). Skips when TEST_DATABASE_URL is not set.

Local usage (with the docker stack):
    docker compose up -d postgres
    $env:TEST_DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/coverai_test"
    cd apps/api
    pytest tests/test_claims_api.py -v
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="TEST_DATABASE_URL not set - integration tests skipped",
)

import models  # noqa: E402  (must come after env wiring in conftest)
from core.database import Base  # noqa: E402
from services.auth_service import create_access_token  # noqa: E402


def _engine():
    return create_async_engine(TEST_DATABASE_URL, pool_pre_ping=True)


@pytest.fixture(autouse=True)
def _stub_background_ai(monkeypatch):
    """Never hit Gemini or redis during tests — background jobs become no-ops."""
    from services import triage_service

    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(triage_service, "run_ai_triage", _noop)
    monkeypatch.setattr(triage_service, "run_image_ai_analysis", _noop)
    monkeypatch.setattr(triage_service, "notify_insurer", lambda *a, **k: None)
    monkeypatch.setattr(triage_service, "notify_customer", lambda *a, **k: None)


@pytest.fixture
async def db_session():
    """Create schema on the test DB and return a session factory (per test)."""
    engine = _engine()
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def api_client(db_session):
    """FastAPI app with the real claims/insurer routers, minus startup hooks.

    The app uses a fresh NullPool engine per test: pytest-asyncio gives each
    test its own event loop, so pooled connections from a previous test's loop
    would otherwise be reused and crash.
    """
    from fastapi import FastAPI
    from fastapi.exceptions import RequestValidationError
    from starlette.exceptions import HTTPException as StarletteHTTPException
    from sqlalchemy.ext.asyncio import create_async_engine as _create_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from core.exceptions import (
        coverai_exception_handler,
        validation_exception_handler,
        http_exception_handler,
        generic_exception_handler,
        CoverAIException,
    )
    from routers import claims_router, insurer_router
    from core.config import settings
    import core.database as db_mod

    test_engine = _create_engine(TEST_DATABASE_URL, poolclass=NullPool, pool_pre_ping=True)
    db_mod.engine = test_engine
    db_mod.SessionLocal = async_sessionmaker(
        bind=test_engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )

    app = FastAPI()
    app.add_exception_handler(CoverAIException, coverai_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
    app.include_router(claims_router, prefix=settings.API_V1_STR)
    app.include_router(insurer_router, prefix=settings.API_V1_STR)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    await test_engine.dispose()


def _seed_user(db, role: str, email: str) -> models.User:
    user = models.User(
        email=email,
        full_name=f"{role.title()} User",
        role=models.UserRole(role),
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    return user


def _seed_policy(db, user: models.User) -> models.Policy:
    now = datetime.utcnow()
    policy = models.Policy(
        policy_number=f"POL-{uuid.uuid4().hex[:8].upper()}",
        user_id=user.id,
        insurer_name="Acme Insurance",
        vehicle_registration="KA01AB1234",
        vehicle_make="Toyota",
        vehicle_model="Corolla",
        vehicle_year=2022,
        policy_type=models.PolicyType.comprehensive,
        start_date=now - timedelta(days=30),
        end_date=now + timedelta(days=335),
        premium_amount=12000.0,
        sum_insured=500000.0,
        status=models.PolicyStatus.active,
    )
    db.add(policy)
    return policy


def _auth_headers(user_id: uuid.UUID, role: str) -> dict[str, str]:
    token = create_access_token(user_id=user_id, role=role)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def seeded(db_session):
    """Seed users + policy; return identity mapping for the test."""
    from core.database import SessionLocal

    async with SessionLocal() as db:
        customer = _seed_user(db, "customer", "customer@test.local")
        officer = _seed_user(db, "insurer_officer", "officer@test.local")
        admin = _seed_user(db, "admin", "admin@test.local")
        await db.flush()
        policy = _seed_policy(db, customer)
        await db.commit()
        return {
            "customer": customer,
            "officer": officer,
            "admin": admin,
            "policy": policy,
        }


# ── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_full_claim_lifecycle(api_client, seeded):
    customer, officer, policy = seeded["customer"], seeded["officer"], seeded["policy"]
    customer_headers = _auth_headers(customer.id, "customer")
    officer_headers = _auth_headers(officer.id, "insurer_officer")

    # 1. Customer creates a draft claim
    resp = await api_client.post(
        "/api/v1/claims",
        headers=customer_headers,
        json={
            "policy_id": str(policy.id),
            "incident_date": datetime.utcnow().isoformat(),
            "incident_location": "MG Road, Bengaluru",
            "incident_description": "Rear-ended at a traffic signal, bumper damaged.",
            "claim_type": "own_damage",
            "estimated_amount": 25000.0,
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["claim_number"].startswith("CLM-")
    assert body["status"] == "draft"
    claim_id = body["claim_id"]

    # 2. Claim appears in the customer's list
    resp = await api_client.get("/api/v1/claims", headers=customer_headers)
    assert resp.status_code == 200
    assert any(c["id"] == claim_id for c in resp.json())

    # 3. Submit without images → 400 NO_IMAGES
    resp = await api_client.post(f"/api/v1/claims/{claim_id}/submit", headers=customer_headers)
    assert resp.status_code == 400
    assert resp.json()["error"] == "NO_IMAGES"

    # 4. Upload a valid image
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 128
    resp = await api_client.post(
        f"/api/v1/claims/{claim_id}/images",
        headers=customer_headers,
        files={"file": ("damage.png", png, "image/png")},
    )
    assert resp.status_code == 201, resp.text
    image_id = resp.json()["image_id"]

    # 5. Upload a spoofed image → 400
    resp = await api_client.post(
        f"/api/v1/claims/{claim_id}/images",
        headers=customer_headers,
        files={"file": ("fake.png", b"not-a-png", "image/png")},
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "INVALID_FILE_TYPE"

    # 6. Submit succeeds now
    resp = await api_client.post(f"/api/v1/claims/{claim_id}/submit", headers=customer_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "submitted"

    # 7. Officer sees the claim in the queue
    resp = await api_client.get("/api/v1/insurer/claims/queue", headers=officer_headers)
    assert resp.status_code == 200
    assert any(c["id"] == claim_id for c in resp.json())

    # 8. Officer self-assigns → under_review
    resp = await api_client.post(f"/api/v1/insurer/claims/{claim_id}/assign-self", headers=officer_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "under_review"
    assert resp.json()["assigned_officer_id"] == str(officer.id)

    # 9. Customer cannot adjudicate → 403
    resp = await api_client.patch(
        f"/api/v1/claims/{claim_id}/status",
        headers=customer_headers,
        json={"status": "approved", "remarks": "sneaky"},
    )
    assert resp.status_code == 403

    # 10. Approve without amount → 400
    resp = await api_client.patch(
        f"/api/v1/claims/{claim_id}/status",
        headers=officer_headers,
        json={"status": "approved", "remarks": "docs verified"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "MISSING_APPROVED_AMOUNT"

    # 11. Approve with amount → approved
    resp = await api_client.patch(
        f"/api/v1/claims/{claim_id}/status",
        headers=officer_headers,
        json={"status": "approved", "remarks": "docs verified", "approved_amount": 20000.0},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "approved"
    assert float(resp.json()["approved_amount"]) == 20000.0

    # 12. Detail endpoint returns images + history + policy context
    resp = await api_client.get(f"/api/v1/claims/{claim_id}", headers=officer_headers)
    assert resp.status_code == 200, resp.text
    detail = resp.json()
    assert detail["status"] == "approved"
    assert len(detail["images"]) == 1
    assert detail["images"][0]["id"] == image_id
    assert len(detail["status_history"]) >= 4
    assert detail["policy"]["policy_number"] == policy.policy_number

    # 13. Invalid transition rejected (approved → rejected)
    resp = await api_client.patch(
        f"/api/v1/claims/{claim_id}/status",
        headers=officer_headers,
        json={"status": "rejected", "remarks": "late flip"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "INVALID_TRANSITION"

    # 14. Admin sees the claim too
    admin_headers = _auth_headers(seeded["admin"].id, "admin")
    resp = await api_client.get(f"/api/v1/claims/{claim_id}", headers=admin_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_customer_cannot_see_other_customers_claims(api_client, seeded):
    """Visibility: a second customer must not see the first customer's claim."""
    customer = seeded["customer"]
    officer = seeded["officer"]
    headers = _auth_headers(customer.id, "customer")

    resp = await api_client.get("/api/v1/claims", headers=headers)
    assert resp.status_code == 200
    assert all(c["claimant_id"] == str(customer.id) for c in resp.json())

    # A random other claim id must 404 for the customer
    other_claim_id = uuid.uuid4()
    resp = await api_client.get(f"/api/v1/claims/{other_claim_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_adjudicate_endpoint(api_client, seeded):
    """The /insurer/claims/{id}/adjudicate convenience endpoint works."""
    customer, officer, policy = seeded["customer"], seeded["officer"], seeded["policy"]
    customer_headers = _auth_headers(customer.id, "customer")
    officer_headers = _auth_headers(officer.id, "insurer_officer")

    resp = await api_client.post(
        "/api/v1/claims",
        headers=customer_headers,
        json={
            "policy_id": str(policy.id),
            "incident_date": datetime.utcnow().isoformat(),
            "incident_location": "Whitefield, Bengaluru",
            "incident_description": "Hailstorm dented the roof and hood panels.",
            "claim_type": "natural_calamity",
            "estimated_amount": 40000.0,
        },
    )
    claim_id = resp.json()["claim_id"]

    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 128
    await api_client.post(
        f"/api/v1/claims/{claim_id}/images",
        headers=customer_headers,
        files={"file": ("roof.png", png, "image/png")},
    )
    await api_client.post(f"/api/v1/claims/{claim_id}/submit", headers=customer_headers)
    await api_client.post(f"/api/v1/insurer/claims/{claim_id}/assign-self", headers=officer_headers)

    resp = await api_client.post(
        f"/api/v1/insurer/claims/{claim_id}/adjudicate",
        headers=officer_headers,
        json={"decision": "rejected", "rejection_reason": "Damage pre-existing."},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "rejected"

    resp = await api_client.post(
        f"/api/v1/insurer/claims/{claim_id}/adjudicate",
        headers=officer_headers,
        json={"decision": "maybe"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "INVALID_DECISION"