"""Pytest configuration.

Provides safe environment defaults so the suite runs without a real .env,
mints an ephemeral field-encryption key per run, and — when
``TEST_DATABASE_URL`` is set (integration tests) — points the whole app
(settings, sessions) at the disposable test database.
"""
import os

import pytest_asyncio

# Integration runs set TEST_DATABASE_URL; point DATABASE_URL at it so settings
# and sessions all use the disposable test database. Runs before the defaults
# below so an explicitly-set TEST_DATABASE_URL still wins.
if os.getenv("TEST_DATABASE_URL") and not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]

# App modules read settings at import time. Provide safe defaults so the suite
# runs without a real .env; real environment variables still win via setdefault.
os.environ.setdefault("ENV", "test")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/coverai_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("STORAGE_BUCKET", "test-bucket")


def _test_field_encryption_key() -> str:
    """Prefer a real env value; otherwise mint an ephemeral Fernet key.

    A static test key committed to a public repo is indistinguishable from a
    leaked production key, so tests generate a fresh one per run instead.
    """
    existing = os.environ.get("FIELD_ENCRYPTION_KEY")
    if existing:
        return existing
    from cryptography.fernet import Fernet

    return Fernet.generate_key().decode()


os.environ.setdefault("FIELD_ENCRYPTION_KEY", _test_field_encryption_key())

pytest_asyncio.async_mode = "auto"
