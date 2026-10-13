# Architecture Review — Insurance Claims Platform

> Generated: 2026-07-14 · Scope: entire monorepo (24 modified files, 1390 additions, 350 deletions)

---

## Executive Summary

This is a small monorepo (FastAPI + Next.js) that has reached the limits of what can be structured inside route handlers and page components. Two forces are pulling it apart:

1. **Business logic is buried in routers and pages** — the interface (the seam) is the wrong place; gluing it into the handler-ball means every change strains seams that weren't designed to carry logic weight.
2. **Cross-module coordination is done by copy-paste or one-off queries** — the deletion test shows that removing any of the hot-spot modules spreads complexity, not concentrates it.

The five candidates below are ranked Strong → Worth exploring → Speculative.

---

## Candidate 1 — Claims Service Layer (STRONG)

### Files
`apps/api/routers/claims.py` · `apps/api/services/triage_service.py` · `apps/api/models/claims.py` · `apps/api/schemas/claim.py`

### Problem
The claims router contains 8 endpoints. Three of them (`create_claim`, `update_claim`, `submit_claim`) contain multi-step orchestration: number generation, status transition validation, policy check, surveyor recommendation, triage invocation, notification. None of that logic belongs at the HTTP seam. `get_claim()` does manual dict construction (lines 288–368) instead of using the schema layer it already imports. The triage service imports modules inside function bodies (`from core.metrics import ai_calls_total` at line 132 and 268) and mutates inline JSON strings on `claim.ai_summary`.

### Solution
Extract a `ClaimService` at a new seam — `apps/api/services/claim_service.py`. The router becomes a thin adapter that validates input, calls the service, returns the schema. The service owns: number generation, state-transition rules, triage orchestration, notification dispatch. Move `generate_claim_number()` to the model (where it already half-exists) and delete the router duplicate. Move all top-level imports in `triage_service.py` to module scope.

```python
# Router (thin adapter)
@router.post("/", response_model=ClaimRead)
async def create_claim(data: ClaimCreate, ...):
    claim = await claim_service.create(current_user, data)
    return claim

# Service (deep module — 100+ lines of logic behind ~200 LOC total)
class ClaimService:
    async def create(self, actor: User, data: ClaimCreate) -> Claim: ...
    async def transition(self, claim: Claim, to: ClaimStatus) -> Claim: ...
    async def run_triage(self, claim: Claim) -> None: ...
```

### Benefits
- **Locality**: all state-transition rules in one place; change once, fixed everywhere.
- **Leverage**: tests exercise the service seam, not HTTP plumbing.
- **Deletion test**: removing the router would leave the entire claims workflow intact. Currently, removing it removes all business logic too — that is the definition of a shallow module.

### Recommendation: **Strong**

---

## Candidate 2 — Role-Based Visibility Module (STRONG)

### Files
`apps/api/routers/claims.py:222-238` · `apps/api/schemas/__init__.py:16` · `apps/web/src/middleware.ts` · `apps/web/src/app/(dashboard)/layout.tsx`

### Problem
`UserRole` is defined in two incompatible shapes. The schema init (`UserRole = Literal["admin", "agent", "customer"]`) does not match the model enum which has `admin`, `insurer_officer`, `advisor`, `aggregator`. The `list_claims()` endpoint has its own ad-hoc filter cascade per role (lines 222–238), duplicated from similar logic in the advisors router. Frontend role-checking is scattered across three layout files with copy-pasted `redirect()` calls.

### Solution
1. **Fix the schema first**: `UserRole` literal must match the model enum exactly.
2. **Extract `claim_visibility_filter()`** into a domain module (e.g., `apps/api/services/visibility.py`) — one predicate that answers "what can role X see?" given an arbitrary scope, not eight copies.
3. **Frontend**: centralise role-check in middleware or a `useRole()` hook consumed by layouts, not reimplemented in each.

```python
# services/visibility.py
def claim_visibility(user: User, scope: Scope) -> Query:
    if user.role == UserRole.admin:
        return Query.unfiltered()
    if user.role == UserRole.advisor:
        return Query.filter(Claim.customer_id.in_(user.assigned_customer_ids()))
    ...
```

### Benefits
- Eliminates a class of cross-role bugs by having exactly one place the visibility logic lives.
- Schema/model sync catches role mismatches at type-check time, not runtime.
- Locality: changing a rule once instead of in 5 places.

