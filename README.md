# CoverAI — Production-Ready AI Vehicle Insurance Monorepo

Welcome to the **CoverAI** monorepo workspace. This project is structured as a premium, highly optimized full-stack monorepo integrating a high-performance Python FastAPI backend, a Next.js 14 React frontend, shared schemas, and database container stacks.

---

## 🛠️ Monorepo Structure

```
coverai/
├── apps/
│   ├── web/                → Next.js 14 frontend (App Router, strict TypeScript, Tailwind CSS)
│   └── api/                → FastAPI backend (Python 3.11, Poetry, SQLAlchemy 2.0 Async)
├── packages/
│   ├── shared-types/       → Centralized Zod schemas & types for validation (User, Vehicle, Policy, Claim)
│   └── ui/                 → Workspace-shared visual components (built with shadcn/ui "new-york" preset)
├── .env.example            → Core template configuration for credentials and connections
├── docker-compose.yml      → Local multi-service infrastructure (postgres, redis, api, web)
├── turbo.json              → Workspace pipeline configuration for Turborepo caching
├── Makefile                → Orchestration entrypoints for development operations
├── .gitignore              → Workspace ignore definitions for Node, Python, IDEs, and credentials
└── README.md               → Developer instructions and platform guides
```

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed on your machine:
*   [Node.js](https://nodejs.org/) (v18 or newer, v20+ recommended)
*   [pnpm](https://pnpm.io/) (v9 or newer, workspace manager)
*   [Python 3.11+](https://www.python.org/)
*   [Poetry](https://python-poetry.org/) (Python package manager)
*   [Docker Desktop](https://www.docker.com/)

---

### Local Installation & Environment Setup

#### 1. Setup the Root Environments
Create your local environment file by cloning the template:
```bash
cp .env.example .env
```
Fill in the credentials inside `.env` (such as `OPENAI_API_KEY`, etc.).

#### 2. Install Workspace Node Modules
From the root directory, run the workspace-level installer to bootstrap both internal packages (`shared-types`, `ui`) and the Next.js `web` app:
```bash
pnpm install
```

#### 3. Setup Python Backend Virtual Environment (Optional, for IDE autocomplete)
To set up autocompletion and dependencies on your host machine:
```bash
cd apps/api
poetry install --no-root
```
*(Note: If compiling the native postgres driver fails on the host due to a lack of C++ compiler libraries, don't worry! Dependencies compile seamlessly inside our Linux Docker environments.)*

---

## 🐳 Docker Stack & Hot Reload Development

We orchestrate our development suite using Docker Compose. Hot reloading is enabled on both Next.js and FastAPI through workspace-level directory mappings.

Spin up the entire platform (PostgreSQL 15, Redis 7, FastAPI Backend, Next.js Frontend):
```bash
docker compose up --build
```

### Exposed Service Endpoints

*   **Next.js Web Portal:** [http://localhost:3000](http://localhost:3000)
*   **FastAPI API Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
*   **FastAPI Health Checks:** [http://localhost:8000/health](http://localhost:8000/health)
*   **PostgreSQL Port:** `5432`
*   **Redis Port:** `6379`

---

## ⚙️ Makefile Developer Tooling

We provide a `Makefile` at the root to automate common lifecycle tasks:

| Command | Action |
| :--- | :--- |
| `make dev` | Spins up the full Docker container environment with hot reload enabled |
| `make build` | Builds the Node monorepo apps and packages using Turborepo |
| `make lint` | Runs Node ESLint checks and Python lint analysis |
| `make test` | Executes both Next.js tests and backend pytest runner |
| `make migrate` | Applies pending database Alembic schema migrations |
| `make clean` | Tears down container stacks, purges volumes, and removes build artifacts |

---

## 🛡️ Internal Workspaces Integration

*   **`@coverai/shared-types`**: Zod schemas and inferred types are defined in `packages/shared-types` and referenced in package.json:
    ```json
    "@coverai/shared-types": "workspace:*"
    ```
*   **`@coverai/ui`**: Premium shared buttons, inputs, and components are defined in `packages/ui` and can be imported directly in Next.js:
    ```tsx
    import { Button } from "@coverai/ui";
    ```

---

## 🚢 Production Deployment

### Architecture
- **Frontend**: Vercel (Next.js)
- **Backend**: Railway (FastAPI)
- **Database**: Supabase (PostgreSQL)
- **Redis**: Upstash (serverless)
- **AI**: Google Gemini API

### Prerequisites
1. Push code to GitHub
2. Create a [Supabase](https://supabase.com) project → get connection string
3. Create a [Railway](https://railway.app) project → connect GitHub repo
4. Create a [Vercel](https://vercel.com) project → connect GitHub repo
5. Get a [Gemini API key](https://makersuite.google.com/app/apikey)

### Environment Variables

#### Railway (Backend)
Set these in Railway dashboard → Variables:
```
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:6543/postgres
REDIS_URL=rediss://default:[PASSWORD]@[HOST]:6379
GEMINI_API_KEY=your_key
JWT_SECRET=generate_with_openssl_rand_hex_32
ALLOWED_ORIGINS=https://your-app.vercel.app
STORAGE_BUCKET=coverai-documents-bucket
FIELD_ENCRYPTION_KEY=generate_with_fernet
```

#### Vercel (Frontend)
Set in Vercel dashboard → Environment Variables:
```
NEXT_PUBLIC_API_URL=https://your-backend.railway.app/api/v1
```

### Deployment Steps

#### 1. Database Migrations
After Railway deploys, run migrations:
```bash
# Connect to Railway and run:
cd apps/api
alembic upgrade head
```

Or use the seed script for demo data:
```bash
python scripts/seed_dev.py
```

#### 2. Deploy Backend (Railway)
1. Connect GitHub repo to Railway
2. Select `apps/api` as root directory
3. Railway auto-detects Dockerfile
4. Add environment variables
5. Deploy → get URL like `https://coverai-api.up.railway.app`

#### 3. Deploy Frontend (Vercel)
1. Import repo in Vercel
2. Set Root Directory to `apps/web`
3. Add `NEXT_PUBLIC_API_URL` environment variable
4. Deploy → get URL like `https://coverai.vercel.app`

#### 4. Update CORS
Update Railway `ALLOWED_ORIGINS` to include your Vercel URL.

### CI/CD
GitHub Actions workflow runs on PRs and main branch pushes:
- Lint + type check frontend
- Run backend tests
- Auto-deploy to Railway/Vercel on main

### Health Checks
- Backend: `https://your-backend.railway.app/health`
- Frontend: `https://your-app.vercel.app`

### Troubleshooting
See [EXECUTION_GUIDE.md](./EXECUTION_GUIDE.md) for local development.
