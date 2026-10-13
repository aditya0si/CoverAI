# CoverAI anonymous demo — local runbook

Deterministic milestone-1 slice only. The optional external model is **disabled**:
`POST /api/v1/demo/explanations` with `mode: "external_model"` returns
`503 MODEL_UNAVAILABLE` immediately, with no provider call and no fallback.

## What this demo is

- Upload a text PDF policy, describe an accident, read document-grounded excerpts
  with physical page numbers, then create two explicitly simulated inbox entries.
- No account, no claim, no notification, no coverage decision, no production
  record. Sessions are anonymous capability cookies, isolated from production
  auth.
- English-only lexical retrieval and labelled-only metadata. Unknown details stay
  unknown (`Not found in readable policy text`).

## Prerequisites

- Node.js 26.x and pnpm 9.1.4.
- Poetry 2.2.1 with the API virtualenv (Python 3.14).
- The demo backend imports **no** production settings, database, Redis or models.

Resolved test/runtime dependencies (recorded in `poetry.lock`; the
`apps/api/requirements-demo.lock` hash-pinned file reproduces the demo suite in a
disposable environment — see `../.hermes/coverai-repair-r1/writer-report.md`):

- `fastapi==0.110.3`, `starlette==0.37.2`, `pydantic==2.13.4`
- `PyMuPDF==1.27.2.3`, `httpx==0.27.2`
- `python-multipart==0.0.32`, `pytest==9.1.1`, `pytest-asyncio==1.4.0`

The full production dependency set (`asyncpg==0.29.0`, `cryptography==42.0.8`)
has no CPython 3.14 wheels and is not installed for the demo; it is unrelated to
the demo runtime. See the writer report for the exact lock decisions.

## Build the web bundle (once)

```bash
pnpm install
pnpm --filter web build
```

The Playwright demo config runs the production `next start` bundle, not the dev
compiler.

## Run locally

Terminal A — demo API on port 8001. Always launch through the guarded launcher,
which refuses any worker count other than one and constructs uvicorn with
`workers=1`:

```bash
cd apps/api
poetry run python demo_serve.py --host 127.0.0.1 --port 8001
```

`DEMO_WORKERS=1` alone does **not** prevent `uvicorn --workers 2` from forking
multiple processes; setting the env var is not evidence that the process is
single-worker. The launcher is the supported entrypoint. To inspect the resolved
configuration without starting a server:

```bash
cd apps/api
poetry run python demo_serve.py --check-config
```

Terminal B — web on port 3000:

```bash
DEMO_API_ORIGIN=http://127.0.0.1:8001 \
DEMO_WEB_ORIGIN=http://localhost:3000 \
pnpm --filter web start
```

Then open http://localhost:3000/demo.

### Environment variables

The demo reads only `DEMO_`-prefixed variables (production settings are never
initialised):

