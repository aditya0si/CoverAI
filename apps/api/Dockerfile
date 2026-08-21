# ==========================================
# Stage 1: Builder
# ==========================================
FROM python:3.11-slim AS builder
WORKDIR /app

# Install compilation toolchains
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml /app/

# Build a separate virtual environment to copy cleanly to final stage
RUN python -m venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies with pip (more reliable on Railway than Poetry)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir fastapi uvicorn sqlalchemy alembic asyncpg pydantic-settings pydantic python-multipart passlib bcrypt pyjwt redis slowapi prometheus-fastapi-instrumentator apscheduler cryptography python-json-logger httpx google-generativeai pymupdf

# ==========================================
# Stage 2: Final Runner
# ==========================================
FROM python:3.11-slim AS runner
WORKDIR /app

# Install minimal system dependencies
# libpq5: PostgreSQL client library
# curl: for healthcheck
RUN apt-get update && apt-get install -y \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual env dependencies from builder
COPY --from=builder /opt/venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy source code
COPY . /app

# Harden security: Run as non-root user
RUN groupadd -g 10001 coverai && \
    useradd -u 10001 -g coverai -s /bin/sh coverai && \
    chown -R coverai:coverai /app
USER coverai

EXPOSE 8000

# Configure production health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Railway provides $PORT automatically
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
