"""Background task dispatcher.

ClaimService methods return lightweight ``("task_name", *args)`` tuples instead of
importing FastAPI primitives. Routers pass those tuples to :func:`dispatch`, which
maps them onto the real background functions from ``services.triage_service``.
"""
from __future__ import annotations

from typing import Any

from fastapi import BackgroundTasks


def dispatch(background_tasks: BackgroundTasks, task: tuple[str, Any] | None) -> None:
    """Register a ``(name, *args)`` task tuple on FastAPI's BackgroundTasks."""
    if not task:
        return
    from services.triage_service import (
        notify_insurer,
        notify_customer,
        run_ai_triage,
        run_image_ai_analysis,
    )

    name, *args = task
    if name == "notify_insurer":
        background_tasks.add_task(notify_insurer, *args)
    elif name == "notify_customer":
        background_tasks.add_task(notify_customer, *args)
    elif name == "run_ai_triage":
        background_tasks.add_task(run_ai_triage, *args)
    elif name == "run_image_ai_analysis":
        background_tasks.add_task(run_image_ai_analysis, *args)