import uuid
from datetime import date
from typing import Any
from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, require_role, require_claim_access
from core.storage import get_storage_backend
from core.exceptions import CoverAIException, NotFoundException, ForbiddenException
from services.claim_service import ClaimService
import models
import schemas

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

