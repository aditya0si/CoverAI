"""Pytest configuration.

If TEST_DATABASE_URL is set (integration tests), default DATABASE_URL to it so
the whole app (settings, sessions) points at the disposable test database.
"""
import os

import pytest_asyncio

pytest_asyncio.async_mode = "auto"

if os.getenv("TEST_DATABASE_URL") and not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]