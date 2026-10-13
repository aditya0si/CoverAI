"""Demo-only settings and numeric limits.

Reads only ``DEMO_``-prefixed environment variables and never imports production
settings. Defaults mirror the approved design spec.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

MIB = 1024 * 1024

# Operator-facing request-rate limits (requests per minute per key). These are
# real deployment settings, not test-only knobs, so they are validated strictly
# at startup instead of silently falling back to a default. The upper bound is
# deliberately generous enough for the dedicated-load browser harness (which
# raises session creation to 1000/min) while still catching a gross
# misconfiguration such as a byte count or a timeout pasted into a rate field.
MAX_DEMO_RATE_PER_MINUTE = 10_000


@dataclass(frozen=True)
class DemoLimits:
    max_sessions: int = 100
    max_upload_bytes: int = 10 * MIB
    max_request_bytes: int = 11 * MIB
    max_pages: int = 50
    max_extracted_chars: int = 200_000
    min_narrative: int = 20
    max_narrative: int = 4_000
    max_explanations: int = 10
    max_handoffs: int = 10
    max_parallel_ops: int = 1
    parse_deadline_seconds: float = 10.0
    max_parse_workers: int = 2
    # Request-body buffering guards applied before any parsing (review item 1).
    max_concurrent_bodies: int = 4
    max_inflight_bytes: int = 24 * MIB
    receive_deadline_seconds: float = 15.0
    session_ttl_seconds: int = 1_800
    session_create_per_minute: int = 10
    mutations_per_minute: int = 30
    uploads_per_minute: int = 3
    max_excerpts: int = 5
    max_excerpt_chars: int = 600
    purge_interval_seconds: int = 60


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_rate_per_minute(name: str, default: int) -> int:
    """Strictly validate an operator rate limit (requests per minute).

    Unlike the other numeric settings, a rate limit is a deployment control, so
    a malformed, non-integer, empty, zero, negative or absurdly large value must
    fail loudly at startup rather than silently degrade to the default. Only an
    *unset* variable falls back to ``default``: once an operator has explicitly
    provided the variable, an empty or whitespace-only value is a configuration
    error, not an instruction to use the built-in default.
    """
    raw = os.getenv(name)
    if raw is None:
        return default
    text = raw.strip()
    if text == "":
        raise ValueError(
            f"{name} was provided but is empty or whitespace-only; leave it "
            f"unset to use the default of {default} requests per minute, or set "
            f"a positive integer."
        )
    try:
        value = int(text)
    except ValueError:
        raise ValueError(
            f"{name} must be a positive integer number of requests per minute; got {raw!r}."
        ) from None
    if value <= 0:
        raise ValueError(
            f"{name} must be a positive integer number of requests per minute; "
            f"got {value}. Zero and negative rates are not permitted."
        )
    if value > MAX_DEMO_RATE_PER_MINUTE:
        raise ValueError(
            f"{name}={value} exceeds the supported maximum of "
            f"{MAX_DEMO_RATE_PER_MINUTE} requests per minute."
        )
    return value


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_origins(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class DemoSettings:
    allowed_origins: list[str] = field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    cookie_secure: bool = False
    workers: int = 1
    limits: DemoLimits = field(default_factory=DemoLimits)

    @classmethod
    def from_env(cls) -> "DemoSettings":
        return cls(
            allowed_origins=_env_origins(
                "DEMO_ALLOWED_ORIGINS",
                ["http://localhost:3000", "http://127.0.0.1:3000"],
            ),
            cookie_secure=_env_bool("DEMO_COOKIE_SECURE", False),
            workers=_env_int("DEMO_WORKERS", 1),
            limits=DemoLimits(
                max_sessions=_env_int("DEMO_MAX_SESSIONS", 100),
                max_upload_bytes=_env_int("DEMO_MAX_UPLOAD_BYTES", 10 * MIB),
                max_request_bytes=_env_int("DEMO_MAX_REQUEST_BYTES", 11 * MIB),
                max_pages=_env_int("DEMO_MAX_PAGES", 50),
                max_extracted_chars=_env_int("DEMO_MAX_EXTRACTED_CHARS", 200_000),
                min_narrative=_env_int("DEMO_MIN_NARRATIVE", 20),
                max_narrative=_env_int("DEMO_MAX_NARRATIVE", 4_000),
                max_explanations=_env_int("DEMO_MAX_EXPLANATIONS", 10),
                max_handoffs=_env_int("DEMO_MAX_HANDOFFS", 10),
                parse_deadline_seconds=_env_float("DEMO_PARSE_DEADLINE_SECONDS", 10.0),
                max_parse_workers=_env_int("DEMO_MAX_PARSE_WORKERS", 2),
                max_concurrent_bodies=_env_int("DEMO_MAX_CONCURRENT_BODIES", 4),
                max_inflight_bytes=_env_int("DEMO_MAX_INFLIGHT_BYTES", 24 * MIB),
                receive_deadline_seconds=_env_float("DEMO_RECEIVE_DEADLINE_SECONDS", 15.0),
                session_ttl_seconds=_env_int("DEMO_SESSION_TTL_SECONDS", 1_800),
                purge_interval_seconds=_env_int("DEMO_PURGE_INTERVAL_SECONDS", 60),
                # Operator rate limits (requests per minute); defaults 10/30/3.
                # Validated strictly by _env_rate_per_minute so a bad deployment
                # value stops the process instead of silently using the default.
                session_create_per_minute=_env_rate_per_minute(
                    "DEMO_SESSION_CREATE_PER_MINUTE", 10
                ),
                mutations_per_minute=_env_rate_per_minute("DEMO_MUTATIONS_PER_MINUTE", 30),
                uploads_per_minute=_env_rate_per_minute("DEMO_UPLOADS_PER_MINUTE", 3),
            ),
        )
