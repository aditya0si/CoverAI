"""Tests for VisibilityFilter module — TDD red phase.

Running `pytest tests/test_visibility_filter.py` should report FAILURES (implementation
does not exist yet).  Every test includes a descriptive name that doubles as the spec.
"""
from __future__ import annotations

from unittest.mock import MagicMock

# ── Helpers ──────────────────────────────────────────────────────────────────


def _mock_db(rows):
    mock = MagicMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    mock.execute.return_value = result  # synchronous mock
    return mock


def _make_user(id_, role, department_id=None):
    user = MagicMock()
    user.id = id_
    user.role = role
    user.department_id = department_id
    return user


# ── apply builds no WHERE clause for admin ───────────────────────────────────


def test_apply_returns_unmodified_query_for_admin():
    """VisibilityFilter.apply must return the query unchanged when role is admin."""
    from services.visibility_filter import VisibilityFilter

    db = _mock_db([])
    user = _make_user("admin-id", "admin")
    query = MagicMock()
    result = VisibilityFilter.apply(db, user, query)
    assert result is query, "admin should see all claims — no WHERE clause added"


# ── advisor gets claims for assigned customers only ──────────────────────────


def test_apply_restricts_advisor_to_assigned_customers():
    """VisibilityFilter.apply must add claimant_id IN (…) clause for advisor role."""
    from services.visibility_filter import VisibilityFilter

    advisor = _make_user("advisor-id", "advisor")
    db = _mock_db(["cust-a", "cust-b"])

    count_query = MagicMock()
    VisibilityFilter.apply(db, advisor, count_query)

    count_query.where.assert_called_once()
    count_query.where.assert_called_once()


def test_apply_advisor_with_no_assignments_excludes_all():
    """VisibilityFilter.apply with empty advisor assignments must still call where."""
    from services.visibility_filter import VisibilityFilter

    advisor = _make_user("advisor-id", "advisor")
    db = _mock_db([])  # no assigned customers

    query = MagicMock()
    VisibilityFilter.apply(db, advisor, query)
    query.where.assert_called_once()


# ── insurer_officer sees claims in their department ──────────────────────────


def test_apply_restricts_officer_to_department():
    """VisibilityFilter.apply must add department_id == user.department_id for insurer_officer."""
    from services.visibility_filter import VisibilityFilter

    officer = _make_user("off-id", "insurer_officer", department_id="dept-1")
    db = _mock_db([])

    query = MagicMock()
    VisibilityFilter.apply(db, officer, query)
    query.where.assert_called_once()


# ── customer sees own claims only ────────────────────────────────────────────


def test_apply_restricts_customer_to_own_claims():
    """VisibilityFilter.apply must add claimant_id == user.id for customer role."""
    from services.visibility_filter import VisibilityFilter

    customer = _make_user("cust-id", "customer")
    db = _mock_db([])

    query = MagicMock()
    VisibilityFilter.apply(db, customer, query)
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


def test_build_filter_insurer_officer_returns_department_filter():
    """build_filter must return a dict with assigned_officer_id for insurer_officer role."""
    from services.visibility_filter import VisibilityFilter

    officer = _make_user("off-id", "insurer_officer", department_id="dept-5")
    spec = VisibilityFilter.build_filter(officer)
    assert spec == {"assigned_officer_id": "off-id"}


def test_build_filter_aggregator_returns_department_filter():
    """build_filter must return assigned_department_id for aggregator role."""
    from services.visibility_filter import VisibilityFilter

    agg = _make_user("agg-id", "aggregator", department_id="dept-42")
    spec = VisibilityFilter.build_filter(agg)
    assert spec == {"assigned_department_id": "dept-42"}


def test_build_filter_unknown_role_defaults_to_claimant_id():
    """build_filter must fall back to claimant_id for any unhandled role."""
    from services.visibility_filter import VisibilityFilter

    user = _make_user("x-id", "some_new_role")
    spec = VisibilityFilter.build_filter(user)
    assert spec == {"claimant_id": "x-id"}


# ── departmental_head alias for insurer_officer ──────────────────────────────


def test_departmental_head_role_is_treated_as_insurer_officer():
    """departmental_head user_role must map to insurer_officer filter (department-scoped)."""
    from services.visibility_filter import VisibilityFilter

    head = _make_user("head-id", "departmental_head", department_id="dept-99")
    spec = VisibilityFilter.build_filter(head)
    assert spec == {"assigned_officer_id": "head-id"}
