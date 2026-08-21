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
    def apply(db: Any, user: models.User, query: Any) -> Any:
        """Return ``query`` with a role-appropriate WHERE clause appended.

        Admin role receives no filter (sees everything).  All other roles are
        scoped to their permitted subset of claims.
        """
        role = str(user.role)

        if role == "admin":
            return query

        if role in ("insurer_officer", "departmental_head"):
            return query.where(models.Claim.assigned_officer_id == user.id)

        if role == "advisor":
            # Resolve assigned customers via a sub-query
            sub = (
                select(models.AdvisorAssignment.customer_id)
                .where(
                    models.AdvisorAssignment.advisor_id == user.id,
                    models.AdvisorAssignment.is_active.is_(True),
                )
            )
            result = db.execute(sub)
            assigned_ids = result.scalars().all()
            return query.where(models.Claim.claimant_id.in_(assigned_ids))

        if role == models.UserRole.aggregator:
            return query.where(
                models.Claim.assigned_department_id == user.department_id
            )

        # default: customer and any other role → own claims only
        return query.where(models.Claim.claimant_id == user.id)

    @staticmethod
    def build_filter(user: models.User) -> dict[str, Any] | None:
        """Return a plain-dict filter spec or ``None`` (no filter needed).

        The dict maps column names to values so callers can reconstruct the
        WHERE clause without needing a live DB session.
        """
        role = str(user.role)

        if role == "admin":
            return None

        if role in ("insurer_officer", "departmental_head"):
            return {"assigned_officer_id": user.id}

        if role == "advisor":
            return {"advisor_id": user.id}  # resolved via join at query time

        if role == "aggregator":
            return {"assigned_department_id": user.department_id}

        # default: customer / any other role
        return {"claimant_id": user.id}
