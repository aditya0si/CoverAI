from typing import Any
from fastapi import APIRouter, BackgroundTasks

from services.triage_service import (
    notify_customer,
    notify_insurer,
    run_ai_triage,
    run_image_ai_analysis,
)

claims_router = APIRouter(prefix="/claims", tags=["Claims"])


# ── Helpers ───────────────────────────────────────────────────────────────

def _dispatch(background_tasks: BackgroundTasks, task: tuple[str, Any] | None) -> None:
    if not task:
        return
    name, *args = task
    if name == "notify_insurer":
        background_tasks.add_task(notify_insurer, *args)
    elif name == "notify_customer":
        background_tasks.add_task(notify_customer, *args)
    elif name == "run_ai_triage":
        background_tasks.add_task(run_ai_triage, *args)
    elif name == "run_image_ai_analysis":
        background_tasks.add_task(run_image_ai_analysis, *args)

