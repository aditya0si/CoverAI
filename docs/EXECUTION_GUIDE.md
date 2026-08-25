# CoverAI — Execution & Testing Guide

> This guide walks you through running the entire CoverAI platform locally and testing every feature across all user roles.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Setup](#2-environment-setup)
3. [Starting the Application](#3-starting-the-application)
4. [Database Seeding (Test Accounts)](#4-database-seeding-test-accounts)
5. [Sample Login Credentials](#5-sample-login-credentials)
6. [Testing Workflows by Role](#6-testing-workflows-by-role)
   - [A. Customer Workflow](#a-customer-workflow)
   - [B. Insurer Officer Workflow](#b-insurer-officer-workflow)
   - [C. Insurance Advisor Workflow](#c-insurance-advisor-workflow)
   - [D. Cross-Role Integration Test](#d-cross-role-integration-test)
7. [Troubleshooting](#7-troubleshooting)
8. [Stopping the Application](#8-stopping-the-application)

---

## 1. Prerequisites

Make sure the following are installed on your machine:

| Tool              | Version  | Check Command              | Install Link                                  |
|:------------------|:---------|:---------------------------|:----------------------------------------------|
| **Docker Desktop**| 4.x+     | `docker --version`         | https://docs.docker.com/get-docker/           |
| **Docker Compose**| v2.x+    | `docker compose version`   | Bundled with Docker Desktop                   |
| **Node.js**       | 18+      | `node --version`           | https://nodejs.org/                           |
| **pnpm**          | 9.x+     | `pnpm --version`           | `npm install -g pnpm`                         |
| **Git**           | 2.x+     | `git --version`            | https://git-scm.com/                          |

> **Note:** A working internet connection is required for the Google Gemini AI AI-driven features (claim triage, vision analysis, policy Q&A chat).

---

## 2. Environment Setup

The project comes with a pre-configured `.env` file. Verify it exists in the project root:

```
coverai/
├── .env          ← Main environment config (used by Docker Compose)
├── .env.example  ← Template reference
```

**Key environment variables (already configured):**

| Variable            | Value                                     | Purpose                          |
|:--------------------|:------------------------------------------|:---------------------------------|
| `DATABASE_URL`      | `postgresql+asyncpg://postgres:postgres@postgres:5432/coverai` | PostgreSQL connection |
| `REDIS_URL`         | `redis://redis:6379/0`                    | Redis for sessions & rate limiting |
| `GEMINI_API_KEY`    | Pre-configured                            | Google Gemini AI (triage + chat) |
| `JWT_SECRET`        | Pre-configured (64-char hex)              | JWT token signing                |
| `ALLOWED_ORIGINS`   | `http://localhost:3000`                   | CORS whitelist                   |
| `STORAGE_BUCKET`    | `coverai-documents-bucket`                | File storage bucket name         |

> If your Gemini API key has expired, replace `GEMINI_API_KEY` in `.env` with a valid key from [Google AI Studio](https://makersuite.google.com/app/apikey).

---

## 3. Starting the Application

### Option A: Docker Compose (Recommended — Full Stack)

This starts **all 4 services**: PostgreSQL, Redis, FastAPI backend, and Next.js frontend.

```bash
# From the project root directory:
docker compose up --build
```

Wait for all services to be healthy. You should see:
```
coverai-postgres  | LOG:  database system is ready to accept connections
coverai-redis     | Ready to accept connections
coverai-api       | INFO:     Uvicorn running on http://0.0.0.0:8000
coverai-web       | ▲ Next.js 14.2.x  - Local: http://localhost:3000
```

**Service URLs:**

| Service          | URL                           |
|:-----------------|:------------------------------|
| **Frontend**     | http://localhost:3000          |
| **Backend API**  | http://localhost:8000          |
| **API Docs**     | http://localhost:8000/docs     |
| **Health Check** | http://localhost:8000/health   |

---

### Option B: Local Development (Individual Services)

If you prefer running services individually for hot-reloading:

**Step 1: Start PostgreSQL & Redis (via Docker)**
```bash
docker compose up postgres redis -d
```

**Step 2: Start the FastAPI backend**
```bash
cd apps/api
poetry install
poetry run alembic upgrade head     # Run database migrations
poetry run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Step 3: Start the Next.js frontend**
```bash
# From project root
pnpm install
cd apps/web
pnpm dev
```

> **Important:** If running locally (not Docker), update `.env` to use `localhost` instead of Docker service names:
> ```
> DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/coverai
> REDIS_URL=redis://localhost:6379/0
> ```

---

## 4. Database Seeding (Test Accounts)

After the services are running, seed the database with test accounts and sample data:

### Using Docker Compose:
```bash
docker compose exec api python scripts/seed_dev.py
```

### Using Local Development:
```bash
cd apps/api
poetry run python scripts/seed_dev.py
```

**The seed script creates:**
- 5 user accounts (admin, customer, insurer officer, advisor, aggregator)
- 1 sample insurance policy (CoverAI General Insurance, Tesla Model Y)
- 1 sample claim (own damage, under review, assigned to the officer)

Expected output:
```
Starting development database seeding...
Clearing existing database tables...
Inserting users...
Inserting sample policy...
Inserting sample claim...
Seeding completed successfully!

Seeded Accounts details (Password for all accounts is 'Password123!'):
 - ADMIN: email=admin@coverai.com, phone=+919999999991
 - CUSTOMER: email=customer@coverai.com, phone=+919999999992
 - INSURER_OFFICER: email=officer@coverai.com, phone=+919999999993
 - ADVISOR: email=advisor@coverai.com, phone=+919999999994
 - AGGREGATOR: email=aggregator@coverai.com, phone=+919999999995
```

---

## 5. Sample Login Credentials

All seeded accounts use the same password. Use these to test every role:

| Role               | Email                    | Password         | Portal URL After Login                |
|:-------------------|:-------------------------|:-----------------|:--------------------------------------|
| **Customer**       | `customer@coverai.com`   | `Password123!`   | http://localhost:3000/dashboard        |
| **Insurer Officer**| `officer@coverai.com`    | `Password123!`   | http://localhost:3000/insurer/dashboard|
| **Insurance Advisor** | `advisor@coverai.com` | `Password123!`   | http://localhost:3000/advisor/customers|
| **System Admin**   | `admin@coverai.com`      | `Password123!`   | http://localhost:3000/dashboard        |

> **Password Policy:** Min 8 characters, at least 1 uppercase letter, at least 1 digit.

> **Phone Format:** 10-digit Indian mobile (e.g., `9999999992`). The `+91` prefix is added automatically.

---

## 6. Testing Workflows by Role

### A. Customer Workflow

Login as: **`customer@coverai.com`** / **`Password123!`**

#### Screen 1: Dashboard Overview (`/dashboard`)
- [ ] Verify welcome banner shows "Hello, Alice"
- [ ] Check 4 interactive stat cards: Active Policies, Open Claims, Sum Insured, Total Claims
- [ ] Verify 3 quick-action widgets: "Recent Activity Feed", "Policy Expiry Countdown", "AI Claim Assist"
- [ ] Check open claims list with dynamic timeline stepper
- [ ] Verify "Quick Actions" dock: Upload Policy, File New Claim, Connect Advisor

#### Screen 2: My Policies (`/policies`)
- [ ] Verify the seeded policy "CoverAI General Insurance Ltd." appears with status badge
- [ ] Click policy card → expand to see detailed coverage breakdown
- [ ] Test **Upload Policy**: Click "Upload Policy" button → modal with drag-and-drop zone appears
  - Fill in required metadata, select PDF, observe upload progress bar
  - Success toast confirms document classification

#### Screen 3: File a Claim (`/claims/new`) — 5-Step Wizard
- [ ] **Step 1 - Select Policy**: Dropdown with policy filtering
- [ ] **Step 2 - Incident Details**: Interactive date picker, map-based location selector, multi-select damage types
- [ ] **Step 3 - Evidence Upload**: Multi-file upload with instant thumbnail preview
- [ ] **Step 4 - Review & Submit**: Summary card of all entered data
- [ ] **Step 5 - Success Screen** ✨:
  - Verify AI-generated prediction overlay (Probability score + heat map visualization)
  - Copy claim reference button functionality

#### Screen 4: Claim Detail (`/claims/{id}`)
- [ ] Check new "Evidence Gallery" with zoom-in capability
- [ ] Verify AI Damage Tagging overlay on images
- [ ] Check interactive status history logs with timestamps

#### Screen 5: AI Policy Advisor (`/dashboard/ai-advisor`)
- [ ] Verify dual-pane layout: Sidebar context vs. Chat interface
- [ ] Test "Suggest questions based on my policies" prompt chips
- [ ] Observe markdown rendering of AI responses, including bullet points and bold text

---

### B. Insurer Officer Workflow

**Logout first**, then login as: **`officer@coverai.com`** / **`Password123!`**

#### Screen 1: Insurer Dashboard (`/insurer/dashboard`)
- [ ] Check "Real-time Claim Traffic" chart (New vs. Reviewed)
- [ ] Verify "High-Risk Alert" notification bell for urgent cases
- [ ] Access "Global Search" bar to find claims by customer name or registration number

#### Screen 2: Claims Queue (`/insurer/claims`)
- [ ] Use column filtering (Type: Own Damage, Status: Under Review)
- [ ] Bulk action checkbox functionality (re-assign or update status)

#### Screen 3: Claim Review (`/insurer/claims/{id}`)
- [ ] **Interactive Decision Panel**: Toggle between 'Approve', 'Reject', or 'Request Information'
- [ ] Verify "AI Risk Assessment" modal with granular breakdown (e.g., Image inconsistency score, Fraud probability)

---

### C. Insurance Advisor Workflow

**Logout first**, then login as: **`advisor@coverai.com`** / **`Password123!`**

#### Screen 1: Advisor Portal (`/advisor/customers`)
- [ ] Verify customer list with "Last Engagement" column
- [ ] Use search to find specific customer by phone/email
- [ ] Check "Renewal Pipeline" widget to track expiring policies

#### Screen 2: Advisor Insights (`/advisor/insights`)
- [ ] New feature: Dashboard showing "Total Portfolio Value" and "Claims Ratio per Customer"

---

### D. Cross-Role Integration Test

1. **Customer**: Files a claim via mobile-responsive Wizard.
2. **System**: Automated Trigger sends notification to Advisor.
3. **Insurer**: Reviews AI prediction card.
4. **Customer**: Receives live push notification/banner update on Dashboard once Status is "Approved".

---

## 7. Troubleshooting

### Common Issues

| Issue | Solution |
|:---|:---|
| **Port 5432/3000/8000 in use** | `npx kill-port <port>` |
| **Database migration errors** | `docker compose exec api alembic upgrade head` |
| **AI features not working** | Check `GEMINI_API_KEY` in `.env` |
| **Docker build fails** | `docker compose build --no-cache` |

### Useful Debug Commands

```bash
docker compose logs -f api          # Live backend logs
docker compose exec api pytest      # Run backend tests
pnpm test:e2e                       # Run Playwright E2E suite
```

---

## 8. Stopping the Application

### Stop & Clean:
```bash
docker compose down -v
rm -rf node_modules apps/web/.next apps/web/node_modules
```

---

## Quick Reference Card

| What | Command |
|:---|:---|
| Start everything | `docker compose up --build` |
| Seed test data | `docker compose exec api python scripts/seed_dev.py` |
| View API logs | `docker compose logs -f api` |

| URL | What It Shows |
|:---|:---|
| http://localhost:3000 | Landing Page |
| http://localhost:3000/dashboard | Customer Dashboard |
| http://localhost:3000/dashboard/ai-advisor | AI Policy Advisor |
| http://localhost:3000/claims | Customer Claims List |
| http://localhost:3000/insurer/dashboard | Insurer Officer Dashboard |
| http://localhost:3000/advisor/customers | Advisor Customer List |
| http://localhost:3000/privacy-policy | Static Privacy Policy |
| http://localhost:8000/docs | API Documentation (Swagger) |
