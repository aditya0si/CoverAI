"""Tests for VisibilityFilter — role-based claim visibility.

Roles are exercised in their ORM shape (``UserRole`` enum, as loaded from the
database) and ``db.execute`` is awaitable (as an ``AsyncSession`` is), matching
how ``apply`` is called from ``ClaimService.list``.  Passing plain strings or a
synchronous session would silently bypass every branch under test.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import models

# ── Helpers ──────────────────────────────────────────────────────────────────


def _mock_db(rows):
    """An AsyncSession-shaped mock: db.execute is awaitable."""
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


def _clause(query) -> str:
    """The WHERE clause VisibilityFilter appended to a mocked query."""
    (clause,) = query.where.call_args.args
    return str(clause)


# ── apply builds no WHERE clause for admin ───────────────────────────────────


async def test_apply_returns_unmodified_query_for_admin():
    """VisibilityFilter.apply must return the query unchanged for admin."""
    from services.visibility_filter import VisibilityFilter

    db = _mock_db([])
    user = _make_user("admin-id", models.UserRole.admin)
    query = MagicMock()
    result = await VisibilityFilter.apply(db, user, query)
    assert result is query, "admin should see all claims — no WHERE clause added"


# ── advisor gets claims for assigned customers only ──────────────────────────


async def test_apply_restricts_advisor_to_assigned_customers():
    """VisibilityFilter.apply must add claimant_id IN (…) for advisor role."""
    from services.visibility_filter import VisibilityFilter

    advisor = _make_user("advisor-id", models.UserRole.advisor)
    db = _mock_db(["cust-a", "cust-b"])

    query = MagicMock()
    await VisibilityFilter.apply(db, advisor, query)

    assert "claimant_id IN" in _clause(query)


async def test_apply_advisor_with_no_assignments_excludes_all():
    """VisibilityFilter.apply with empty advisor assignments must still call where."""
    from services.visibility_filter import VisibilityFilter

    advisor = _make_user("advisor-id", models.UserRole.advisor)
    db = _mock_db([])  # no assigned customers

    query = MagicMock()
    await VisibilityFilter.apply(db, advisor, query)
    query.where.assert_called_once()


# ── insurer_officer sees claims assigned to them ─────────────────────────────


async def test_apply_restricts_officer_to_assigned_claims():
    """VisibilityFilter.apply must add assigned_officer_id == user.id for insurer_officer."""
    from services.visibility_filter import VisibilityFilter

    officer = _make_user("off-id", models.UserRole.insurer_officer, department_id="dept-1")

    query = MagicMock()
    await VisibilityFilter.apply(_mock_db([]), officer, query)

    assert "assigned_officer_id" in _clause(query)


# ── aggregator (no department columns in schema) scopes to assigned claims ───


async def test_apply_restricts_aggregator_to_assigned_claims():
    """VisibilityFilter.apply must scope aggregator without referencing missing columns."""
    from services.visibility_filter import VisibilityFilter

    agg = _make_user("agg-id", models.UserRole.aggregator, department_id="dept-42")

    query = MagicMock()
    await VisibilityFilter.apply(_mock_db([]), agg, query)

    assert "assigned_officer_id" in _clause(query)


# ── customer sees own claims only ────────────────────────────────────────────


async def test_apply_restricts_customer_to_own_claims():
    """VisibilityFilter.apply must add claimant_id == user.id for customer role."""
    from services.visibility_filter import VisibilityFilter

    customer = _make_user("cust-id", models.UserRole.customer)

    query = MagicMock()
    await VisibilityFilter.apply(_mock_db([]), customer, query)

    assert "claimant_id" in _clause(query)


# ── string roles (e.g. from tests or external callers) still work ────────────


async def test_apply_accepts_plain_string_roles():
    """VisibilityFilter.apply must not break when user.role is a plain string."""
    from services.visibility_filter import VisibilityFilter

    officer = _make_user("off-id", "insurer_officer")

    query = MagicMock()
    await VisibilityFilter.apply(_mock_db([]), officer, query)

    assert "assigned_officer_id" in _clause(query)


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


def test_build_filter_insurer_officer_returns_assigned_officer_filter():
    """build_filter must return a dict with assigned_officer_id for insurer_officer role."""
    from services.visibility_filter import VisibilityFilter

    officer = _make_user("off-id", "insurer_officer", department_id="dept-5")
    spec = VisibilityFilter.build_filter(officer)
    assert spec == {"assigned_officer_id": "off-id"}


def test_build_filter_aggregator_returns_assigned_officer_filter():
    """build_filter must scope aggregator to assigned claims.

    The department column the original spec referenced (assigned_department_id)
    does not exist in the schema, so aggregator shares the officer scoping.
    """
    from services.visibility_filter import VisibilityFilter

    agg = _make_user("agg-id", "aggregator", department_id="dept-42")
    spec = VisibilityFilter.build_filter(agg)
    assert spec == {"assigned_officer_id": "agg-id"}


def test_build_filter_unknown_role_defaults_to_claimant_id():
    """build_filter must fall back to claimant_id for any unhandled role."""
    from services.visibility_filter import VisibilityFilter

    user = _make_user("x-id", "some_new_role")
    spec = VisibilityFilter.build_filter(user)
    assert spec == {"claimant_id": "x-id"}


# ── departmental_head alias for insurer_officer ──────────────────────────────


def test_departmental_head_role_is_treated_as_insurer_officer():
    """departmental_head user_role must map to insurer_officer filter (assigned-officer scoped)."""
    from services.visibility_filter import VisibilityFilter

    head = _make_user("head-id", "departmental_head", department_id="dept-99")
    spec = VisibilityFilter.build_filter(head)
    assert spec == {"assigned_officer_id": "head-id"}
