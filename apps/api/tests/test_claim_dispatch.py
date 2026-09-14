"""Regression tests for routers.claims._dispatch background-task wiring.

`_dispatch` must register the *real* triage/notification callables. A previous
version referenced unimported names, which would raise NameError the moment a
task was dispatched at runtime.
"""
from __future__ import annotations

import uuid

from fastapi import BackgroundTasks

from routers import claims
from services import triage_service


def _dispatched_func(task: tuple) -> object:
    background_tasks = BackgroundTasks()
    claims._dispatch(background_tasks, task)
    assert len(background_tasks.tasks) == 1
    return background_tasks.tasks[0].func


def test_dispatch_registers_real_notify_insurer():
    claim_id = uuid.uuid4()
    assert _dispatched_func(("notify_insurer", claim_id)) is triage_service.notify_insurer


def test_dispatch_registers_real_notify_customer():
    claim_id = uuid.uuid4()
    assert (
        _dispatched_func(("notify_customer", claim_id, "updated"))
        is triage_service.notify_customer
    )


def test_dispatch_registers_real_run_ai_triage():
    claim_id = uuid.uuid4()
    assert _dispatched_func(("run_ai_triage", claim_id)) is triage_service.run_ai_triage


def test_dispatch_registers_real_run_image_ai_analysis():
    image_id = uuid.uuid4()
    assert (
        _dispatched_func(("run_image_ai_analysis", image_id))
        is triage_service.run_image_ai_analysis
    )


def test_dispatch_noop_for_none():
    background_tasks = BackgroundTasks()
    claims._dispatch(background_tasks, None)
    assert background_tasks.tasks == []
