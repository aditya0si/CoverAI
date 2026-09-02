"""Focused tests for the authentication and authorization layer.

Covers services/auth_service.py (bcrypt hashing, access/refresh tokens,
Google ID token verification) and core/security.py (get_current_user,
require_role, require_policy_owner, require_claim_access) — the code that
gates access to every claim, policy, and user in the system.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
import httpx

import models
from core.config import settings
from core.exceptions import CoverAIException, ForbiddenException, NotFoundException
from core.security import (
    get_current_user,
    require_role,
    require_policy_owner,
    require_claim_access,
)
from services import auth_service

# ── Helpers ──────────────────────────────────────────────────────────────


def _user(role: models.UserRole = models.UserRole.customer, *, is_active: bool = True) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = role
    user.is_active = is_active
    return user


def _db_with_user(user) -> MagicMock:
    db = MagicMock()
    db.get = AsyncMock(return_value=None)
    # explicit sync MagicMock return value; security deps call
    # result.scalar_one_or_none() directly on the execution result
    db.execute = AsyncMock(return_value=MagicMock())
    db.execute.return_value.scalar_one_or_none.return_value = user
    return db


def _valid_token(user_id: uuid.UUID, **claims) -> str:
    payload = {
        "sub": str(user_id),
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    payload.update(claims)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


class _FakeAsyncClient:
    """Minimal async-context client standing in for httpx.AsyncClient."""

    def __init__(self, response=None, exc=None, **kwargs):
        self.response = response
        self.exc = exc
        self.kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def get(self, url, **kwargs):
        if self.exc is not None:
            raise self.exc
        self.last_url = url
        self.last_params = kwargs.get("params")
        return self.response


def _google_response(status_code: int = 200, **data) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = data
    return resp


# ── Password hashing ──────────────────────────────────────────────────────


def test_password_hash_roundtrip():
    hashed = auth_service.hash_password("s3cret-pass!")
    assert hashed != "s3cret-pass!"
    assert auth_service.verify_password("s3cret-pass!", hashed)


def test_verify_password_rejects_wrong_password():
    hashed = auth_service.hash_password("s3cret-pass!")
    assert not auth_service.verify_password("wrong-pass", hashed)


def test_verify_password_returns_false_for_malformed_hash():
    """A corrupt stored hash must fail closed, never raise."""
    assert auth_service.verify_password("anything", "not-a-bcrypt-hash") is False


# ── Access tokens ─────────────────────────────────────────────────────────


def test_access_token_roundtrip_contains_claims():
    user_id = uuid.uuid4()
    token = auth_service.create_access_token(
        user_id, "insurer_officer", email="officer@example.com", full_name="Officer One"
    )
    payload = auth_service.decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["role"] == "insurer_officer"
    assert payload["email"] == "officer@example.com"
    assert payload["fullName"] == "Officer One"
    assert payload["type"] == "access"
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    assert exp > datetime.now(timezone.utc) + timedelta(minutes=10)  # default 15 min


def test_decode_token_rejects_expired():
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access",
         "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        settings.JWT_SECRET, algorithm="HS256",
    )
    with pytest.raises(CoverAIException) as exc_info:
        auth_service.decode_token(token)
    assert exc_info.value.status_code == 401
    assert exc_info.value.error_code == "UNAUTHORIZED"
    assert "expired" in exc_info.value.detail.lower()


def test_decode_token_rejects_garbage():
    with pytest.raises(CoverAIException) as exc_info:
        auth_service.decode_token("not-a-real-jwt")
    assert exc_info.value.status_code == 401
    assert "invalid" in exc_info.value.detail.lower()


async def test_create_refresh_token_persists_to_redis():
    user_id = uuid.uuid4()
    fake_redis = AsyncMock()
    with patch.object(auth_service, "redis_client", fake_redis):
        token = await auth_service.create_refresh_token(user_id)

    payload = auth_service.decode_token(token)
    assert payload["type"] == "refresh"
    assert payload["sub"] == str(user_id)

    fake_redis.setex.assert_awaited_once()
    key, ttl, stored = fake_redis.setex.await_args.args
    assert key == f"refresh:{user_id}"
    assert stored == token
    assert ttl == timedelta(days=7)


# ── Google token verification ─────────────────────────────────────────────


async def test_verify_google_token_success():
    token_data = {
        "sub": "google-123", "email": "user@example.com", "email_verified": "true",
        "name": "Jane Doe", "picture": "https://img.example/p.jpg", "aud": "client-123",
    }
    with patch.object(auth_service.httpx, "AsyncClient",
                      lambda **kw: _FakeAsyncClient(response=_google_response(200, **token_data))), \
         patch.object(auth_service.settings, "GOOGLE_CLIENT_ID", "client-123"):
        info = await auth_service.verify_google_token("id-token")

    assert info == {
        "google_id": "google-123",
        "email": "user@example.com",
        "full_name": "Jane Doe",
        "avatar_url": "https://img.example/p.jpg",
    }


async def test_verify_google_token_returns_503_on_network_error():
    with patch.object(auth_service.httpx, "AsyncClient",
                      lambda **kw: _FakeAsyncClient(exc=httpx.RequestError("boom"))):
        with pytest.raises(CoverAIException) as exc_info:
            await auth_service.verify_google_token("id-token")
    assert exc_info.value.status_code == 503
    assert exc_info.value.error_code == "SERVICE_UNAVAILABLE"


async def test_verify_google_token_returns_401_on_bad_status():
    with patch.object(auth_service.httpx, "AsyncClient",
                      lambda **kw: _FakeAsyncClient(response=_google_response(400, error="invalid_token"))):
        with pytest.raises(CoverAIException) as exc_info:
            await auth_service.verify_google_token("id-token")
    assert exc_info.value.status_code == 401
    assert exc_info.value.error_code == "UNAUTHORIZED"


async def test_verify_google_token_rejects_audience_mismatch():
    token_data = {"sub": "g1", "email": "a@example.com", "email_verified": "true", "aud": "other-client"}
    with patch.object(auth_service.httpx, "AsyncClient",
                      lambda **kw: _FakeAsyncClient(response=_google_response(200, **token_data))), \
         patch.object(auth_service.settings, "GOOGLE_CLIENT_ID", "client-123"):
        with pytest.raises(CoverAIException) as exc_info:
            await auth_service.verify_google_token("id-token")
    assert exc_info.value.status_code == 401
    assert "audience" in exc_info.value.detail.lower()


async def test_verify_google_token_rejects_missing_email():
    token_data = {"sub": "g1", "email_verified": "true"}
    with patch.object(auth_service.httpx, "AsyncClient",
                      lambda **kw: _FakeAsyncClient(response=_google_response(200, **token_data))):
        with pytest.raises(CoverAIException) as exc_info:
            await auth_service.verify_google_token("id-token")
    assert exc_info.value.status_code == 400


async def test_verify_google_token_rejects_unverified_email():
    token_data = {"sub": "g1", "email": "a@example.com", "email_verified": "false"}
    with patch.object(auth_service.httpx, "AsyncClient",
                      lambda **kw: _FakeAsyncClient(response=_google_response(200, **token_data))):
        with pytest.raises(CoverAIException) as exc_info:
            await auth_service.verify_google_token("id-token")
    assert exc_info.value.status_code == 400


# ── get_current_user ──────────────────────────────────────────────────────


async def test_get_current_user_requires_token():
    request = SimpleNamespace(cookies={})
    with pytest.raises(CoverAIException) as exc_info:
        await get_current_user(request, bearer_token=None, db=MagicMock())
    assert exc_info.value.status_code == 401
    assert exc_info.value.error_code == "UNAUTHORIZED"


async def test_get_current_user_rejects_non_uuid_subject():
    request = SimpleNamespace(cookies={"access_token": _valid_token(uuid.uuid4(), sub="not-a-uuid")})
    with pytest.raises(CoverAIException) as exc_info:
        await get_current_user(request, bearer_token=None, db=MagicMock())
    assert exc_info.value.status_code == 401
    assert "not a valid UUID" in exc_info.value.detail


async def test_get_current_user_rejects_unknown_user():
    token = auth_service.create_access_token(uuid.uuid4(), "customer")
    request = SimpleNamespace(cookies={"access_token": token})
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock())
    db.execute.return_value.scalar_one_or_none.return_value = None
    with pytest.raises(CoverAIException) as exc_info:
        await get_current_user(request, bearer_token=None, db=db)
    assert exc_info.value.status_code == 401


async def test_get_current_user_rejects_inactive_user():
    user = _user(is_active=False)
    token = auth_service.create_access_token(user.id, "customer")
    request = SimpleNamespace(cookies={"access_token": token})
    with pytest.raises(CoverAIException) as exc_info:
        await get_current_user(request, bearer_token=None, db=_db_with_user(user))
    assert exc_info.value.status_code == 401


async def test_get_current_user_accepts_valid_cookie():
    user = _user()
    token = auth_service.create_access_token(user.id, "customer")
    request = SimpleNamespace(cookies={"access_token": token})
    result = await get_current_user(request, bearer_token=None, db=_db_with_user(user))
    assert result is user


async def test_get_current_user_falls_back_to_bearer():
    user = _user()
    token = auth_service.create_access_token(user.id, "customer")
    request = SimpleNamespace(cookies={})
    result = await get_current_user(request, bearer_token=token, db=_db_with_user(user))
    assert result is user


async def test_get_current_user_prefers_cookie_over_bearer():
    """A valid cookie must win even when the bearer token is garbage."""
    user = _user()
    token = auth_service.create_access_token(user.id, "customer")
    request = SimpleNamespace(cookies={"access_token": token})
    result = await get_current_user(request, bearer_token="garbage", db=_db_with_user(user))
    assert result is user


# ── require_role ──────────────────────────────────────────────────────────


async def test_require_role_allows_matching_role():
    officer = _user(models.UserRole.insurer_officer)
    assert await require_role("insurer_officer")(current_user=officer) is officer


async def test_require_role_rejects_other_roles():
    customer = _user(models.UserRole.customer)
    with pytest.raises(ForbiddenException):
        await require_role("insurer_officer")(current_user=customer)


# ── require_policy_owner ──────────────────────────────────────────────────


def _policy(owner_id):
    return SimpleNamespace(id=uuid.uuid4(), user_id=owner_id)


async def test_require_policy_owner_raises_not_found():
    db = MagicMock()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(NotFoundException):
        await require_policy_owner(uuid.uuid4(), current_user=_user(), db=db)


async def test_require_policy_owner_allows_owner():
    owner = _user()
    policy = _policy(owner.id)
    db = MagicMock()
    db.get = AsyncMock(return_value=policy)
    assert await require_policy_owner(policy.id, current_user=owner, db=db) is policy


async def test_require_policy_owner_allows_advisor_with_active_assignment():
    advisor = _user(models.UserRole.advisor)
    policy = _policy(uuid.uuid4())
    db = MagicMock()
    db.get = AsyncMock(return_value=policy)
    db.execute = AsyncMock(return_value=MagicMock())
    db.execute.return_value.scalar_one_or_none.return_value = MagicMock()
    assert await require_policy_owner(policy.id, current_user=advisor, db=db) is policy


async def test_require_policy_owner_denies_advisor_without_assignment():
    advisor = _user(models.UserRole.advisor)
    policy = _policy(uuid.uuid4())
    db = MagicMock()
    db.get = AsyncMock(return_value=policy)
    db.execute = AsyncMock(return_value=MagicMock())
    db.execute.return_value.scalar_one_or_none.return_value = None
    with pytest.raises(ForbiddenException):
        await require_policy_owner(policy.id, current_user=advisor, db=db)


async def test_require_policy_owner_denies_unrelated_customer():
    customer = _user()
    policy = _policy(uuid.uuid4())
    db = MagicMock()
    db.get = AsyncMock(return_value=policy)
    with pytest.raises(ForbiddenException):
        await require_policy_owner(policy.id, current_user=customer, db=db)


# ── require_claim_access ──────────────────────────────────────────────────


def _claim(claimant_id, officer_id=None):
    return SimpleNamespace(id=uuid.uuid4(), claimant_id=claimant_id, assigned_officer_id=officer_id)


async def test_require_claim_access_raises_not_found():
    db = MagicMock()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(NotFoundException):
        await require_claim_access(uuid.uuid4(), current_user=_user(), db=db)


async def test_require_claim_access_allows_claimant():
    claimant = _user()
    claim = _claim(claimant.id)
    db = MagicMock()
    db.get = AsyncMock(return_value=claim)
    assert await require_claim_access(claim.id, current_user=claimant, db=db) is claim


async def test_require_claim_access_allows_assigned_officer():
    officer = _user(models.UserRole.insurer_officer)
    claim = _claim(uuid.uuid4(), officer_id=officer.id)
    db = MagicMock()
    db.get = AsyncMock(return_value=claim)
    assert await require_claim_access(claim.id, current_user=officer, db=db) is claim


async def test_require_claim_access_allows_advisor_with_assignment():
    advisor = _user(models.UserRole.advisor)
    claim = _claim(uuid.uuid4())
    db = MagicMock()
    db.get = AsyncMock(return_value=claim)
    db.execute = AsyncMock(return_value=MagicMock())
    db.execute.return_value.scalar_one_or_none.return_value = MagicMock()
    assert await require_claim_access(claim.id, current_user=advisor, db=db) is claim


async def test_require_claim_access_denies_advisor_without_assignment():
    advisor = _user(models.UserRole.advisor)
    claim = _claim(uuid.uuid4())
    db = MagicMock()
    db.get = AsyncMock(return_value=claim)
    db.execute = AsyncMock(return_value=MagicMock())
    db.execute.return_value.scalar_one_or_none.return_value = None
    with pytest.raises(ForbiddenException):
        await require_claim_access(claim.id, current_user=advisor, db=db)


async def test_require_claim_access_denies_unrelated_customer():
    customer = _user()
    claim = _claim(uuid.uuid4())
    db = MagicMock()
    db.get = AsyncMock(return_value=claim)
    with pytest.raises(ForbiddenException):
        await require_claim_access(claim.id, current_user=customer, db=db)