| Variable | Default | Purpose |
|---|---|---|
| `DEMO_WORKERS` | `1` | app lifespan self-check only; use `demo_serve.py` to enforce one worker |
| `DEMO_API_ORIGIN` | `http://127.0.0.1:8001` | server-only proxy upstream (web) |
| `DEMO_WEB_ORIGIN` | `http://localhost:3000` | expected browser origin (web) |
| `DEMO_ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | exact Origin allowlist |
| `DEMO_COOKIE_SECURE` | `false` | set `true` under HTTPS |
| `DEMO_MAX_UPLOAD_BYTES` | `10485760` (10 MiB) | file part limit |
| `DEMO_MAX_REQUEST_BYTES` | `11534336` (11 MiB) | whole-request cap incl. framing |
| `DEMO_MAX_CONCURRENT_BODIES` | `4` | concurrent buffered request bodies |
| `DEMO_MAX_INFLIGHT_BYTES` | `25165824` (24 MiB) | aggregate in-flight body budget |
| `DEMO_RECEIVE_DEADLINE_SECONDS` | `15.0` | overall body receive deadline |
| `DEMO_SESSION_CREATE_PER_MINUTE` | `10` | operator rate limit: `POST /session` per key per minute (see below) |
| `DEMO_MUTATIONS_PER_MINUTE` | `30` | operator rate limit: mutating requests per key per minute |
| `DEMO_UPLOADS_PER_MINUTE` | `3` | operator rate limit: policy uploads per key per minute |

### Operator rate limits

The three `*_PER_MINUTE` variables above are real deployment controls, not
test-only knobs. Each is validated strictly at startup (`demo/config.py`,
`_env_rate_per_minute`):

- **Default only when the variable is unset:** the defaults are
  `DEMO_SESSION_CREATE_PER_MINUTE=10`, `DEMO_MUTATIONS_PER_MINUTE=30`,
  `DEMO_UPLOADS_PER_MINUTE=3`. An *explicitly provided* empty or
  whitespace-only value is a configuration error, not a request for the
  default.
- **Accepted range:** a positive integer number of requests per minute, with an
  upper bound of `MAX_DEMO_RATE_PER_MINUTE = 10000`. The generous ceiling still
  supports the dedicated-load browser harness (which raises session creation to
  `1000`), while catching a gross misconfiguration such as a byte count or a
  timeout pasted into a rate field.
- **Malformed, non-integer, empty/whitespace, zero, negative or over-bound
  values abort startup loudly** (a `ValueError` raised while building the
  settings), rather than silently falling back to the default. For example
  `DEMO_UPLOADS_PER_MINUTE=0` or `DEMO_UPLOADS_PER_MINUTE=` (empty) fails the
  process at import time; only leaving the variable unset selects the default.

The remaining `DEMO_` numeric settings keep their lenient defaulting and are out
of scope for this validation.

## Tests

Backend demo suite (self-contained fixtures; `--confcutdir` avoids the parent
conftest that wires production services):

```bash
cd apps/api
poetry run python -m pytest tests/demo -q --confcutdir=tests/demo
```

Current result: **136 passed** (83 original + 53 repair regressions: r1 14,
r2 20, r3 19). The command above is the exact one used for the current
milestone gate; the `--confcutdir=tests/demo` flag is required so collection
does not pull in the parent `conftest.py` that wires production services.

The launcher tests (`test_launcher.py`) and the body-guard / lifecycle-race
regressions are included in that count. A reproducible, hash-pinned demo
environment is available via `apps/api/requirements-demo.lock`; see
`../.hermes/coverai-repair-r1/verification-plan.md`.

Browser acceptance suite (starts its own API 8001, web 3000, proxy-spy web 3010
and a mock upstream 8098; generates a synthetic PDF under `test-results/`):

```bash
cd "C:/Users/oliad/Desktop/insurance"
pnpm test:e2e:demo
# equivalent: pnpm exec playwright test --config=playwright.demo.config.js
```

Current result: **12 passed** (11 original + 1 proxy Retry-After regression).

## Lifecycle and privacy

- **Single worker.** In-memory state only; sharing state across workers is
  intentionally unsupported. The `demo_serve.py` launcher refuses any worker
  count other than one, and the app lifespan self-check rejects
  `DEMO_WORKERS != 1` as a second line of defence.
- **30-minute TTL.** Sessions expire 30 minutes after creation with no sliding
  extension. Purge runs on access and every 60 seconds.
- **Restart resets everything.** All sessions, page text, explanations and
  handoffs disappear on process restart; the browser cookie then resolves to
  nothing.
- **Reset / expiry.** Reset atomically drops page text, explanations, handoffs
  and idempotency state and clears the cookie. A known expired capability returns
  `410`; a missing one returns `401`; foreign IDs return `404`.
- **PDF bytes are not retained.** The whole request is capped and buffered in
  memory by a pure-ASGI byte cap before any parsing; the policy multipart is
  parsed in-process into memory. No sponsored temporary file is written for the
  upload, and only page text, metadata and simulation state survive.
- **Size limits.** 10 MiB per upload, 11 MiB per request including framing. The
  cap counts the actual received bytes, so chunked bodies (or bodies whose
  `Content-Length` disagrees with the bytes sent) cannot bypass it; oversized
  bodies get a structured `413` with `Cache-Control: no-store` before multipart
  or JSON parsing.
- **Body guard.** Authorization (Origin, session capability, CSRF) runs *before*
  the first request-body byte is received, so an unauthenticated slow upload is
  refused with `401`/`403`/`410` without buffering. Concurrent buffered bodies
  are bounded (`DEMO_MAX_CONCURRENT_BODIES`), an aggregate in-flight byte budget
  (`DEMO_MAX_INFLIGHT_BYTES`) is enforced, and an overall receive deadline
  (`DEMO_RECEIVE_DEADLINE_SECONDS`) plus disconnect handling release slots and
  budget (bounded cancellation).
- **English text PDFs only.** No OCR. Image-only PDFs are rejected with
  `OCR_NOT_AVAILABLE`; encrypted/corrupt/empty PDFs are rejected honestly.
- **No external access.** The demo makes no provider or network calls in
  deterministic mode.
