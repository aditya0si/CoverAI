"""Tests for advisors.py N+1 fix.

Before the fix, get_my_customers ran 1 + N*3 queries (N assignments x
db.get + 2 count queries). After the fix it must always run exactly 2
queries regardless of how many assignments exist.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest


def _join_row(cid, name, email, phone, policies, claims):
    return {
        "user_id": cid,
        "full_name": name,
        "email": email,
        "phone": phone,
        "granted_at": "2024-01-01T00:00:00",
        "active_policy_count": policies,
        "open_claim_count": claims,
    }


@pytest.mark.asyncio
async def test_get_my_customers_runs_constant_number_of_queries():
    """With 3 assignments, get_my_customers must run exactly 2 queries.

    Query 1: VisibilityFilter sub-query (fetch advisor's assigned customer IDs).
    Query 2: Main join (User + Policy + Claim counts via outer joins + group_by).
    """
    addr1 = "advisor-uuid-1"
    join_rows = [
        _join_row("cust-1", "Alice", "a@example.com", "911", 2, 1),
        _join_row("cust-2", "Bob", "b@example.com", "922", 0, 3),
        _join_row("cust-3", "Carol", "c@example.com", "933", 5, 0),
    ]

    sub_result = MagicMock()
    sub_result.scalars.return_value.all.return_value = ["cust-1", "cust-2", "cust-3"]

    mock_mappings = MagicMock()
    mock_mappings.all.return_value = join_rows

    join_result = MagicMock()
    join_result.mappings.return_value = mock_mappings

    call_count = 0

    async def fake_execute(stmt, *args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return sub_result  # VisibilityFilter sub-query
        return join_result  # main join query

    mock_db = MagicMock()
    mock_db.execute = fake_execute

    current_user = MagicMock()
    current_user.id = addr1
    current_user.role = "advisor"

    from routers.advisors import get_my_customers
    result = await get_my_customers(db=mock_db, current_user=current_user)

    # Exactly 2 queries — constant regardless of assignment count (vs 1+N*3 before)
    assert call_count == 2, (
        f"Expected 2 db.execute calls (constant), got {call_count}"
    )
    assert len(result) == 3
    assert result[0]["customer_name"] == "Alice"
    assert result[1]["active_policy_count"] == 0
    assert result[2]["open_claim_count"] == 0
