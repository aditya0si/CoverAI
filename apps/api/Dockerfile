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

RUN pip install --no-cache-dir poetry

COPY pyproject.toml /app/

# Build a separate virtual environment to copy cleanly to final stage
RUN python -m venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN poetry install --no-interaction --no-ansi --only main

# ==========================================
# Stage 2: Final Runner
# ==========================================
FROM python:3.11-slim AS runner

WORKDIR /app

# Install minimal system dependencies (libpq5 for postgres client, curl for healthcheck)
RUN apt-get update && apt-get install -y \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual env dependencies from builder
COPY --from=builder /opt/venv /opt/venv
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
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
