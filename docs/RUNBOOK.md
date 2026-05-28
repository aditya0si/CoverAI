# CoverAI Operations Runbook

This guide outlines the commands and procedures to run, migrate, seed, test, and deploy CoverAI in local and production environments.

---

## 1. System Prerequisites

Ensure you have the following installed on your host system:
- **Docker & Docker Compose**
- **Node.js v20+** and **pnpm v9+**
- **Python 3.11** and **Poetry** (optional for local host execution, Docker compose handles this natively)

---

## 2. Local Environment Setup

1. **Clone and Install Workspace Dependencies**:
   ```bash
   pnpm install
   ```
2. **Setup Dev Environment Variables**:
   Copy `.env.development` to the root folder:
   ```bash
   copy .env.development .env
   ```
3. **Start Development Database and Cache Containers**:
   ```bash
   docker compose up coverai-postgres coverai-redis -d
   ```

---

## 3. Database Migrations and Seeding

We use **Alembic** to manage PostgreSQL database migrations.

### Running Migrations
To upgrade the PostgreSQL database schema to the latest version:
```bash
# Via Docker compose (Recommended)
docker compose exec api alembic upgrade head

# Via local terminal (if connected to localhost postgres)
cd apps/api
poetry run alembic upgrade head
```

### Rollback Migration
To downgrade the schema by one revision:
```bash
docker compose exec api alembic downgrade -1
```

### Seeding Development Data
CoverAI includes a built-in development data seeder that populates administrators, customer profiles, advisors, policies, and claims:
```bash
# Executed inside the api container
docker compose exec api python scripts/seed_dev.py
```

---

## 4. Launching Local Development Servers

To start the complete hot-reloading development environment (Next.js frontend, FastAPI backend, PostgreSQL, and Redis):
```bash
# In the root workspace
pnpm dev
# OR using the Makefile
make dev
```
- **Frontend App**: `http://localhost:3000`
- **FastAPI backend**: `http://localhost:8000`
- **Interactive OpenAPI documentation**: `http://localhost:8000/docs`

---

## 5. Running the Test Suites

### Backend Unit & Integration Tests
To run PyTest unit tests (covering rate limiting, encryption decorators, upload validations, and API routers):
```bash
# Run tests inside api container
docker compose exec api pytest

# Or on local host
cd apps/api
poetry run pytest
```

---

## 6. Production Deployment (Docker Compose)

CoverAI provides a secure, production-grade Docker compose profile that runs without local code volume mappings, executes container processes under a secure non-root user, and configures active production health checks.

1. **Assemble Production Variables**:
   Configure `.env.production` at the monorepo root.
2. **Boot the Monorepo in Production Mode**:
   ```bash
   docker compose --profile production up --build -d
   ```
   This will build and boot the production containers:
   - **`coverai-api-prod`**: Fast ASGI container running on port `8000`.
   - **`coverai-web-prod`**: Optimized Next.js server running on port `3000`.
   - **`coverai-postgres`** & **`coverai-redis`** databases.
3. **Verify Production Container Health**:
   ```bash
   docker compose ps
   ```
   The `coverai-api-prod` container will show `healthy` once its internal curl-based health checks successfully connect to `/health`.
