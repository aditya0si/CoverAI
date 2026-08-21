# Domain Model — Insurance Claims Platform

> Extracted from code analysis of 24 modified files · 2026-07-14

---

## Domain Glossary

### Entities

**Claim** — A formal request for compensation submitted by a customer, assigned to an advisor for review, and managed by an insurer officer through a lifecycle of status transitions.

> A claim has a unique claim number (format: `CLM-XXXXXXXX`), a type (Health, Vehicle, Travel, etc.), a current status (draft → submitted → under_review → surveyor_assigned → approved → rejected → settled → disputed), monetary fields (claim_amount, approved_amount, settlement_amount), an AI triage summary, and timestamps for each lifecycle event.

_Avoid:_ case, ticket, request

---

**Policy** — An active insurance contract that a claim references as its basis. Policies are read-only within the claims workflow.

---

**Customer** — A policyholder who submits claims. Distinct from an `Advisor` or an `InsurerOfficer`. In the model, `UserRole.customer` identifies this actor.

_Avoid:_ claimant, insured (too narrow — a claim may be filed on behalf of someone)

---

**Advisor** — A domain actor (role: `UserRole.advisor`) who is assigned one or more customers and manages their claims workflow. Advisors do not have their own separate table; they are `User` records with a specific role.

> AdvisorAssignment is the join table that links advisors to customers. An advisor's orchestrator-level concern is claim visibility — they see only claims for their assigned customers.

_Avoid:_ agent (term is used in the frontend middleware but conflicts with `insurance_officer`)

---

**Insurer Officer** — A domain actor (role: `UserRole.insurer_officer`, parsed as `insurance_officer` in middleware) who adjudicates claims (approve, reject, settle, dispute).

_Avoid:_ adjuster, reviewer

---

**Aggregator** — A domain actor (role: `UserRole.aggregator`) who manages distributing claims under supervision. Scope beyond basic claims workflow.

---

**Admin** — A domain actor (role: `UserRole.admin`) with unrestricted access to all claims and users.

---

### Value Objects

**ClaimStatus** — Enumeration of the finite claim lifecycle states: `draft`, `submitted`, `under_review`, `surveyor_assigned`, `approved`, `rejected`, `settled`, `disputed`.

**ClaimType** — Enumeration of insurance lines: `health`, `vehicle`, `travel`, `property`, `other`.

**TriageResult** — The structured output of the AI triage engine: a recommended priority, a summary, and a recommended next action. Serialised as JSON on `claim.ai_summary`.

---

### Operations

| Operation | Owner | Description |
|-----------|-------|-------------|
| Create claim | Customer | Submits a new draft claim with supporting documents |
| Submit claim | Customer | Moves a draft claim to `submitted` status |
| Assign surveyor | Insurer | Moves a claim to `surveyor_assigned` and attaches a surveyor |
| Approve claim | Insurer | Moves a claim to `approved` and optionally approves a settlement amount |
| Reject claim | Insurer | Moves a claim to `rejected` with a reason |
| Settle claim | Insurer | Moves a claim to `settled` after payment processing |
| Dispute settlement | Customer | Reopens a settled claim into `disputed` status |
| View assigned customers | Advisor | Lists customers linked to this advisor's assignments |
| Bulk upload claims | Admin per spec | CSV import of claims (import_routers.py present in codebase) |
| AI triage | System (async) | Runs Gemini-based analysis and writes results to `claim.ai_summary` |

---

## Domain Inconsistencies Found

### CRITICAL: UserRole literal mismatch

| Location | Definition |
|----------|-----------|
| `apps/api/models/claims.py` (model) | `admin`, `insurer_officer`, `advisor`, `aggregator` |
| `apps/api/schemas/__init__.py:16` | `admin`, `agent`, `customer` |
| `apps/web/src/middleware.ts` | Role arrays include `insurance_officer`, `advisor`, `customer`, `admin` |

**The schema literal uses `agent` where the model uses `insurer_officer` and omits `aggregator`.** Any type-check or validation against this literal will silently reject or misinterpret insurer and aggregator requests. This is both a correctness bug and a security issue — a banker-class role check using `"agent"` would match the wrong identity.

**Canonical resolution**: the model enum is authoritative. The schema literal must be removed and replaced with the enum: `UserRole = Literal["admin", "insurer_officer", "advisor", "aggregator", "customer"]`.

---

### Role terminology confusion in middleware

`middleware.ts` parses `role` from the Supabase JWT and checks it against arrays like `["admin"]`, `["insurance_officer", "advisor"]`. The term `insurance_officer` is used in the middleware and `insurer_officer` in the model — these must be unified. The model enum value wins: `insurer_officer`.

---

### Agent vs Advisor

The term `agent` appears in `schemas/__init__.py` as a role literal value. The domain concept is **Advisor** — confirmed by the router file name `advisors.py` and the table `advisor_assignments`. The legacy `agent` literal is a misnomer and must be retired.

---

### Duplicate claim number generation

`generate_claim_number()` exists in two places with different formats:
- Model version: `CLM-` + 8 digits (confirmed in `models/claims.py`)
- Router version: different format in `routers/claims.py:25-31`

Duplicated domain logic in two seams means future format changes can land in one location and silently leave the other untouched, causing claim numbers to be generated inconsistently by code path.

---

### AI Summary field shape

`claim.ai_summary` is stored as a JSON string but is parsed manually with regex and string manipulation inside `get_claim()`. The `parse_ai_summary` validator exists in `schemas/claim.py` but is not used consistently. The domain concept **TriageResult** should be a typed representation, not ad-hoc JSON string slicing.

---

## Bounded Contexts

This repo has a single bounded context: **Claims Management**. It does not require a context map at this size. If the platform grows to include premium billing, reinsurance, or customer profiles as separate deployable units, revisit this decision.

---

## Recommended ADRs

The following decisions are hard-to-reverse, surprising without context, and the result of real trade-offs. They qualify as ADRs:

1. **UserRole derives from the model enum, not inline literals.** The literal was written before the model enum existed; the model should now be canonical. Must be recorded because the legacy `agent` literal is still referenced in middleware arrays.

2. **AI service runs synchronously via BackgroundTasks, not an async task queue.** This is a deliberate simplicity choice that will need revisiting when triage throughput becomes a concern. Worth recording so the team doesn't revisit it every sprint.
