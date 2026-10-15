#!/bin/sh
# Deploy-time startup: apply migrations, then serve on Render's $PORT.
# Migrations are idempotent (no-op when the DB is already at head).
set -e
echo "[entrypoint] applying migrations: alembic upgrade head"
alembic upgrade head
echo "[entrypoint] starting uvicorn on port ${PORT:-8000}"
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
