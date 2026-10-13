"""coverai-repair-r3 regressions: strict operator rate-limit validation.

These tests were authored for the r3 repair. Unlike the r2 regressions (which
documented their chronology honestly), the behaviour under test is new here, so
these are ordinary regression tests rather than a RED/GREEN chronology claim.

The three per-minute rate limits are deployment controls, not test knobs:
malformed, empty, zero, negative or absurdly large values must abort startup
loudly instead of silently falling back to the built-in default. Only an unset
variable uses the default; an explicitly provided empty/whitespace value is a
configuration error. Defaults are 10/30/3, and the dedicated-load harness value
of 1000 must remain accepted.
"""

from __future__ import annotations

import pytest

from demo.config import (
    MAX_DEMO_RATE_PER_MINUTE,
    DemoLimits,
    DemoSettings,
)

RATE_ENV = (
    "DEMO_SESSION_CREATE_PER_MINUTE",
    "DEMO_MUTATIONS_PER_MINUTE",
    "DEMO_UPLOADS_PER_MINUTE",
)


@pytest.fixture(autouse=True)
def _clean_rate_env(monkeypatch):
    for name in RATE_ENV:
        monkeypatch.delenv(name, raising=False)


def _rates(settings: DemoSettings) -> tuple[int, int, int]:
    limits = settings.limits
    return (
        limits.session_create_per_minute,
        limits.mutations_per_minute,
        limits.uploads_per_minute,
    )


def test_rate_defaults_are_10_30_3() -> None:
    assert DemoLimits().session_create_per_minute == 10
    assert DemoLimits().mutations_per_minute == 30
    assert DemoLimits().uploads_per_minute == 3
    assert _rates(DemoSettings.from_env()) == (10, 30, 3)


def test_harness_rate_override_is_accepted(monkeypatch) -> None:
    monkeypatch.setenv("DEMO_SESSION_CREATE_PER_MINUTE", "1000")
    monkeypatch.setenv("DEMO_MUTATIONS_PER_MINUTE", "1000")
    monkeypatch.setenv("DEMO_UPLOADS_PER_MINUTE", "1000")
    assert _rates(DemoSettings.from_env()) == (1000, 1000, 1000)


def test_unset_rate_uses_default(monkeypatch) -> None:
    # Only an *unset* variable falls back to the default; the fixture above
    # removes all three, so the defaults must be in force here.
    assert _rates(DemoSettings.from_env()) == (10, 30, 3)


@pytest.mark.parametrize("value", ["", " ", "   ", "\t", "\n"])
def test_explicitly_blank_rate_is_rejected(monkeypatch, value) -> None:
    # An operator who set the variable to empty/whitespace made a configuration
    # error; that must abort startup rather than silently use the default.
    monkeypatch.setenv("DEMO_SESSION_CREATE_PER_MINUTE", value)
    with pytest.raises(ValueError, match="DEMO_SESSION_CREATE_PER_MINUTE"):
        DemoSettings.from_env()


def test_each_blank_rate_field_is_rejected(monkeypatch) -> None:
    for name in RATE_ENV:
        monkeypatch.setenv(name, "   ")
        with pytest.raises(ValueError, match=name):
            DemoSettings.from_env()
        monkeypatch.delenv(name)


@pytest.mark.parametrize("value", ["0", "-1", "-30", "10.5", "abc", "10/min", "1e3"])
def test_malformed_or_non_positive_rate_is_rejected(monkeypatch, value) -> None:
    monkeypatch.setenv("DEMO_SESSION_CREATE_PER_MINUTE", value)
    with pytest.raises(ValueError):
        DemoSettings.from_env()


def test_each_rate_field_is_validated(monkeypatch) -> None:
    for name in RATE_ENV:
        monkeypatch.setenv(name, "0")
        with pytest.raises(ValueError):
            DemoSettings.from_env()
        monkeypatch.delenv(name)


def test_excessive_rate_is_rejected(monkeypatch) -> None:
    monkeypatch.setenv("DEMO_UPLOADS_PER_MINUTE", str(MAX_DEMO_RATE_PER_MINUTE + 1))
    with pytest.raises(ValueError):
        DemoSettings.from_env()


def test_malformed_rate_error_names_the_variable(monkeypatch) -> None:
    monkeypatch.setenv("DEMO_MUTATIONS_PER_MINUTE", "not-a-number")
    with pytest.raises(ValueError, match="DEMO_MUTATIONS_PER_MINUTE"):
        DemoSettings.from_env()