### Recommendation: **Strong**

---

## Candidate 3 — Frontend Page Decomposition (STRONG)

### Files
`apps/web/src/app/(dashboard)/dashboard/page.tsx` (1180 lines) · `apps/web/src/app/(dashboard)/claims/[id]/page.tsx` (533 lines) · `apps/web/src/app/(insurer)/insurer/dashboard/page.tsx` (753 lines) · `apps/web/src/app/(dashboard)/claims/new/page.tsx` · `apps/web/src/app/(advisor)/advisor/customers/page.tsx`

### Problem
The dashboard page is 1180 lines across 4 tabs (vault, ai, claims, privacy), each with its own data-fetching, state management, and mutation logic. `claims/[id]/page.tsx` mixes PDF preview, timeline rendering, messaging, and file upload in one component. These are shallow modules: deep implementation, nearly-as-complex interface (every hook caller must understand all tabs).

### Solution
Decompose by domain concern, not by tab:

```
app/(dashboard)/dashboard/
├── page.tsx            # ~60 LOC: tab switcher + layout shell
├── vault/
│   └── page.tsx        # vault view (was tab 1)
├── ai-advisor/
│   └── page.tsx        # AI tab
├── claims/
│   ├── page.tsx        # claims table tab
│   └── [id]/
│       └── page.tsx    # claim detail (already split, but still 533 LOC)
└── privacy/
    └── page.tsx        # privacy settings
```

Each page has a single data concern, its own query skeleton, and a focused test surface.

### Benefits
- **Leverage**: each tab can be tested and iterated independently.
- **Deletion test**: deleting `vault/page.tsx` makes the vault feature disappear, not reappear elsewhere.
- Locality: all vault code is in one directory, not a tab in 733-line dashboard.

### Recommendation: **Strong**

---

## Candidate 4 — Advisor N+1 Query Elimination (WORTH EXPLORING)

### Files
`apps/api/routers/advisors.py:187-223` · `apps/api/models/claims.py`

### Problem
`get_my_customers()` loads each assignment and then issues individual `db.get(User, ...)` calls for each customer, plus per-customer `policy_count` and `claim_count` queries. A list of 100 customers costs ~300 queries. The root cause: no relationship loading strategy (no `selectinload`) and no grouping.

### Solution
Two changes:

1. Eager-load assignments and customers with a single joined query.
2. Use SQL aggregation (`func.count`) instead of per-row sub-queries.

```python
stmt = (
    select(User)
    .selectinload(User.claim_assignments)
    .join(AdvisorAssignment, AdvisorAssignment.customer_id == User.id)
    .filter(AdvisorAssignment.advisor_id == current_user.id)
)
customers = (await db.execute(stmt)).unique().scalars().all()

# Counts via session-level aggregation, already a single query:
counts = await db.execute(
    select(Claim.customer_id, func.count())
    .where(Claim.customer_id.in_([c.id for c in customers]))
    .group_by(Claim.customer_id)
)
```

### Benefits
- Query count drops from O(n) to 2 for any list size.
- No schema changes; no interface changes.

### Recommendation: **Worth exploring** — low risk, high payoff, but the full impact depends on whether the advisor list is paginated (not visible in the router).

---

## Candidate 5 — Async-Safe AI Background Tasks (SPECULATIVE)

### Files
`apps/api/services/triage_service.py:268-350`

### Problem
`BackgroundTasks` in FastAPI fire-and-forget by design. The triage service opens its own async session inside a background task (`async with SessionLocal()`). If the task outlives the parent request's DB session pool, connections hang. Crises arrive as flaky timeouts under load, not as signal today.

### Solution (only if the feature scales):
Replace `BackgroundTasks` with a proper async task queue (e.g., Celery with Redis broker, or arq) so the job has its own lifecycle independent of the request. This is an infrastructure change, not a code change — scope it only if triage latency or throughput becomes a concern.

### Recommendation: **Speculative** — correct engineering, but a YAGNI risk unless triage throughput is actually a production concern.

---

## Top Recommendation

Start with **Candidate 1** (Claims Service Layer). It is the most load-bearing module in the monorepo — every claim feature touches it — and the current shape means future features (appeals, documents, audit trails) must either duplicate logic or route through the 120-LOC `create_claim` function. The service layer earns depth: one interface, complex orchestration behind it, testable in isolation, swappable in tests.
