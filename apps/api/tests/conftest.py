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

pytest_asyncio.async_mode = "auto"
