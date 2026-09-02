"""
ClaimService – deep module orchestrating the entire claim lifecycle.

Router adapters call these methods and return the result; all business logic,
policy checks, state-transition validation, audit logging, and background
task dispatch live here.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

import models
from models.claims import (
       Claim,
       ClaimStatus,
       ClaimType,
)
from models.claim_images import ClaimImage
from schemas.claim import ClaimDetailResponse
from services.triage_service import run_ai_triage, run_image_ai_analysis
from services.auth_service import decode_token

logger = logging.getLogger("uvicorn.error")

# ── State-transition rules ────────────────────────────────────────────────

_VALID_TRANSITIONS: dict[ClaimStatus, list[ClaimStatus]] = {
    ClaimStatus.draft: [ClaimStatus.submitted],
    ClaimStatus.submitted: [ClaimStatus.under_review],
    ClaimStatus.under_review: [
        ClaimStatus.approved,
        ClaimStatus.rejected,
        ClaimStatus.surveyor_assigned,
    ],
    ClaimStatus.surveyor_assigned: [
        ClaimStatus.approved,
        ClaimStatus.rejected,
    ],
    ClaimStatus.disputed: [ClaimStatus.under_review],
}


def _can_transition(from_: ClaimStatus, to: ClaimStatus) -> bool:
    return to in _VALID_TRANSITIONS.get(from_, [])


# ── Service ──────────────────────────────────────────────────────────────


class ClaimService:
    """One interface, all claim workflow logic."""

    def __init__(
        self,
        db: AsyncSession,
        user: models.User,
        storage: Any = None,
        request: Any = None,
    ) -> None:
        self.db = db
        self.user = user
        self.storage = storage
        self.request = request

    # ── Lifecycle ─────────────────────────────────────────────────────────

    async def create(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Create a new claim in draft status.

        Validates: policy exists, policy active, policy owned by user,
        incident_date within policy period.
        Generates claim_number via the model default (set on flush).
        """
        policy_id: UUID = data["policy_id"]

        # 1. Fetch policy
        policy: models.Policy | None = await self.db.get(models.Policy, policy_id)
        if not policy:
            raise models.NotFoundException("Policy not found.")  # type: ignore[attr-defined]

        # 2. Ownership check
        if policy.user_id != self.user.id:
            raise models.ForbiddenException(  # type: ignore[attr-defined]
                "You do not have permission to file a claim for this policy."
            )

        # 3. Policy must be active
        if policy.status != models.PolicyStatus.active:
            raise models.CoverAIException(  # type: ignore[attr-defined]
                "Cannot file a claim on an inactive or expired policy.",
                status_code=400,
                error_code="INACTIVE_POLICY",
            )

        # 4. Incident date within policy period (date-only comparison)
        incident_date: datetime = data["incident_date"]
        inc_d = incident_date.date() if hasattr(incident_date, "date") else incident_date
        p_start = policy.start_date.date() if hasattr(policy.start_date, "date") else policy.start_date
        p_end = policy.end_date.date() if hasattr(policy.end_date, "date") else policy.end_date

        if not (p_start <= inc_d <= p_end):
            raise models.CoverAIException(  # type: ignore[attr-defined]
                f"The incident date ({inc_d}) falls outside the policy coverage period "
                f"({p_start} to {p_end}).",
                status_code=400,
                error_code="OUT_OF_PERIOD",
            )

        # 5. Strip tzinfo – DB column is TIMESTAMP WITHOUT TIME ZONE
        naive_date = incident_date.replace(tzinfo=None)

        # 6. Persist claim (claim_number set by model default on flush)
        claim = models.Claim(
            policy_id=policy_id,
            claimant_id=self.user.id,
            incident_date=naive_date,
            incident_location=data["incident_location"],
            incident_description=data["incident_description"],
            claim_type=data["claim_type"],
            status=models.ClaimStatus.draft,
            estimated_amount=data.get("estimated_amount") or 0.0,
        )
        self.db.add(claim)
        await self.db.flush()  # populates claim.id and claim_number

        # 7. Audit
        await self._log_action(
            action="CLAIM_CREATE",
            resource_type="claim",
            resource_id=claim.id,
            after_state={
                "claim_number": claim.claim_number,
                "policy_id": str(policy.id),
                "claim_type": claim.claim_type.value,
                "status": "draft",
            },
        )

        return {
            "claim_id": claim.id,
            "claim_number": claim.claim_number,
            "status": claim.status,
        }

    async def submit(self, claim_id: UUID) -> dict[str, Any]:
        """Submit a draft claim. Requires at least one uploaded image."""
        claim = await self._get_claim_or_404(claim_id)

        if claim.claimant_id != self.user.id:
            raise models.ForbiddenException(  # type: ignore[attr-defined]
                "You do not have permission to submit this claim."
            )
        if claim.status != models.ClaimStatus.draft:
            raise models.CoverAIException(  # type: ignore[attr-defined]
                "Only draft claims can be submitted.",
                status_code=400,
                error_code="INVALID_STATE",
            )

        images_stmt = select(models.ClaimImage).where(models.ClaimImage.claim_id == claim_id)
        images = (await self.db.execute(images_stmt)).scalars().all()
        if not images:
            raise models.CoverAIException(  # type: ignore[attr-defined]
                "You must upload at least one image before submitting this claim.",
                status_code=400,
                error_code="NO_IMAGES",
            )

        before_state = {"status": claim.status.value}
        claim.status = models.ClaimStatus.submitted
        await self.db.flush()

        await self._log_action(
            action="CLAIM_SUBMIT",
            resource_type="claim",
            resource_id=claim.id,
            before_state=before_state,
            after_state={"status": "submitted"},
        )

        # Background task dispatch (caller adds to BackgroundTasks)
        return {
            "claim_id": claim.id,
            "status": claim.status,
            "message": "Claim submitted successfully for review.",
            "_background_task": ("notify_insurer", claim.id),
        }

    async def transition(
        self,
        claim_id: UUID,
        target_status: ClaimStatus,
        remarks: str = "",
        approved_amount: float | None = None,
    ) -> Claim:
        """
        Adjudicate a claim to a new status.

        Enforces valid transitions; captures before/after state for audit.
        """
        claim = await self._get_claim_or_404(claim_id)
        current_status = claim.status

        if not _can_transition(current_status, target_status):
            raise models.CoverAIException(  # type: ignore[attr-defined]
                f"Invalid transition from {current_status.value} to {target_status.value}.",
                status_code=400,
                error_code="INVALID_TRANSITION",
            )

        before_state: dict[str, Any] = {
            "status": current_status.value,
            "approved_amount": (
                float(claim.approved_amount) if claim.approved_amount is not None else None
            ),
        }

        # Approved requires an amount
        if target_status == ClaimStatus.approved:
            if approved_amount is None:
                raise models.CoverAIException(  # type: ignore[attr-defined]
                    "An approved amount must be specified when approving a claim.",
                    status_code=400,
                    error_code="MISSING_APPROVED_AMOUNT",
                )
            claim.approved_amount = approved_amount

        claim.status = target_status
        await self.db.flush()

        after_state: dict[str, Any] = {
            "status": target_status.value,
            "approved_amount": (
                float(claim.approved_amount) if claim.approved_amount is not None else None
            ),
            "remarks": remarks,
        }

        await self._log_action(
            action="CLAIM_STATUS_CHANGE",
            resource_type="claim",
            resource_id=claim.id,
            before_state=before_state,
            after_state=after_state,
        )

        # Background task dispatch
        return claim, {
            "_background_task": (
                "notify_customer",
                claim.id,
                f"Your claim status was updated to {target_status.value}. "
                f"Officer Remarks: '{remarks}'",
            ),
        }

    # ── Adjudication helpers ───────────────────────────────────────────────

    async def assign_self(self, claim_id: UUID) -> Claim:
        """Self-assign a non-draft claim; auto-transitions submitted → under_review."""
        claim = await self._get_claim_or_404(claim_id)
        if claim.status == ClaimStatus.draft:
            raise models.CoverAIException(  # type: ignore[attr-defined]
                "Cannot assign a draft claim. Claim must be submitted first.",
                status_code=400,
                error_code="INVALID_STATE",
            )

        before_state: dict[str, Any] = {
            "assigned_officer_id": str(claim.assigned_officer_id) if claim.assigned_officer_id else None,
            "status": claim.status.value,
        }

        claim.assigned_officer_id = self.user.id
        if claim.status == ClaimStatus.submitted:
            await self.transition(
                claim.id,
                ClaimStatus.under_review,
                remarks=f"Self-assigned by {self.user.id}",
            )

        await self.db.flush()

        await self._log_action(
            action="CLAIM_SELF_ASSIGN",
            resource_type="claim",
            resource_id=claim.id,
            before_state=before_state,
            after_state={
                "assigned_officer_id": str(self.user.id),
                "status": claim.status.value,
            },
        )

        return claim

    # ── Read side ──────────────────────────────────────────────────────────

    async def get(self, claim_id: UUID) -> ClaimDetailResponse:
        """Full claim detail: images (signed URLs), history, policy summary."""
        claim = await self._get_claim_or_404(claim_id)
        storage = self.storage or self._get_storage()

        # Images
        images_stmt = select(models.ClaimImage).where(models.ClaimImage.claim_id == claim.id)
        images = (await self.db.execute(images_stmt)).scalars().all()

        images_out: list[dict[str, Any]] = []
        for img in images:
            images_out.append({
                "id": img.id,
                "storage_path": img.storage_path,
                "signed_url": storage.get_url(img.storage_path),
                "ai_damage_tags": img.ai_damage_tags,
                "ai_damage_confidence": img.ai_damage_confidence,
                "is_verified": img.is_verified,
                "created_at": img.created_at,
            })

        # History
        history_stmt = (
            select(models.AuditLog)
            .where(
                models.AuditLog.resource_type == "claim",
                models.AuditLog.resource_id == claim.id,
            )
            .order_by(models.AuditLog.created_at.asc())
        )
        history = (await self.db.execute(history_stmt)).scalars().all()

        history_out: list[dict[str, Any]] = []
        for log in history:
            history_out.append({
                "id": log.id,
                "actor_id": log.actor_id,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "before_state": log.before_state,
                "after_state": log.after_state,
                "ip_address": log.ip_address,
                "created_at": log.created_at,
            })

        # Policy summary
        policy_out = None
        if claim.policy_id:
            policy: models.Policy | None = await self.db.get(models.Policy, claim.policy_id)
            if policy:
                policy_out = {
                    "id": policy.id,
                    "policy_number": policy.policy_number,
                    "insurer_name": policy.insurer_name,
                    "vehicle_registration": policy.vehicle_registration,
                    "vehicle_make": policy.vehicle_make,
                    "vehicle_model": policy.vehicle_model,
                    "vehicle_year": policy.vehicle_year,
                    "policy_type": policy.policy_type.value if hasattr(policy.policy_type, "value") else str(policy.policy_type),
                    "start_date": policy.start_date,
                    "end_date": policy.end_date,
                    "premium_amount": float(policy.premium_amount),
                    "sum_insured": float(policy.sum_insured),
                    "status": policy.status.value if hasattr(policy.status, "value") else str(policy.status),
                    "extracted_text": policy.extracted_text,
                }

        return ClaimDetailResponse.model_construct(**{
            **vars(claim),
            "images": images_out,
            "status_history": history_out,
            "policy": policy_out,
        })

    async def list(
        self,
        *,
        status: ClaimStatus | None = None,
        claim_type: ClaimType | None = None,
        risk_level: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> list[Claim]:
        """
        Paginated, role-scoped claim list.

        Visibility rules:
        - admin:  all claims
        - insurer_officer: claims assigned to them (and insurer queue specifics)
        - advisor: claims of their assigned customers
        - customer: their own claims
        """
        from services.visibility_filter import VisibilityFilter  # local to avoid circular

        query = await VisibilityFilter.apply(self.db, self.user, select(Claim))

        filters: list[Any] = []

        # Status filter (admin/advisors get this; insurer queue skips draft)
        if status:
            filters.append(Claim.status == status)
        elif self.user.role == models.UserRole.insurer_officer:
            filters.append(Claim.status != ClaimStatus.draft)

        if claim_type:
            filters.append(Claim.claim_type == claim_type)

        if risk_level == "low":
            filters.append(Claim.ai_risk_score < 0.4)
        elif risk_level == "medium":
            filters.append(and_(Claim.ai_risk_score >= 0.4, Claim.ai_risk_score < 0.7))
        elif risk_level == "high":
            filters.append(Claim.ai_risk_score >= 0.7)

        if date_from:
            filters.append(Claim.created_at >= datetime.combine(date_from, datetime.min.time()))
        if date_to:
            filters.append(Claim.created_at <= datetime.combine(date_to, datetime.max.time()))

        if filters:
            query = query.where(*filters)

        page = max(page, 1)
        limit = max(1, min(limit, 100))
        offset = (page - 1) * limit

        result = await self.db.execute(
            query.order_by(Claim.created_at.desc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    # ── Images ─────────────────────────────────────────────────────────────

    async def upload_images(
        self,
        claim_id: UUID,
        files: list[Any],
    ) -> list[dict[str, Any]]:
        """
        Validate, store, and record up to 5 images for a claim.

        Each file validates: type (jpeg/png/webp), size (≤10 MB), magic bytes.
        """
        claim = await self._get_claim_or_404(claim_id)

        if claim.claimant_id != self.user.id:
            raise models.ForbiddenException(  # type: ignore[attr-defined]
                "You do not have permission to modify this claim."
            )
        if claim.status not in (ClaimStatus.draft, ClaimStatus.submitted):
            raise models.CoverAIException(  # type: ignore[attr-defined]
                "Images can only be uploaded to draft or submitted claims.",
                status_code=400,
                error_code="INVALID_STATE",
            )

        if len(files) > 5:
            raise models.CoverAIException(  # type: ignore[attr-defined]
                "A maximum of 5 images can be uploaded per request.",
                status_code=400,
                error_code="TOO_MANY_FILES",
            )

        allowed_types = {"image/jpeg", "image/png", "image/webp"}
        max_size = 10 * 1024 * 1024  # 10 MB
        storage = self.storage or self._get_storage()
        ext_map = {".jpg": "jpg", ".jpeg": "jpg", ".png": "png", ".webp": "webp"}
        magic_bytes: dict[str, bytes] = {
            ".jpg": b"\xff\xd8\xff",
            ".png": b"\x89PNG\r\n\x1a\n",
            ".webp": b"RIFF",
        }

        results: list[dict[str, Any]] = []
        for f in files:
            content_type = f.content_type or ""
            filename_lower = (f.filename or "").lower()

            # Type check
            ext = next(
                (ext_map[s] for s in ext_map if filename_lower.endswith(s)),
                None,
            )
            if not ext:
                raise models.CoverAIException(  # type: ignore[attr-defined]
                    f"Unsupported file format: {f.filename}. Only JPEG, PNG, and WebP are allowed.",
                    status_code=400,
                    error_code="INVALID_FILE_TYPE",
                )

            # Read & validate size
            file_bytes = await f.read()
            if len(file_bytes) > max_size:
                raise models.CoverAIException(  # type: ignore[attr-defined]
                    f"File size for {f.filename} exceeds the 10MB limit.",
                    status_code=400,
                    error_code="FILE_TOO_LARGE",
                )

            # Magic bytes
            expected = magic_bytes.get(f".{ext}", b"")
            if expected == b"RIFF":
                if not (file_bytes.startswith(b"RIFF") and file_bytes[8:12] == b"WEBP"):
                    raise models.CoverAIException(  # type: ignore[attr-defined]
                        f"Spoofed file detected: {f.filename} is not a valid WebP image.",
                        status_code=400,
                        error_code="INVALID_FILE_TYPE",
                    )
            elif expected and not file_bytes.startswith(expected):
                raise models.CoverAIException(  # type: ignore[attr-defined]
                    f"Spoofed file detected: {f.filename} is not a valid {ext.upper()} image.",
                    status_code=400,
                    error_code="INVALID_FILE_TYPE",
                )

            # Store
            image_id = UUID(int=0)  # placeholder; real id assigned below
            storage_path = f"claims/{claim.id}/images/{image_id}.{ext}"
            # We need the id first – generate it now
            import uuid as _uuid
            image_id = _uuid.uuid4()
            storage_path = f"claims/{claim.id}/images/{image_id}.{ext}"

            storage.upload(file_bytes, storage_path)

            db_image = models.ClaimImage(
                id=image_id,
                claim_id=claim.id,
                uploaded_by=self.user.id,
                storage_path=storage_path,
                original_filename=f.filename,
                mime_type=content_type or f"image/{ext}",
                file_size_bytes=len(file_bytes),
            )
            self.db.add(db_image)
            await self.db.flush()

            results.append({
                "image_id": db_image.id,
                "storage_path": db_image.storage_path,
                "message": "Image uploaded successfully.",
                "_background_task": ("run_image_ai_analysis", db_image.id),
            })

        await self.db.commit()
        return results

    async def list_images(self, claim_id: UUID) -> list[dict[str, Any]]:
        """Return images for a claim with signed URLs."""
        claim = await self._get_claim_or_404(claim_id)
        storage = self.storage or self._get_storage()

        stmt = select(models.ClaimImage).where(models.ClaimImage.claim_id == claim.id)
        images = (await self.db.execute(stmt)).scalars().all()

        return [
            {
                "id": img.id,
                "storage_path": img.storage_path,
                "signed_url": storage.get_url(img.storage_path),
                "ai_damage_tags": img.ai_damage_tags,
                "ai_damage_confidence": img.ai_damage_confidence,
                "is_verified": img.is_verified,
                "created_at": img.created_at,
            }
            for img in images
        ]

    # ── Private helpers ────────────────────────────────────────────────────

    def _get_storage(self) -> Any:
        from core.storage import get_storage_backend
        return get_storage_backend()

    async def _get_claim_or_404(self, claim_id: UUID) -> Claim:
        claim: Claim | None = await self.db.get(models.Claim, claim_id)
        if not claim:
            raise models.NotFoundException("Claim not found.")
        return claim

    async def _log_action(
        self,
        action: str,
        resource_type: str,
        resource_id: UUID,
        before_state: dict[str, Any] | None = None,
        after_state: dict[str, Any] | None = None,
    ) -> None:
        """Write an audit log entry. Absorbs request-scope details."""
        from core.audit import log_action as _log_action
        kwargs: dict[str, Any] = {
            "db": self.db,
            "actor_id": self.user.id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "after_state": after_state,
            "request": self.request,
        }
        if before_state is not None:
            kwargs["before_state"] = before_state
        await _log_action(**kwargs)
