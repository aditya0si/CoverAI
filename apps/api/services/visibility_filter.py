"""VisibilityFilter — role-based claim visibility as a standalone deep module.

Extracted from the visibility logic previously embedded in ClaimService.  Consumed by both the
claims router and advisor router so that role-based access logic has a single
home and can be tested independently.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select

import models


class VisibilityFilter:
    """Role-based visibility for claim queries.

    Two public entry points:
    - ``apply(db, user, query)`` — mutate a SQLAlchemy query in-place, adding
      the appropriate WHERE clause for the user's role.
    - ``build_filter(user)`` — return a plain ``dict`` describing the filter so
      callers can also use the spec for e.g. REST query-string mapping.
    """

    # ── public static API ─────────────────────────────────────────────────────

    @staticmethod
    async def apply(db: Any, user: models.User, query: Any) -> Any:
        """Return ``query`` with a role-appropriate WHERE clause appended.

        Admin and insurer officers receive no filter — officers pull from the
        shared queue and self-assign claims, so they must see every claim
        (callers apply the non-draft guard where relevant).  All other roles
        are scoped to their permitted subset of claims.
        """
        role = user.role

        if role in (models.UserRole.admin, models.UserRole.insurer_officer):
            return query

        if role == models.UserRole.advisor:
            # Resolve assigned customers via a sub-query
            sub = (
                select(models.AdvisorAssignment.customer_id)
                .where(
                    models.AdvisorAssignment.advisor_id == user.id,
                    models.AdvisorAssignment.is_active.is_(True),
                )
            )
            result = await db.execute(sub)
            assigned_ids = result.scalars().all()
            # Empty IN clause matches nothing — advisors with no assignments
            # see no claims, which is the intended behavior.
            return query.where(models.Claim.claimant_id.in_(assigned_ids))

        # default: customer, aggregator, and any future role → own claims only
        return query.where(models.Claim.claimant_id == user.id)

    @staticmethod
    def build_filter(user: models.User) -> dict[str, Any] | None:
        """Return a plain-dict filter spec or ``None`` (no filter needed).

        The dict maps column names to values so callers can reconstruct the
        WHERE clause without needing a live DB session.
        """
        role = user.role

        if role == models.UserRole.admin:
            return None

        if role == models.UserRole.insurer_officer:
            return {"assigned_officer_id": user.id}

        if role == models.UserRole.advisor:
            return {"advisor_id": user.id}  # resolved via join at query time

        # default: customer / any other role
        return {"claimant_id": user.id}