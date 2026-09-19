"""Enable pytest-asyncio mode for all tests in this directory."""
import os

import pytest_asyncio

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
