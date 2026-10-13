"""Self-contained fixtures for the demo suite.

This conftest deliberately avoids importing the parent ``tests/conftest.py``
(which imports pytest-asyncio and could pull production wiring). Run the demo
suite with ``--confcutdir=tests/demo`` so only this file initialises fixtures.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
if _API_ROOT not in sys.path:
    sys.path.insert(0, _API_ROOT)

from fastapi.testclient import TestClient  # noqa: E402

from demo.config import DemoLimits, DemoSettings  # noqa: E402
from demo.store import DemoStore  # noqa: E402
from demo_app import create_demo_app  # noqa: E402
from helpers import SessionClient  # noqa: E402

ALLOWED_ORIGIN = "http://localhost:3000"


class FakeClock:
    def __init__(self, start: datetime) -> None:
        self._now = start

    def now(self) -> datetime:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += timedelta(seconds=seconds)

    def set(self, value: datetime) -> None:
        self._now = value


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock(datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc))


@pytest.fixture
def settings() -> DemoSettings:
    return DemoSettings()


@pytest.fixture
def store(clock: FakeClock, settings: DemoSettings) -> DemoStore:
    return DemoStore(clock=clock.now, limits=settings.limits)


@pytest.fixture
def app(store: DemoStore, settings: DemoSettings):
    return create_demo_app(store=store, settings=settings)


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def session_client(client) -> SessionClient:
    return SessionClient(client)


@pytest.fixture
def make_client(app):
    """Factory yielding extra independent TestClients for the same app."""

    clients = []

    def _make() -> SessionClient:
        http = TestClient(app)
        http.__enter__()
        clients.append(http)
        return SessionClient(http)

    yield _make

    for http in clients:
        http.__exit__(None, None, None)


__all__ = ["ALLOWED_ORIGIN", "FakeClock", "DemoLimits"]
