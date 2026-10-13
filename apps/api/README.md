# CoverAI API

FastAPI backend for CoverAI — motor insurance claims, policy Q&A, AI triage,
and DPDP-compliant data handling.

## Setup

```bash
cd apps/api
poetry install --no-root
```

Poetry installs into a project virtualenv (or an active one). To run the app:

```bash
poetry run uvicorn main:app --reload
```

## Required environment variables

The Settings object (`core/config.py`) loads from the process environment and
from `.env`, `.env.<ENV>`, `../../.env`, and `../../.env.<ENV>`.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | e.g. `postgresql+asyncpg://user:pass@host:5432/db` |
| `REDIS_URL` | yes | e.g. `redis://localhost:6379/0` |
| `GEMINI_API_KEY` | yes | Google Generative AI API key |
| `JWT_SECRET` | yes | Secret used to sign access/refresh tokens |
| `STORAGE_BUCKET` | yes | S3 bucket or local storage path |
| `FIELD_ENCRYPTION_KEY` | yes | Valid Fernet key. Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `ALLOWED_ORIGINS` | no | Comma-separated CORS origins (default `http://localhost:3000`) |
| `STORAGE_BACKEND` | no | `local` (default) or `s3` |
| `GOOGLE_CLIENT_ID` | no | Set to enable Google Sign-In |

`FIELD_ENCRYPTION_KEY` is required: the API fails to start if it is missing or
invalid, rather than silently falling back to a throwaway key.

## Tests, lint, and migrations

```bash
poetry run pytest -q          # run the test suite
poetry run ruff check .       # lint
poetry run alembic upgrade head   # apply database migrations
```

## Notes

`google-generativeai` is upstream-deprecated (superseded by the
`google-genai` SDK) but is still used by `services/triage_service.py` and
`services/qa_service.py`. Migration to the new SDK is tracked separately.
