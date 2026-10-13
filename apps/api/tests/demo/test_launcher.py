"""Guarded single-worker launcher regressions (coverai-repair-r1 item 5).

``DEMO_WORKERS`` env alone does not prevent ``uvicorn --workers 2``; this suite
pins the supported launcher that refuses any actual multi-worker invocation.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_launcher_refuses_multiple_workers() -> None:
    import demo_serve

    with pytest.raises(demo_serve.MultiWorkerRefused):
        demo_serve.ensure_single_worker(2)
    with pytest.raises(demo_serve.MultiWorkerRefused):
        demo_serve.ensure_single_worker(0)


def test_launcher_configures_single_worker() -> None:
    import demo_serve

    config = demo_serve.build_server_config(host="127.0.0.1", port=8001)
    assert config.workers == 1


def test_launcher_subprocess_refuses_two_workers() -> None:
    env = dict(os.environ)
    env["PYTHONPATH"] = API_ROOT + os.pathsep + env.get("PYTHONPATH", "")
    result = subprocess.run(
        [
            sys.executable,
            os.path.join(API_ROOT, "demo_serve.py"),
            "--workers",
            "2",
            "--check-config",
        ],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode != 0
    assert "single worker" in (result.stderr + result.stdout).lower()


def test_launcher_subprocess_reports_single_worker_config() -> None:
    env = dict(os.environ)
    env["PYTHONPATH"] = API_ROOT + os.pathsep + env.get("PYTHONPATH", "")
    result = subprocess.run(
        [sys.executable, os.path.join(API_ROOT, "demo_serve.py"), "--check-config"],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout.strip().splitlines()[-1])
    assert payload["workers"] == 1
