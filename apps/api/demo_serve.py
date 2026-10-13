"""Guarded single-worker launcher for the anonymous demo API.

The demo keeps all session state in process memory and therefore must run with
exactly one uvicorn worker. Setting ``DEMO_WORKERS=1`` is *not* sufficient: it
only feeds the application's lifespan self-check, while ``uvicorn --workers 2``
would still fork two independent processes that each satisfy that check. This
launcher is the supported entrypoint: it validates the requested worker count and
refuses any value other than one before uvicorn is ever constructed.

Usage::

    python demo_serve.py --host 127.0.0.1 --port 8001
    python demo_serve.py --check-config   # print the resolved config, no server
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Sequence

import uvicorn

APP_IMPORT = "demo_app:app"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8001


class MultiWorkerRefused(RuntimeError):
    """Raised when a caller requests anything other than a single worker."""


def ensure_single_worker(workers: int) -> int:
    if workers != 1:
        raise MultiWorkerRefused(
            "Refusing to start: the demo API supports a single worker only. "
            f"Requested workers={workers}; in-memory session state cannot be "
            "shared across processes."
        )
    return 1


def build_server_config(
    *, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, workers: int = 1
) -> uvicorn.Config:
    resolved = ensure_single_worker(workers)
    return uvicorn.Config(APP_IMPORT, host=host, port=port, workers=resolved)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the CoverAI demo API on a single worker.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument(
        "--check-config",
        action="store_true",
        help="validate and print the resolved configuration without starting",
    )
    args = parser.parse_args(argv)

    try:
        config = build_server_config(host=args.host, port=args.port, workers=args.workers)
    except MultiWorkerRefused as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if args.check_config:
        print(json.dumps({"host": args.host, "port": args.port, "workers": config.workers}))
        return 0

    uvicorn.Server(config).run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
