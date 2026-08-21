# CoverAI — Codebase Documentation

> **CoverAI** is a full-stack, AI-powered vehicle insurance management platform built for the Indian market. It enables customers to upload insurance policies, file damage claims with photo evidence, and receive AI-driven triage assessments — while providing insurer officers and insurance advisors their own dedicated portals to review, assess, and manage claims. The platform is built with strict compliance to India's **Digital Personal Data Protection (DPDP) Act, 2023**.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Data Models & Database Schema](#4-data-models--database-schema)
5. [Authentication & Security](#5-authentication--security)
6. [API Endpoints (Backend)](#6-api-endpoints-backend)
7. [AI Services](#7-ai-services)
8. [Frontend Application](#8-frontend-application)
9. [DPDP Compliance & Data Privacy](#9-dpdp-compliance--data-privacy)
10. [Background Jobs & Scheduler](#10-background-jobs--scheduler)
11. [Storage Backend](#11-storage-backend)
12. [Observability & Monitoring](#12-observability--monitoring)
13. [Testing](#13-testing)
14. [Local Development & Deployment](#14-local-development--deployment)
15. [User Workflows (End-to-End)](#15-user-workflows-end-to-end)

---

## 1. High-Level Architecture

```
┌──────────────────────┐       ┌──────────────────────────────┐
│   Next.js 14 Web     │──────▶│   FastAPI Backend (Python)    │
│   (App Router, TS)   │ HTTP  │   Async, SQLAlchemy 2.0      │
│   Port 3000          │◀──────│   Port 8000                  │
└──────────────────────┘       └──────────┬───────────────────┘
                                          │
                    ┌─────────────────────┼──────────────────────┐
                    │                     │                      │
              ┌─────▼─────┐      ┌───────▼───────┐    ┌────────▼────────┐
              │ PostgreSQL │      │   Redis 7     │    │  Google Gemini  │
              │    15      │      │  (Sessions/   │    │  AI API         │
              │  (Primary  │      │   Caching)    │    │  (Triage +      │
              │   Data)    │      └───────────────┘    │   Vision +      │
              └────────────┘                           │   Policy Q&A)   │
                                                       └─────────────────┘
```

**Request Flow:**
1. Users interact with the **Next.js frontend** (customer portal, insurer portal, or advisor portal).
2. The frontend calls the **FastAPI REST API** at `/api/v1/*`, authenticating via HttpOnly JWT cookies.
3. The API reads/writes to **PostgreSQL** and uses **Redis** for session token management and rate limiting.
4. AI-powered features (claim triage, image damage analysis, policy Q&A chat) call **Google Gemini** models asynchronously as background tasks.
5. Files (PDFs, claim images) are stored via a pluggable **Storage Backend** (local filesystem or AWS S3).

---

## 2. Technology Stack

| Layer | Technology | Details |
|:---|:---|:---|
| **Frontend** | Next.js 14 (App Router) | TypeScript, Tailwind CSS, shadcn/ui components |
| **Backend** | FastAPI (Python 3.11+) | Async, SQLAlchemy 2.0, Pydantic v2 |
| **Database** | PostgreSQL 15 | Async driver: `asyncpg` |
| **Cache / Sessions** | Redis 7 | Token blacklisting, rate limit state |
| **AI Engine** | Google Gemini 2.5 Flash | Claims triage, vision damage analysis, policy Q&A |
| **PDF Processing** | PyMuPDF (fitz) | Text extraction from uploaded policy PDFs |
| **Task Scheduling** | APScheduler | Cron-based data retention/minimization jobs |
| **Containerization** | Docker Compose | Multi-service orchestration |
| **Monorepo Tooling** | Turborepo + pnpm | Workspace caching and dependency management |
| **Schema Validation** | Zod (frontend), Pydantic (backend) | Shared types via `@coverai/shared-types` |
| **Encryption** | Fernet (symmetric) | At-rest encryption for PII fields (phone, vehicle reg) |
| **Observability** | Prometheus + structured JSON logging | HTTP metrics, AI call tracking, business gauges |

---

## 3. Monorepo Structure

```
coverai/
├── apps/
│   ├── api/                          # FastAPI backend
│   │   ├── main.py                   # Application entrypoint, router registration
│   │   ├── core/                     # Framework infrastructure
│   │   │   ├── config.py             # Pydantic settings (env-based configuration)
│   │   │   ├── database.py           # Async SQLAlchemy engine + session factory
│   │   │   ├── security.py           # JWT authentication, RBAC guards, ownership checks
│   │   │   ├── encryption.py         # Fernet field encryption + phone hashing
│   │   │   ├── storage.py            # Pluggable storage backend (Local / S3)
│   │   │   ├── scheduler.py          # APScheduler cron jobs (data retention)
│   │   │   ├── middleware.py         # Security headers, Request-ID tracking
│   │   │   ├── limiter.py            # SlowAPI rate limiter
│   │   │   ├── audit.py              # Audit log helper
│   │   │   ├── exceptions.py         # Global exception handlers
│   │   │   ├── logging_config.py     # Structured JSON logging setup
│   │   │   └── metrics.py            # Prometheus business gauges
│   │   ├── models/                   # SQLAlchemy ORM models (14 models)
│   │   ├── schemas/                  # Pydantic request/response schemas
│   │   ├── routers/                  # API route handlers (9 router modules)
│   │   ├── services/                 # Business logic services
│   │   │   ├── triage_service.py     # AI claims triage + vision analysis
│   │   │   ├── qa_service.py         # AI-powered policy Q&A (streaming)
│   │   │   ├── pdf_service.py        # PDF text extraction + metadata parsing
│   │   │   └── auth_service.py       # Password hashing, JWT, Google OAuth
│   │   ├── alembic/                  # Database migration scripts
│   │   ├── tests/                    # Backend unit tests
│   │   ├── Dockerfile                # API container definition
│   │   └── pyproject.toml            # Poetry dependencies
│   │
│   └── web/                          # Next.js 14 frontend
│       ├── src/
│       │   ├── app/                  # App Router pages
│       │   │   ├── (auth)/           # Login + Register pages
│       │   │   ├── (dashboard)/      # Customer portal
│       │   │   │   ├── dashboard/         # Overview (stats, open claims, quick actions)
│       │   │   │   ├── dashboard/ai-advisor/  # Standalone AI Policy Advisor chat
│       │   │   │   ├── dashboard/privacy/      # DPDP Privacy & Consent Panel
│       │   │   │   ├── dashboard/my-advisor/   # Advisor Management page
│       │   │   │   ├── policies/               # Policy list + upload
│       │   │   │   ├── claims/                 # Claims list + filing wizard + detail
│       │   │   │   └── help/                   # Help & FAQ
│       │   │   ├── (insurer)/        # Insurer officer portal (dashboard, claims, reports)
│       │   │   ├── (advisor)/        # Advisor portal (customers, claims, renewals)
│       │   │   ├── privacy-policy/   # Static privacy policy page
│       │   │   └── unauthorized/     # 403 error page
│       │   ├── components/           # Shared UI components
│       │   ├── hooks/                # Custom React hooks (useUser)
│       │   ├── lib/                  # Utilities
│       │   │   ├── api-client.ts     # Typed API client (all backend calls)
│       │   │   ├── auth.ts           # Axios instance with cookie-based auth
│       │   │   ├── store.ts          # Zustand state management
│       │   │   └── utils.ts          # General utilities
│       │   └── middleware.ts         # Edge middleware (auth guards, role-based redirects)
│       ├── components/               # shadcn/ui component library
│       ├── Dockerfile                # Web container definition
│       └── package.json
│
├── packages/
│   ├── shared-types/                 # Zod schemas + inferred TypeScript types
│   └── ui/                           # Shared shadcn/ui component library
│
├── e2e/                              # Playwright end-to-end tests
│   ├── customer.spec.js              # Customer workflow tests
│   ├── insurer.spec.js               # Insurer officer workflow tests
│   ├── advisor.spec.js               # Advisor workflow tests
│   └── auth.setup.js                 # Authentication setup fixture
│
├── docker-compose.yml                # Multi-service Docker stack
├── Makefile                          # Developer workflow commands
├── turbo.json                        # Turborepo pipeline config
├── RETENTION_POLICY.md               # DPDP data retention documentation
└── playwright.config.js              # E2E test configuration
```

---

## 4. Data Models & Database Schema

The application uses **14 SQLAlchemy ORM models** backed by PostgreSQL. All primary keys are UUIDs generated server-side.

### Core Domain Models

| Model | Table | Description |
|:---|:---|:---|
| **User** | `users` | User accounts with role-based access. Roles: `customer`, `insurer_officer`, `advisor`, `aggregator`, `admin`. Includes Google OAuth fields, encrypted phone, DPDP consent flags. |
| **Policy** | `policies` | Insurance policies uploaded by customers. Stores vehicle info, coverage dates, premium/sum insured, extracted PDF text, and storage path. Types: `comprehensive`, `third_party`, `standalone_od`. Statuses: `active`, `expired`, `cancelled`. |
| **Claim** | `claims` | Insurance claims filed against policies. Tracks incident details, claim type (`own_damage`, `third_party`, `theft`, `natural_calamity`, `fire`), lifecycle status, assigned officer, AI triage results, and approved amounts. |
| **ClaimImage** | `claim_images` | Uploaded damage evidence images. Stores storage path, MIME type, file size, AI damage analysis results (tags + confidence score), and verification status. |

### Relationship & Workflow Models

| Model | Table | Description |
|:---|:---|:---|
| **AdvisorAssignment** | `advisor_assignments` | Links advisors to customers. Supports soft-delete via `is_active` flag and revocation timestamps. |
| **Conversation** | `conversations` | Chat sessions for policy Q&A. Associated with a user, optionally a policy and/or claim. Context types: `general`, `policy_qa`, `claim_qa`. |
| **Message** | `messages` | Individual chat messages within conversations. Roles: `user`, `assistant`, `system`. |

### Compliance & Audit Models

| Model | Table | Description |
|:---|:---|:---|
| **ConsentRecord** | `consent_records` | DPDP consent tracking. Types: `data_processing`, `marketing`, `ai_analysis`, `third_party_sharing`. Records grant/revoke timestamps. |
| **AuditLog** | `audit_logs` | Immutable audit trail. Records actor, action, resource type/ID, before/after state snapshots, and client IP address. Retained for 7 years per IRDAI regulations. |
| **AICallLog** | `ai_call_logs` | Tracks every AI API call — service type, model used, token counts (prompt + completion), and duration in milliseconds. Used for cost monitoring and performance analysis. |
| **DataExportRequest** | `data_export_requests` | DPDP Right to Data Portability requests. Statuses: `pending`, `completed`, `failed`. Stores download URL upon completion. |
| **DataDeletionRequest** | `data_deletion_requests` | DPDP Right to Erasure requests. Enforces a 30-day grace period before final anonymization. Statuses: `pending`, `processed`, `cancelled`. |

### Entity Relationship Diagram

```
User ──┬── 1:N ──▶ Policy ──── 1:N ──▶ Claim ──── 1:N ──▶ ClaimImage
       │                                  │
       ├── 1:N ──▶ Claim (as claimant)    ├── N:1 ──▶ User (assigned_officer)
       ├── 1:N ──▶ AdvisorAssignment      ├── 1:N ──▶ Conversation
       ├── 1:N ──▶ Conversation           │
       ├── 1:N ──▶ ConsentRecord          └── 1:N ──▶ AuditLog
       ├── 1:N ──▶ DataExportRequest
       ├── 1:N ──▶ DataDeletionRequest
       └── 1:N ──▶ AuditLog (as actor)
```

### Sensitive Field Handling

| Field | Protection | Mechanism |
|:---|:---|:---|
| `User.phone` | Encrypted at rest | Fernet symmetric encryption via custom `EncryptedString` SQLAlchemy type |
| `User.phone_hash` | Hashed for lookup | SHA-256 hash of normalized 10-digit phone; enables duplicate checking without decryption |
| `Policy.vehicle_registration` | Encrypted at rest | Same `EncryptedString` type |
| `User.hashed_password` | Bcrypt hashed | One-way hash via `passlib` |

---

## 5. Authentication & Security

### Authentication Flow

CoverAI supports two authentication methods:

#### Email + Password Registration/Login
1. User registers via `POST /api/v1/auth/register` with email, phone (10-digit Indian mobile), password (min 8 chars, must include uppercase + digit), full name, and role.
2. User logs in via `POST /api/v1/auth/login`.
3. Server issues a **JWT access token** set as an `HttpOnly` cookie (`access_token`, 15-minute TTL) and a non-HttpOnly indicator cookie (`refresh_token`, 7-day TTL) used by the Next.js edge middleware for route protection.

#### Google OAuth Sign-In
1. Frontend obtains a Google ID token via Google Identity Services.
2. Token is sent to `POST /api/v1/auth/google`.
3. Server verifies the token with Google's `tokeninfo` API, creates or links the user account, and sets the same cookie pair.

### JWT Token Structure

```json
{
  "sub": "<user_uuid>",
  "role": "customer | insurer_officer | advisor | admin",
  "email": "user@example.com",
  "full_name": "User Name",
  "exp": "<expiry_timestamp>"
}
```

### Role-Based Access Control (RBAC)

| Role | Access Level |
|:---|:---|
| **customer** | Own policies, own claims, file new claims, upload images, policy Q&A chat, manage advisor links, consent management |
| **insurer_officer** | Claim queue (all non-draft claims), self-assign claims, update claim status (approve/reject), view assigned claims |
| **advisor** | Read-only view of assigned customers' policies and claims |
| **admin** | Full system access, assign officers to claims, view all audit logs |

Access is enforced via FastAPI dependency injection using `require_role()`, `require_policy_owner()`, and `require_claim_access()` guards.

### Security Middleware

- **CORS**: Configurable allowed origins (defaults to `http://localhost:3000`)
- **Rate Limiting**: SlowAPI with per-endpoint limits (e.g., 3/minute for registration, 5/minute for login, 10/minute for Google auth)
- **Security Headers**: Custom middleware adds `X-Request-ID` tracking, security response headers
- **File Validation**: Magic byte verification for uploaded PDFs (must start with `%PDF`) and images (JPEG `0xFFD8FF`, PNG `0x89PNG`, WebP `RIFF...WEBP`)

---

## 6. API Endpoints (Backend)

All endpoints are prefixed with `/api/v1`.

### Authentication (`/auth`)

| Method | Path | Role | Description |
|:---|:---|:---|:---|
| `POST` | `/auth/register` | Public | Register a new user (rate limited: 3/min) |
| `POST` | `/auth/login` | Public | Email/password login, sets HttpOnly JWT cookies (rate limited: 5/min) |
| `POST` | `/auth/google` | Public | Google OAuth sign-in/sign-up (rate limited: 10/min) |
| `POST` | `/auth/refresh` | Authenticated | Refresh the JWT access token |
| `POST` | `/auth/logout` | Public | Clear auth cookies (always succeeds) |
| `GET` | `/auth/me` | Authenticated | Get current user profile |

### Policies (`/policies`)

| Method | Path | Role | Description |
|:---|:---|:---|:---|
| `POST` | `/policies/upload` | Customer | Upload a PDF policy document. Extracts text via PyMuPDF, parses metadata (dates, premiums, vehicle info) with regex heuristics, stores in DB and storage backend. |
| `GET` | `/policies` | Authenticated | List user's policies (paginated) |
| `GET` | `/policies/{id}` | Owner / Advisor | Get single policy detail |

### Claims (`/claims`)

| Method | Path | Role | Description |
|:---|:---|:---|:---|
| `POST` | `/claims` | Customer | Create a new claim. Validates policy ownership, active status, and incident date within coverage period. Auto-triggers AI triage in background. |
| `POST` | `/claims/{id}/submit` | Customer | Submit a draft claim. Requires ≥1 uploaded image. Notifies insurer. |
| `GET` | `/claims` | Scoped by role | List claims filtered by status, paginated. Customers see own claims; officers see assigned; advisors see linked customers' claims; admins see all. |
| `GET` | `/claims/{id}` | Owner / Officer / Advisor | Full claim detail with images (signed URLs), AI triage results, status history, and associated policy info. |
| `GET` | `/claims/{id}/history` | Owner / Officer / Advisor | Chronological audit log history for the claim. |
| `PATCH` | `/claims/{id}/status` | Officer / Admin | Transition claim status. Valid transitions: `submitted→under_review`, `under_review→approved/rejected/surveyor_assigned`, `surveyor_assigned→approved/rejected`. Requires `approved_amount` when approving. Notifies customer. |
| `GET` | `/claims/insurer/queue` | Officer / Admin | Browseable queue of all non-draft claims with filters: status, claim type, risk level (low/medium/high), date range. |
| `POST` | `/claims/{id}/assign-self` | Officer | Self-assign a submitted claim. Auto-transitions to `under_review`. |
| `POST` | `/claims/{id}/images` | Customer | Upload up to 5 images per request (JPEG/PNG/WebP, max 10MB each). Magic byte validation. Triggers AI vision analysis per image. |
| `GET` | `/claims/{id}/images` | Owner / Officer / Advisor | List claim images with signed URLs and AI damage tags. |

### Conversations (`/conversations`)

| Method | Path | Role | Description |
|:---|:---|:---|:---|
| `POST` | `/conversations` | Authenticated | Create a new conversation session (optionally linked to a policy/claim). |
| `GET` | `/conversations/policy/{id}` | Owner | Get existing conversation for a policy. |
| `GET` | `/conversations/{id}/messages` | Owner | Get all messages in a conversation (chronological). |
| `POST` | `/conversations/{id}/messages` | Owner | Ask a question — streams the AI response via **Server-Sent Events (SSE)** using `data: {chunk}\n\n` format. |

### Advisors (`/advisors`)

| Method | Path | Role | Description |
|:---|:---|:---|:---|
| `POST` | `/advisors/assignments` | Customer | Link an advisor by email. |
| `GET` | `/advisors/my-advisors` | Customer | List linked advisors. |
| `DELETE` | `/advisors/assignments/{id}` | Customer | Revoke an advisor link (soft delete). |
| `GET` | `/advisors/my-customers` | Advisor | List assigned customers with active policy/open claim counts. |
| `GET` | `/advisors/my-customers/{id}/policies` | Advisor | View a customer's policies (read-only). |
| `GET` | `/advisors/my-customers/{id}/claims` | Advisor | View a customer's claims (read-only). |

### Admin (`/admin`)

| Method | Path | Role | Description |
|:---|:---|:---|:---|
| `POST` | `/admin/claims/{id}/assign` | Admin | Assign a claim to a specific insurer officer. Auto-transitions submitted→under_review. |
| `GET` | `/admin/audit-logs` | Admin / Officer | Search and browse all system audit logs (filterable, paginated). |

### Consent Management (`/consent`)

| Method | Path | Role | Description |
|:---|:---|:---|:---|
| `GET` | `/consent` | Authenticated | List all consent records for the current user. |
| `PATCH` | `/consent/{type}` | Authenticated | Grant or revoke a consent type. Revoking `ai_analysis` disables future AI triage/vision processing. |
| `POST` | `/consent/data-export-request` | Authenticated | Request a DPDP data export (compiles all personal data as JSON). |
| `GET` | `/consent/data-export-requests` | Authenticated | List data export request history. |
| `POST` | `/consent/data-deletion-request` | Authenticated | Request account deletion (30-day grace period). |
| `GET` | `/consent/data-deletion-requests` | Authenticated | List data deletion request history. |
| `POST` | `/consent/data-deletion-request/cancel` | Authenticated | Cancel a pending deletion request within the grace period. |

### System Endpoints

| Method | Path | Description |
|:---|:---|:---|
| `GET` | `/health` | Health check — reports database and Redis connectivity status. |
| `GET` | `/metrics` | Prometheus-compatible metrics endpoint. Dynamically queries active claims count. |

---

## 7. AI Services

CoverAI uses **Google Gemini 2.5 Flash** for three distinct AI capabilities:

### 7.1 Claims Triage (`triage_service.py`)

**Trigger:** Runs as a background task immediately after a claim is created.

**Process:**
1. Loads the claim details and associated policy.
2. Checks that the user has granted `ai_analysis_consent`; skips if revoked.
3. Extracts relevant policy sections using keyword matching based on claim type (e.g., "own damage" → collision/glass/bumper keywords; "theft" → stolen/burglary keywords).
4. Constructs a structured prompt asking Gemini to output a JSON object.
5. Calls Gemini with `temperature=0.0` and `response_mime_type="application/json"`.
6. Parses the response and updates the claim record with:
   - `ai_risk_score` (0.0–1.0)
   - `ai_summary` (full JSON with coverage assessment, key clauses, red flags, recommended action)
   - `ai_customer_prediction` (likely_accepted / possibly_accepted / likely_rejected / needs_more_info)
   - `ai_customer_explanation` (3–5 sentence plain-language explanation for the customer)
7. Logs the AI call to `ai_call_logs` with token counts and duration.

**AI Output Schema:**
```json
{
  "risk_score": 0.0-1.0,
  "coverage_assessment": "likely_covered | possibly_covered | likely_not_covered | unclear",
  "key_policy_clauses": ["list of relevant clauses"],
  "red_flags": ["any inconsistencies or suspicious indicators"],
  "recommended_action": "auto_approve | standard_review | escalate | request_documents",
  "summary_for_officer": "2-3 sentence plain English summary",
  "customer_prediction": "likely_accepted | possibly_accepted | likely_rejected | needs_more_info",
  "customer_explanation": "3-5 sentence explanation for the customer"
}
```

### 7.2 Image Damage Analysis (`triage_service.py`)

**Trigger:** Runs as a background task after each claim image is uploaded.

**Process:**
1. Loads the image bytes from storage (local filesystem or S3).
2. Checks user's AI consent.
3. Base64 encodes the image and sends it to Gemini Vision as a multimodal prompt (text + inline image).
4. Parses the response and updates the `ClaimImage` record with:
   - `ai_damage_tags` (JSON with damage areas, severity, detection confidence)
   - `ai_damage_confidence` (0.0–1.0)
5. **Fraud detection:** If no damage is detected with high confidence (>0.8), the system:
   - Flags the claim with a red flag in `ai_summary`
   - Sets `ai_risk_score` to 1.0 (maximum risk)
   - Logs a warning for the officer

**Vision AI Output Schema:**
```json
{
  "damage_detected": true|false,
  "damage_areas": ["front bumper", "windshield"],
  "damage_severity": "minor | moderate | severe | total_loss",
  "confidence": 0.0-1.0,
  "notes": "brief observation"
}
```

### 7.3 Policy Q&A Chat (`qa_service.py`)

**Trigger:** User sends a question via the conversation interface.

**Process:**
1. Loads the policy's extracted text as system context.
2. Loads the last 6 messages from the conversation for contextual continuity.
3. Streams the response using Gemini's async streaming API.
4. Returns tokens to the client via **Server-Sent Events (SSE)**.
5. After streaming completes, persists both the user question and assistant response as `Message` records.

**System Prompt:** Instructs the AI to act as an Indian motor insurance policy assistant, answer only from the policy document, use simple English, never invent information, and reference specific clauses and limits.

---

## 8. Frontend Application

The frontend is a **Next.js 14 App Router** application with **TypeScript** and **Tailwind CSS**, using the **shadcn/ui** component library (New York preset).

### Route Structure

| Route Group | Path | Purpose |
|:---|:---|:---|
| `(auth)` | `/login`, `/register` | Public authentication pages |
| `(dashboard)` | `/dashboard`, `/policies`, `/claims/*`, `/help` | Customer portal |
| `(insurer)` | `/insurer/dashboard`, `/insurer/claims/*`, `/insurer/reports` | Insurer officer portal |
| `(advisor)` | `/advisor/customers`, `/advisor/claims/*`, `/advisor/renewals` | Insurance advisor portal |
| — | `/privacy-policy` | Static DPDP privacy policy page |
| — | `/unauthorized` | 403 unauthorized error page |
| — | `/` | Landing page |

### Edge Middleware (`middleware.ts`)

The Next.js Edge Middleware enforces authentication and role-based routing:

- **Auth page guard:** If a user is already authenticated (has `refresh_token` cookie) and visits `/login` or `/register`, they are redirected to their role-appropriate portal:
  - `customer` → `/dashboard`
  - `advisor` → `/advisor/customers`
  - `insurer_officer` → `/insurer/dashboard`
- **Protected route guard:** If an unauthenticated user visits any protected path (`/dashboard/*`, `/policies/*`, `/claims/*`, `/insurer/*`, `/advisor/*`), they are redirected to `/login?redirect=<original_path>`.

### Key Frontend Components

| Component | File | Purpose |
|:---|:---|:---|
| **PolicyCard** | `policy-card.tsx` | Displays policy summary with status badge, vehicle info, dates |
| **ClaimCard** | `claim-card.tsx` | Shows claim summary with status, type, and amount |
| **ImageUploader** | `image-uploader.tsx` | Drag-and-drop multi-image uploader with preview |
| **ChatMessage** | `chat-message.tsx` | Renders user/assistant messages in the Q&A chat |
| **StatusBadge** | `status-badge.tsx` | Color-coded status indicator for claims/policies |
| **PrivacyBanner** | `PrivacyBanner.tsx` | DPDP-compliant cookie consent banner |
| **Providers** | `providers.tsx` | React context providers wrapper |

### State Management

- **Zustand** (`store.ts`) — Lightweight global state for user session and UI state.
- **useUser** hook (`useUser.ts`) — Custom hook for fetching and caching current user data.
- **Axios instance** (`auth.ts`) — Pre-configured with base URL `http://localhost:8000/api/v1`, cookie credentials, and auto-refresh logic.

---

## 9. DPDP Compliance & Data Privacy

CoverAI implements comprehensive compliance with India's **Digital Personal Data Protection Act, 2023**.

### Consent Management

Users can manage four consent types via the `/consent` API:

| Consent Type | Effect When Revoked |
|:---|:---|
| `data_processing` | Core processing consent (required for basic functionality) |
| `marketing` | Marketing communications opt-out |
| `ai_analysis` | Disables AI triage and vision analysis for future claims. Existing AI summaries are retained for audit trails. The `User.ai_analysis_consent` flag is set to `False`. |
| `third_party_sharing` | Controls data sharing with third parties |

### Data Retention Schedules

| Data Category | Retention Limit | Minimization Action |
|:---|:---|:---|
| Active Policies | Indefinite (while active) | Full metadata + PDF retained |
| Expired Policies | 2 years after expiry | `extracted_text` deleted from DB; original PDF retained in storage for litigation |
| Conversation Messages | 1 year | Raw messages deleted; aggregate `message_count` preserved on conversation record |
| Active Claims & Images | Indefinite (until erasure) | Required by insurance regulations |
| Audit Logs | 7 years | Retained in full (IRDAI regulatory requirement) |

### Right to Data Portability (Section 6)

When a user requests a data export:
1. A `DataExportRequest` record is created with `pending` status.
2. A background worker compiles **all** user data into a single JSON file:
   - User profile (including decrypted phone)
   - All policies (without extracted_text)
   - All claims with AI analysis results
   - All conversations and messages
   - Consent records
   - Audit logs
3. The JSON is uploaded to storage and the download URL is saved.
4. A notification email is stubbed (logged for future email service integration).

### Right to Erasure (Section 12)

When a user requests account deletion:
1. A `DataDeletionRequest` is created with `pending` status.
2. A **30-day grace period** begins (user can cancel via `/consent/data-deletion-request/cancel`).
3. After 30 days, the daily scheduler job performs final anonymization:
   - **User profile:** Email → `deleted_xxxx@anonymized.coverai.com`, name → `Anonymized User`, phone → encrypted zeros, account deactivated
   - **Policies:** `extracted_text` nulled out
   - **Claims:** Incident descriptions replaced with "Deleted as per DPDP account erasure request"; locations anonymized
   - **Images:** Physical files permanently deleted from storage
   - **Audit logs:** Preserved with anonymized actor references (regulatory requirement)

### Encryption at Rest

- **Phone numbers:** Encrypted using Fernet symmetric encryption via a custom `EncryptedString` SQLAlchemy type. Decryption is transparent on read.
- **Phone hash:** SHA-256 hash of normalized 10-digit phone number, enabling exact-match duplicate checking without decryption.
- **Vehicle registration:** Encrypted using the same `EncryptedString` type.

---

## 10. Background Jobs & Scheduler

CoverAI uses **APScheduler (AsyncIOScheduler)** for automated background tasks, initialized on application startup.

### Scheduled Jobs

| Job | Schedule | Description |
|:---|:---|:---|
| `run_data_minimization_expired_policies` | Every Sunday at 00:00 | Nulls `extracted_text` on policies that are expired and older than 2 years. |
| `run_data_minimization_old_messages` | Every Sunday at 00:00 | Deletes conversation messages older than 1 year; preserves aggregate message counts. |
| `run_data_deletion_grace_period` | Daily at 01:00 | Processes pending deletion requests older than 30 days — anonymizes user data, deletes images. |

### Ad-Hoc Background Tasks

These run via FastAPI's `BackgroundTasks` and are triggered inline by API endpoints:

| Task | Trigger | Description |
|:---|:---|:---|
| `run_ai_triage` | Claim creation | Sends claim + policy context to Gemini for risk assessment |
| `run_image_ai_analysis` | Image upload | Sends claim image to Gemini Vision for damage analysis |
| `notify_insurer` | Claim submission | Logs a notification stub for the insurer (future: email/push) |
| `notify_customer` | Claim status change | Logs a notification stub for the customer (future: email/push) |
| `run_data_export` | Data export request | Compiles user data into downloadable JSON archive |

---

## 11. Storage Backend

CoverAI uses a **pluggable storage backend** pattern with an abstract base class:

### Supported Backends

| Backend | Config Value | Use Case |
|:---|:---|:---|
| **LocalStorageBackend** | `STORAGE_BACKEND=local` (default) | Development. Stores files in system temp directory (`/tmp/coverai` or Windows equivalent). |
| **S3StorageBackend** | `STORAGE_BACKEND=s3` | Production. Uses AWS S3 via `boto3`. Bucket name from `STORAGE_BUCKET` env var. |

### Stored File Types

| Type | Path Pattern | Description |
|:---|:---|:---|
| Policy PDFs | `policies/{policy_id}/{filename}` | Original uploaded PDF documents |
| Claim Images | `claims/{claim_id}/images/{image_id}.{ext}` | JPEG/PNG/WebP damage evidence |
| Data Exports | `exports/{user_id}/{request_id}.json` | DPDP data portability archives |

---

## 12. Observability & Monitoring

### Prometheus Metrics

- **HTTP telemetry:** Auto-instrumented via `prometheus_fastapi_instrumentator` — request counts, latencies, status codes.
- **AI call counter:** `ai_calls_total` (labels: `service`, `model`) — tracks triage and vision API calls.
- **Active claims gauge:** `active_claims_gauge` — dynamically queried count of unresolved claims. Exposed at `GET /metrics`.

### Structured Logging

- JSON-formatted structured logs via `core/logging_config.py`.
- All AI operations log detailed information: claim IDs, risk scores, durations, error details.
- Audit-sensitive operations (login, registration, consent changes) are logged to both application logs and the `audit_logs` database table.

### AI Call Logging

Every AI API call is recorded in the `ai_call_logs` table:
- `service`: "triage", "image", or "qa"
- `model`: "gemini-2.5-flash"
- `prompt_tokens` / `completion_tokens`: Token usage metrics
- `duration_ms`: Wall-clock duration of the API call
- Associated `claim_id` and/or `policy_id`

---

## 13. Testing

### End-to-End Tests (Playwright)

Located in `e2e/`, the test suite covers three user role workflows:

| Test File | Coverage |
|:---|:---|
| `customer.spec.js` | Registration, login, policy upload, claim creation, image upload, claim submission, Q&A chat |
| `insurer.spec.js` | Officer login, claim queue browsing, self-assignment, status transitions (approve/reject) |
| `advisor.spec.js` | Advisor login, customer list, viewing customer policies and claims |
| `auth.setup.js` | Reusable authentication fixture for all test suites |

**Run commands:**
```bash
pnpm test:e2e                    # All tests
pnpm test:e2e:customer           # Customer workflow only
pnpm test:e2e:insurer            # Insurer workflow only
pnpm test:e2e:advisor            # Advisor workflow only
pnpm test:e2e:ui                 # Interactive Playwright UI mode
```

### Backend Tests

Located in `apps/api/tests/`, run via:
```bash
cd apps/api && poetry run pytest
```

---

## 14. Local Development & Deployment

### Prerequisites

- Node.js v18+ (v20 recommended)
- pnpm v9+
- Python 3.11+
- Poetry (Python package manager)
- Docker Desktop

### Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env with your GEMINI_API_KEY and other secrets

# 2. Install dependencies
pnpm install

# 3. Start the full stack (PostgreSQL, Redis, API, Web)
docker compose up --build
# OR
make dev
```

### Service Endpoints

| Service | URL |
|:---|:---|
| **Web Portal** | http://localhost:3000 |
| **API Swagger Docs** | http://localhost:8000/docs |
| **API Health Check** | http://localhost:8000/health |
| **Prometheus Metrics** | http://localhost:8000/metrics |
| **PostgreSQL** | `localhost:5432` |
| **Redis** | `localhost:6379` |

### Database Migrations

```bash
make migrate
# OR
docker compose exec api alembic upgrade head
```

### Environment Variables

| Variable | Required | Description |
|:---|:---|:---|
| `DATABASE_URL` | Yes | PostgreSQL async connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for AI features |
| `JWT_SECRET` | Yes | 64-char hex secret for JWT signing |
| `ALLOWED_ORIGINS` | Yes | CORS allowed origins (comma-separated) |
| `STORAGE_BUCKET` | Yes | Storage bucket name |
| `STORAGE_BACKEND` | No | `local` (default) or `s3` |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID (enables Google Sign-In) |
| `FIELD_ENCRYPTION_KEY` | No | Fernet encryption key for PII fields |

---

## 15. User Workflows (End-to-End)

### Customer Workflow

```
Register → Login → View Dashboard (Overview)
                        │
            ┌───────────┼───────────────┬──────────────────┐
            │           │               │                  │
      Upload Policy   File Claim    AI Advisor Chat    Privacy Controls
      (/policies)     (/claims/new) (/dashboard/       (/dashboard/
            │               │        ai-advisor)        privacy)
            │         ┌─────▼─────┐
            │         │ 4-Step    │
            │         │ Wizard    │
            │         └─────┬─────┘
            │               │
            │    ┌──────────▼──────────┐
            │    │ Step 5: Success     │
            │    │ Screen              │
            │    │ • Claim number      │
            │    │ • AI prediction     │
            │    │ • View detail link  │
            │    └──────────┬──────────┘
            │               │
            └───────────────┤
                            │
               ┌────────────▼────────────┐
               │  Track Claim Status      │
               │  (draft → submitted      │
               │   → under_review         │
               │   → approved/rejected)   │
               │                          │
               │  AI damage overlays on   │
               │  evidence images         │
               └──────────────────────────┘
```

**Sidebar Navigation (Customer):**
- Dashboard (overview)
- My Policies
- File a Claim
- My Claims
- AI Advisor (standalone chat page)
- My Advisor (advisor management)
- Privacy (DPDP panel)
- Help

### Insurer Officer Workflow

```
Login ──▶ View Claim Queue ──▶ Filter/Browse Claims
                                      │
                              Self-Assign Claim
                              (submitted → under_review)
                                      │
                              Review Details:
                              • AI triage summary
                              • Risk score
                              • Red flags
                              • Damage images + AI tags
                              • Policy coverage info
                                      │
                              ┌───────▼───────┐
                              │ Status Update  │
                              ├───────────────┤
                              │ • Approve      │ (requires approved_amount)
                              │ • Reject       │ (with remarks)
                              │ • Assign       │
                              │   Surveyor     │
                              └───────────────┘
                                      │
                              Customer Notified
```

### Advisor Workflow

```
Login ──▶ View Assigned Customers ──▶ View Customer Detail
                                            │
                                    ┌───────▼───────┐
                                    │ Read-Only View │
                                    ├───────────────┤
                                    │ • Policies     │
                                    │ • Claims       │
                                    │ • Policy Count │
                                    │ • Open Claims  │
                                    └───────────────┘
```

### Claim Status Lifecycle

```
draft ──▶ submitted ──▶ under_review ──┬──▶ approved ──▶ settled
                                       ├──▶ rejected
                                       └──▶ surveyor_assigned ──┬──▶ approved
                                                                └──▶ rejected
```

---

## Appendix: Key Design Decisions

1. **Cookie-first auth strategy:** JWT tokens are stored in HttpOnly cookies (not localStorage) to prevent XSS attacks. A non-HttpOnly `refresh_token` indicator cookie allows the Next.js edge middleware to detect authentication state without exposing the actual JWT.

2. **Background AI processing:** AI triage and vision analysis run as FastAPI background tasks, keeping claim creation and image upload endpoints fast and responsive. Results are asynchronously written to the database.

3. **Consent-gated AI:** All AI processing checks `user.ai_analysis_consent` before executing. This ensures DPDP compliance while maintaining existing AI summaries for administrative audit trails even after consent revocation.

4. **Pluggable storage:** The abstract `StorageBackend` pattern allows seamless switching between local development (filesystem) and production (S3) without code changes.

5. **Encrypted PII columns:** The custom `EncryptedString` SQLAlchemy type transparently encrypts/decrypts sensitive fields, keeping the ORM layer clean while ensuring at-rest encryption.

6. **Graceful data deletion:** The 30-day grace period for account deletion prevents accidental data loss while fully complying with DPDP Section 12 erasure rights.

7. **Audit-first architecture:** Every state-changing operation records before/after snapshots in the immutable `audit_logs` table, providing full traceability for regulatory compliance.
