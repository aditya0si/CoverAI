"""Regression tests for services.qa_service policy Q&A guards.

ask_policy_question previously referenced NotFoundException without importing
it, so an unknown policy produced a NameError instead of a clean 404.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from core.exceptions import NotFoundException
from services import qa_service


async def test_ask_policy_question_raises_not_found_for_unknown_policy():
    db = MagicMock()
    db.get = AsyncMock(return_value=None)

    with pytest.raises(NotFoundException):
        async for _ in qa_service.ask_policy_question(
            policy_id=uuid.uuid4(),
            question="Is flood damage covered?",
            user_id=uuid.uuid4(),
            conversation_id=None,
            db=db,
        ):
            pass
