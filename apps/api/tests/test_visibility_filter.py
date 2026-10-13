"""Tests for VisibilityFilter module.

Covers role-based claim visibility semantics:
- admin / insurer_officer: no WHERE clause (officers see the shared queue)
- advisor: claims of actively assigned customers (empty assignment ⇒ no claims)
- customer: own claims only
- build_filter spec API: plain-dict descriptions of the same rules
"""
from __future__ import annotations

from unittest.mock import MagicMock, AsyncMock

import pytest

# ── Helpers ──────────────────────────────────────────────────────────────────


def _mock_db(rows):
    mock = MagicMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    mock.execute = AsyncMock(return_value=result)
    return mock


def _make_user(id_, role, department_id=None):
    user = MagicMock()
    user.id = id_
    user.role = role
    user.department_id = department_id
    return user


# ── apply builds no WHERE clause for admin / insurer_officer ─────────────────


async def test_apply_returns_unmodified_query_for_admin():
    """VisibilityFilter.apply must return the query unchanged when role is admin."""
    from services.visibility_filter import VisibilityFilter

    db = _mock_db([])
    user = _make_user("admin-id", "admin")
    query = MagicMock()
    result = await VisibilityFilter.apply(db, user, query)
    assert result is query, "admin should see all claims — no WHERE clause added"


async def test_apply_returns_unmodified_query_for_insurer_officer():
    """Officers pull from the shared queue, so apply must not scope their query."""
    from services.visibility_filter import VisibilityFilter

    db = _mock_db([])
    user = _make_user("off-id", "insurer_officer")
    query = MagicMock()
    result = await VisibilityFilter.apply(db, user, query)
    assert result is query, "insurer officer should see the full queue"


# ── advisor gets claims for assigned customers only ──────────────────────────


async def test_apply_restricts_advisor_to_assigned_customers():
    """VisibilityFilter.apply must add claimant_id IN (…) clause for advisor role."""
    from services.visibility_filter import VisibilityFilter

    advisor = _make_user("advisor-id", "advisor")
    db = _mock_db(["cust-a", "cust-b"])

    query = MagicMock()
    await VisibilityFilter.apply(db, advisor, query)

    query.where.assert_called_once()
    db.execute.assert_awaited_once()


async def test_apply_advisor_with_no_assignments_excludes_all():
    """VisibilityFilter.apply with empty advisor assignments must still call where."""
    from services.visibility_filter import VisibilityFilter

    advisor = _make_user("advisor-id", "advisor")
    db = _mock_db([])  # no assigned customers

    query = MagicMock()
    await VisibilityFilter.apply(db, advisor, query)
    query.where.assert_called_once()


# ── customer sees own claims only ────────────────────────────────────────────


async def test_apply_restricts_customer_to_own_claims():
    """VisibilityFilter.apply must add claimant_id == user.id for customer role."""
    from services.visibility_filter import VisibilityFilter

    customer = _make_user("cust-id", "customer")
    db = _mock_db([])

    query = MagicMock()
    await VisibilityFilter.apply(db, customer, query)
    query.where.assert_called_once()


# ── build_filter spec API ─────────────────────────────────────────────────────


def test_build_filter_admin_returns_none():
    """build_filter must return None for admin (no filter needed)."""
    from services.visibility_filter import VisibilityFilter

    user = _make_user("admin-id", "admin")
    assert VisibilityFilter.build_filter(user) is None


def test_build_filter_customer_returns_claimant_id_filter():
    """build_filter must return a dict with claimant_id for customer role."""
    from services.visibility_filter import VisibilityFilter

    user = _make_user("cust-id", "customer")
    spec = VisibilityFilter.build_filter(user)
    assert spec == {"claimant_id": "cust-id"}


def test_build_filter_insurer_officer_returns_assigned_filter():
    """build_filter must return a dict with assigned_officer_id for officers."""
    from services.visibility_filter import VisibilityFilter

    officer = _make_user("off-id", "insurer_officer", department_id="dept-5")
    spec = VisibilityFilter.build_filter(officer)
    assert spec == {"assigned_officer_id": "off-id"}


def test_build_filter_unknown_role_defaults_to_claimant_id():
    """build_filter must fall back to claimant_id for any unhandled role."""
    from services.visibility_filter import VisibilityFilter

    user = _make_user("x-id", "some_new_role")
    spec = VisibilityFilter.build_filter(user)
    assert spec == {"claimant_id": "x-id"}