"""Tests for the /health endpoint's dependency-failure signalling.

A degraded database or Redis must surface as HTTP 503, not a 200 with
status="error", so orchestrators and load balancers evict the instance.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from main import health_check


def _db_ok():
    session = MagicMock()
    session.execute = AsyncMock(return_value=MagicMock())
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=session)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return MagicMock(return_value=ctx)


def _db_failing():
    session = MagicMock()
    session.execute = AsyncMock(side_effect=RuntimeError("db down"))
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=session)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return MagicMock(return_value=ctx)


async def test_health_ok_returns_200():
    redis = AsyncMock()
    with patch("core.database.SessionLocal", _db_ok()), \
         patch("services.auth_service.redis_client", redis):
        response = await health_check()
    assert response.status_code == 200
    assert b'"status":"ok"' in response.body
    assert b'"db":"ok"' in response.body
    assert b'"redis":"ok"' in response.body


async def test_health_db_failure_returns_503():
    redis = AsyncMock()
    with patch("core.database.SessionLocal", _db_failing()), \
         patch("services.auth_service.redis_client", redis):
        response = await health_check()
    assert response.status_code == 503
    assert b'"db":"error"' in response.body
    assert b'"status":"error"' in response.body


async def test_health_redis_failure_returns_503():
    redis = AsyncMock()
    redis.ping = AsyncMock(side_effect=RuntimeError("redis down"))
    with patch("core.database.SessionLocal", _db_ok()), \
         patch("services.auth_service.redis_client", redis):
        response = await health_check()
    assert response.status_code == 503
    assert b'"redis":"error"' in response.body
