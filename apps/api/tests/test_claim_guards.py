"""Behavioral guard tests for ClaimService (create/submit/transition/assign_self/upload_images).

The existing test_claims_service.py covers structure and read paths with heavy
mocking; these tests exercise the real validation rules that protect the claim
lifecycle: ownership, policy activity, coverage dates, image requirements, and
file-type/size/magic-byte enforcement.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

import models
from core.exceptions import CoverAIException, ForbiddenException, NotFoundException
from services.claim_service import ClaimService, ClaimStatus, ClaimType

_NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)
_JPG_BYTES = b"\xff\xd8\xff\xe0" + b"filler"


def _user():
    u = SimpleNamespace(id=uuid.uuid4(), role=models.UserRole.customer)
    return u


def _policy(owner_id, *, status=None, start=None, end=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=owner_id,
        status=status or models.PolicyStatus.active,
        start_date=start or datetime(2025, 1, 1, tzinfo=timezone.utc),
        end_date=end or datetime(2026, 12, 31, tzinfo=timezone.utc),
    )


def _claim(claimant_id, *, status=ClaimStatus.draft, approved_amount=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        claimant_id=claimant_id,
        status=status,
        approved_amount=approved_amount,
        assigned_officer_id=None,
    )


def _file(filename="photo.jpg", content_type="image/jpeg", data=_JPG_BYTES):
    f = MagicMock()
    f.filename = filename
    f.content_type = content_type
    f.read = AsyncMock(return_value=data)
    return f


class FakeDB:
    """Minimal AsyncSession stand-in for ClaimService unit tests.

    db.get/db.execute resolve to configurable AsyncMocks; db.add records
    added objects and db.flush backfills the id/claim_number/status fields
    that the real database would populate on INSERT.
    """

    def __init__(self):
        self.get = AsyncMock(return_value=None)
        # return_value is an explicit sync MagicMock so that chained sync calls
        # like .scalars().all() do not become async child mocks.
        self.execute = AsyncMock(return_value=MagicMock())
        self.commit = AsyncMock()
        self.rollback = AsyncMock()
        self.added = []
        self.add = MagicMock(side_effect=self.added.append)
        self.flush = AsyncMock(side_effect=self._populate)

    async def _populate(self):
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            if isinstance(obj, models.Claim):
                if getattr(obj, "claim_number", None) is None:
                    obj.claim_number = "CLM-87654321"
                if getattr(obj, "status", None) is None:
                    obj.status = models.ClaimStatus.draft


def _audit_entries(db) -> list[models.AuditLog]:
    return [a for a in db.added if isinstance(a, models.AuditLog)]


# ── create ────────────────────────────────────────────────────────────────


def _create_data(policy_id, **overrides):
    data = {
        "policy_id": policy_id,
        "incident_date": _NOW,
        "incident_location": "Indiranagar, Bangalore",
        "incident_description": "Bumper damage in a parking lot collision.",
        "claim_type": ClaimType.own_damage,
        "estimated_amount": 5000.0,
    }
    data.update(overrides)
    return data


async def test_create_raises_not_found_for_missing_policy():
    db = FakeDB()
    svc = ClaimService(db=db, user=_user())
    with pytest.raises(NotFoundException):
        await svc.create(_create_data(uuid.uuid4()))


async def test_create_rejects_policy_not_owned_by_user():
    policy = _policy(uuid.uuid4())
    db = FakeDB()
    db.get.return_value = policy
    svc = ClaimService(db=db, user=_user())
    with pytest.raises(ForbiddenException):
        await svc.create(_create_data(policy.id))


async def test_create_rejects_inactive_policy():
    user = _user()
    policy = _policy(user.id, status=models.PolicyStatus.cancelled)
    db = FakeDB()
    db.get.return_value = policy
    svc = ClaimService(db=db, user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.create(_create_data(policy.id))
    assert exc_info.value.status_code == 400
    assert exc_info.value.error_code == "INACTIVE_POLICY"


async def test_create_rejects_incident_outside_coverage_period():
    user = _user()
    policy = _policy(user.id)
    db = FakeDB()
    db.get.return_value = policy
    svc = ClaimService(db=db, user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.create(_create_data(policy.id, incident_date=datetime(2027, 5, 1, tzinfo=timezone.utc)))
    assert exc_info.value.status_code == 400
    assert exc_info.value.error_code == "OUT_OF_PERIOD"


async def test_create_persists_draft_claim_and_audits():
    user = _user()
    policy = _policy(user.id)
    db = FakeDB()
    db.get.return_value = policy
    svc = ClaimService(db=db, user=user)

    result = await svc.create(_create_data(policy.id))

    assert result["status"] == models.ClaimStatus.draft
    assert result["claim_number"] == "CLM-87654321"

    claim = db.added[0]
    assert isinstance(claim, models.Claim)
    assert claim.claimant_id == user.id
    assert claim.policy_id == policy.id

    audits = _audit_entries(db)
    assert len(audits) == 1
    assert audits[0].action == "CLAIM_CREATE"
    assert audits[0].after_state["status"] == "draft"


# ── submit ────────────────────────────────────────────────────────────────


def _db_with_claim(claim):
    db = FakeDB()
    db.get.return_value = claim
    return db


async def test_submit_rejects_non_owner():
    claim = _claim(uuid.uuid4())
    db = _db_with_claim(claim)
    svc = ClaimService(db=db, user=_user())
    with pytest.raises(ForbiddenException):
        await svc.submit(claim.id)


async def test_submit_rejects_non_draft():
    user = _user()
    claim = _claim(user.id, status=ClaimStatus.submitted)
    svc = ClaimService(db=_db_with_claim(claim), user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.submit(claim.id)
    assert exc_info.value.error_code == "INVALID_STATE"


async def test_submit_requires_at_least_one_image():
    user = _user()
    claim = _claim(user.id)
    db = _db_with_claim(claim)
    db.execute.return_value.scalars.return_value.all.return_value = []
    svc = ClaimService(db=db, user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.submit(claim.id)
    assert exc_info.value.error_code == "NO_IMAGES"


async def test_submit_success_transitions_and_audits():
    user = _user()
    claim = _claim(user.id)
    db = _db_with_claim(claim)
    db.execute.return_value.scalars.return_value.all.return_value = [MagicMock()]
    svc = ClaimService(db=db, user=user)

    result = await svc.submit(claim.id)

    assert result["status"] == ClaimStatus.submitted
    assert result["_background_task"] == ("notify_insurer", claim.id)
    assert claim.status == ClaimStatus.submitted
    audits = [a for a in _audit_entries(db) if a.action == "CLAIM_SUBMIT"]
    assert len(audits) == 1
    assert audits[0].before_state == {"status": "draft"}
    assert audits[0].after_state == {"status": "submitted"}


# ── transition ────────────────────────────────────────────────────────────


async def test_transition_rejects_invalid_status_jump():
    user = _user()
    claim = _claim(user.id, status=ClaimStatus.submitted)
    svc = ClaimService(db=_db_with_claim(claim), user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.transition(claim.id, ClaimStatus.approved)
    assert exc_info.value.status_code == 400
    assert exc_info.value.error_code == "INVALID_TRANSITION"


async def test_transition_approve_requires_amount():
    user = _user()
    claim = _claim(user.id, status=ClaimStatus.under_review)
    svc = ClaimService(db=_db_with_claim(claim), user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.transition(claim.id, ClaimStatus.approved, remarks="Approved")
    assert exc_info.value.error_code == "MISSING_APPROVED_AMOUNT"


async def test_transition_approve_sets_amount_and_schedules_notification():
    user = _user()
    claim = _claim(user.id, status=ClaimStatus.under_review)
    db = _db_with_claim(claim)
    svc = ClaimService(db=db, user=user)

    claim_out, task = await svc.transition(
        claim.id, ClaimStatus.approved, remarks="Amount settled", approved_amount=15000.5
    )

    assert claim_out.status == ClaimStatus.approved
    assert claim_out.approved_amount == 15000.5
    assert task["_background_task"][0] == "notify_customer"

    audits = [a for a in _audit_entries(db) if a.action == "CLAIM_STATUS_CHANGE"]
    assert len(audits) == 1
    assert audits[0].before_state["status"] == "under_review"
    assert audits[0].after_state["status"] == "approved"
    assert audits[0].after_state["approved_amount"] == 15000.5


async def test_transition_allows_disputed_to_under_review():
    user = _user()
    claim = _claim(user.id, status=ClaimStatus.disputed)
    svc = ClaimService(db=_db_with_claim(claim), user=user)
    claim_out, _ = await svc.transition(claim.id, ClaimStatus.under_review, remarks="Reopened")
    assert claim_out.status == ClaimStatus.under_review


# ── assign_self ───────────────────────────────────────────────────────────


async def test_assign_self_rejects_draft():
    user = _user()
    claim = _claim(user.id, status=ClaimStatus.draft)
    svc = ClaimService(db=_db_with_claim(claim), user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.assign_self(claim.id)
    assert exc_info.value.error_code == "INVALID_STATE"


async def test_assign_self_on_submitted_transitions_to_under_review():
    user = _user()
    claim = _claim(user.id, status=ClaimStatus.submitted)
    svc = ClaimService(db=_db_with_claim(claim), user=user)

    result = await svc.assign_self(claim.id)

    assert result is claim
    assert claim.assigned_officer_id == user.id
    assert claim.status == ClaimStatus.under_review


async def test_assign_self_on_under_review_keeps_status():
    user = _user()
    claim = _claim(user.id, status=ClaimStatus.under_review)
    svc = ClaimService(db=_db_with_claim(claim), user=user)

    await svc.assign_self(claim.id)

    assert claim.assigned_officer_id == user.id
    assert claim.status == ClaimStatus.under_review


# ── upload_images ─────────────────────────────────────────────────────────


async def test_upload_images_rejects_non_owner():
    claim = _claim(uuid.uuid4())
    svc = ClaimService(db=_db_with_claim(claim), user=_user())
    with pytest.raises(ForbiddenException):
        await svc.upload_images(claim.id, [_file()])


async def test_upload_images_rejects_closed_claim():
    user = _user()
    claim = _claim(user.id, status=ClaimStatus.approved)
    svc = ClaimService(db=_db_with_claim(claim), user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.upload_images(claim.id, [_file()])
    assert exc_info.value.error_code == "INVALID_STATE"


async def test_upload_images_rejects_more_than_five_files():
    user = _user()
    claim = _claim(user.id)
    svc = ClaimService(db=_db_with_claim(claim), user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.upload_images(claim.id, [_file() for _ in range(6)])
    assert exc_info.value.error_code == "TOO_MANY_FILES"


async def test_upload_images_rejects_unsupported_extension():
    user = _user()
    claim = _claim(user.id)
    svc = ClaimService(db=_db_with_claim(claim), user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.upload_images(claim.id, [_file(filename="claim.exe", content_type="application/octet-stream")])
    assert exc_info.value.error_code == "INVALID_FILE_TYPE"


async def test_upload_images_rejects_oversized_file():
    user = _user()
    claim = _claim(user.id)
    svc = ClaimService(db=_db_with_claim(claim), user=user)
    oversized = b"\xff\xd8\xff" + b"\x00" * (10 * 1024 * 1024)  # >10 MB
    with pytest.raises(CoverAIException) as exc_info:
        await svc.upload_images(claim.id, [_file(data=oversized)])
    assert exc_info.value.error_code == "FILE_TOO_LARGE"


async def test_upload_images_rejects_spoofed_png():
    user = _user()
    claim = _claim(user.id)
    svc = ClaimService(db=_db_with_claim(claim), user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.upload_images(
            claim.id,
            [_file(filename="fake.png", content_type="image/png", data=b"not a real png")],
        )
    assert exc_info.value.error_code == "INVALID_FILE_TYPE"
    assert "Spoofed" in exc_info.value.detail


async def test_upload_images_rejects_spoofed_webp():
    user = _user()
    claim = _claim(user.id)
    svc = ClaimService(db=_db_with_claim(claim), user=user)
    with pytest.raises(CoverAIException) as exc_info:
        await svc.upload_images(
            claim.id,
            [_file(filename="fake.webp", content_type="image/webp", data=b"RIFF\x00\x00\x00\x00AVI ")],
        )
    assert exc_info.value.error_code == "INVALID_FILE_TYPE"


async def test_upload_images_success_stores_and_schedules_vision_analysis():
    user = _user()
    claim = _claim(user.id, status=ClaimStatus.draft)
    db = _db_with_claim(claim)
    storage = MagicMock()
    svc = ClaimService(db=db, user=user, storage=storage)

    results = await svc.upload_images(claim.id, [_file(data=_JPG_BYTES)])

    assert len(results) == 1
    assert results[0]["message"] == "Image uploaded successfully."
    assert results[0]["_background_task"] == ("run_image_ai_analysis", results[0]["image_id"])
    storage.upload.assert_called_once()

    image = db.added[0]
    assert isinstance(image, models.ClaimImage)
    assert image.claim_id == claim.id
    assert image.uploaded_by == user.id
    assert image.mime_type == "image/jpeg"
    assert image.file_size_bytes == len(_JPG_BYTES)
    assert db.commit.await_count == 1
