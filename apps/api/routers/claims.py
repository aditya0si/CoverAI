import uuid
import random
import string
import logging
from datetime import datetime, date
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from core.database import get_db
from core.security import get_current_user, require_role, require_claim_access
from core.storage import get_storage_backend
from core.audit import log_action
from core.exceptions import CoverAIException, NotFoundException, ForbiddenException
from services.triage_service import run_ai_triage, run_image_ai_analysis, notify_insurer, notify_customer
import models
import schemas

logger = logging.getLogger("uvicorn.error")

claims_router = APIRouter(prefix="/claims", tags=["Claims"])


def generate_claim_number() -> str:
    """
    Generate unique claim number (format: CLM-YYYYMM-XXXXXX random uppercase/digits alphanum)
    """
    current_ym = datetime.utcnow().strftime("%Y%m")
    random_part = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"CLM-{current_ym}-{random_part}"


@claims_router.post("", response_model=schemas.ClaimCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_claim(
    request: Request,
    claim_in: schemas.ClaimCreate,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(require_role("customer")),
    db: AsyncSession = Depends(get_db)
):
    """
    POST /
    - Role: customer
    - Validate: policy must be active and owned by user, incident_date must be within policy period
    - Auto-generate claim_number
    - Create Claim with status=draft
    - Trigger background task: run_ai_triage(claim_id)
    - Return: {claim_id, claim_number, status}
    """
    # 1. Fetch Policy
    policy = await db.get(models.Policy, claim_in.policy_id)
    if not policy:
        raise NotFoundException("Policy not found.")
        
    # 2. Check Ownership
    if policy.user_id != current_user.id:
        raise ForbiddenException("You do not have permission to file a claim for this policy.")
        
    # 3. Check Policy Status
    if policy.status != models.PolicyStatus.active:
        raise CoverAIException("Cannot file a claim on an inactive or expired policy.", status_code=400, error_code="INACTIVE_POLICY")
        
    # 4. Check Date Range
    # Compare as date objects (date-only) to avoid false rejections caused by time
    # components or UTC midnight vs local-midnight mismatches. A policy covering
    # "up to" a given date should include the full day of that end date.
    inc_date_only = claim_in.incident_date.date() if hasattr(claim_in.incident_date, 'date') else claim_in.incident_date
    p_start_only = policy.start_date.date() if hasattr(policy.start_date, 'date') else policy.start_date
    p_end_only = policy.end_date.date() if hasattr(policy.end_date, 'date') else policy.end_date
    
    if not (p_start_only <= inc_date_only <= p_end_only):
        raise CoverAIException(
            f"The incident date ({inc_date_only}) falls outside the policy coverage period "
            f"({p_start_only} to {p_end_only}).",
            status_code=400,
            error_code="OUT_OF_PERIOD"
        )
        
    # 5. Generate Claim Number
    claim_number = generate_claim_number()
    
    # 6. Create Claim
    # Strip timezone info from incident_date — the frontend sends a tz-aware ISO
    # string (e.g. "2026-05-28T00:00:00.000Z") but the DB column is TIMESTAMP
    # WITHOUT TIME ZONE.  asyncpg rejects mixing tz-aware and tz-naive values.
    naive_incident_date = claim_in.incident_date.replace(tzinfo=None)

    db_claim = models.Claim(
        policy_id=claim_in.policy_id,
        claimant_id=current_user.id,
        claim_number=claim_number,
        incident_date=naive_incident_date,
        incident_location=claim_in.incident_location,
        incident_description=claim_in.incident_description,
        claim_type=claim_in.claim_type,
        status=models.ClaimStatus.draft,
        estimated_amount=claim_in.estimated_amount,
        approved_amount=None,
        ai_risk_score=None,
        ai_summary=None
    )
    
    db.add(db_claim)
    await db.flush()
    
    # 7. Write to Audit Log
    await log_action(
        db=db,
        actor_id=current_user.id,
        action="CLAIM_CREATE",
        resource_type="claim",
        resource_id=db_claim.id,
        after_state={
            "claim_number": claim_number,
            "policy_id": str(policy.id),
            "claim_type": claim_in.claim_type.value,
            "status": "draft"
        },
        request=request
    )
    
    # 8. Dispatch Background Triage task
    background_tasks.add_task(run_ai_triage, db_claim.id)
    
    return {
        "claim_id": db_claim.id,
        "claim_number": db_claim.claim_number,
        "status": db_claim.status
    }


@claims_router.post("/{claim_id}/submit", response_model=schemas.ClaimSubmitResponse)
async def submit_claim(
    request: Request,
    claim_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(require_role("customer")),
    db: AsyncSession = Depends(get_db)
):
    """
    POST /{claim_id}/submit
    - Role: customer, claim must be in draft and owned by user
    - Validate at least 1 image uploaded
    - Set status=submitted
    - Trigger background task: notify_insurer(claim_id)
    - Return: {claim_id, status, message}
    """
    # 1. Fetch Claim
    claim = await db.get(models.Claim, claim_id)
    if not claim:
        raise NotFoundException("Claim not found.")
        
    # 2. Verify Ownership
    if claim.claimant_id != current_user.id:
        raise ForbiddenException("You do not have permission to submit this claim.")
        
    # 3. Verify Status
    if claim.status != models.ClaimStatus.draft:
        raise CoverAIException("Only draft claims can be submitted.", status_code=400, error_code="INVALID_STATE")
        
    # 4. Verify Images Uploaded
    stmt = select(models.ClaimImage).where(models.ClaimImage.claim_id == claim_id)
    images = (await db.execute(stmt)).scalars().all()
    if not images:
        raise CoverAIException("You must upload at least one image before submitting this claim.", status_code=400, error_code="NO_IMAGES")
        
    # Capture State before transition
    before_state = {"status": claim.status.value}
    
    # 5. Update Status
    claim.status = models.ClaimStatus.submitted
    await db.flush()
    
    # 6. Log Audit action
    await log_action(
        db=db,
        actor_id=current_user.id,
        action="CLAIM_SUBMIT",
        resource_type="claim",
        resource_id=claim.id,
        before_state=before_state,
        after_state={"status": "submitted"},
        request=request
    )
    
    # 7. Dispatch Background notification
    background_tasks.add_task(notify_insurer, claim.id)
    
    return {
        "claim_id": claim.id,
        "status": claim.status,
        "message": "Claim submitted successfully for review."
    }


@claims_router.get("", response_model=List[schemas.ClaimOut])
async def list_claims(
    status: Optional[models.ClaimStatus] = None,
    page: int = 1,
    limit: int = 20,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    GET /
    - Role: customer → their own claims; insurer_officer → claims assigned to them; advisor → claims of assigned customers
    - Filter: ?status=&page=&limit=
    - Return paginated list
    """
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 20
        
    offset = (page - 1) * limit
    
    # 1. Base Query
    query = select(models.Claim)
    
    # 2. Enforce Role Visibility
    if current_user.role == models.UserRole.admin:
        # Admin can view all
        pass
    elif current_user.role == models.UserRole.insurer_officer:
        # Insurer officer views claims assigned to them
        query = query.where(models.Claim.assigned_officer_id == current_user.id)
    elif current_user.role == models.UserRole.advisor:
        # Advisor views claims of active assigned customers
        stmt_assignments = select(models.AdvisorAssignment.customer_id).where(
            models.AdvisorAssignment.advisor_id == current_user.id,
            models.AdvisorAssignment.is_active == True
        )
        assigned_customer_ids = (await db.execute(stmt_assignments)).scalars().all()
        query = query.where(models.Claim.claimant_id.in_(assigned_customer_ids))
    else:
        # Customer views their own claims
        query = query.where(models.Claim.claimant_id == current_user.id)
        
    # 3. Status Filtering
    if status:
        query = query.where(models.Claim.status == status)
        
    # 4. Sorting & Pagination
    query = query.order_by(models.Claim.created_at.desc()).offset(offset).limit(limit)
    
    result = await db.execute(query)
    return result.scalars().all()


@claims_router.get("/{claim_id}/history", response_model=List[schemas.AuditLogOut])
async def get_claim_history(
    claim: models.Claim = Depends(require_claim_access),
    db: AsyncSession = Depends(get_db)
):
    """
    GET /api/v1/claims/{claim_id}/history
    Expose claims status history from audit_logs, sorted chronologically.
    """
    stmt = (
        select(models.AuditLog)
        .where(
            models.AuditLog.resource_type == "claim",
            models.AuditLog.resource_id == claim.id
        )
        .order_by(models.AuditLog.created_at.asc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@claims_router.get("/{claim_id}", response_model=schemas.ClaimDetailResponse)
async def get_claim(
    claim: models.Claim = Depends(require_claim_access),
    db: AsyncSession = Depends(get_db)
):
    """
    GET /{claim_id}
    - Role: owner, assigned officer, or advisor
    - Return full claim details including: images (as signed URLs), ai_summary, ai_risk_score, status history from audit_logs
    """
    storage = get_storage_backend()
    
    # 1. Fetch images associated with this claim
    stmt = select(models.ClaimImage).where(models.ClaimImage.claim_id == claim.id)
    images = (await db.execute(stmt)).scalars().all()
    
    images_out = []
    for img in images:
        images_out.append({
            "id": img.id,
            "storage_path": img.storage_path,
            "signed_url": storage.get_url(img.storage_path),
            "ai_damage_tags": img.ai_damage_tags,
            "ai_damage_confidence": img.ai_damage_confidence,
            "is_verified": img.is_verified,
            "created_at": img.created_at
        })
        
    # 2. Fetch history from audit_logs
    stmt_history = (
        select(models.AuditLog)
        .where(
            models.AuditLog.resource_type == "claim",
            models.AuditLog.resource_id == claim.id
        )
        .order_by(models.AuditLog.created_at.asc())
    )
    history = (await db.execute(stmt_history)).scalars().all()
    
    history_out = []
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
            "created_at": log.created_at
        })
        
    return {
        "id": claim.id,
        "claim_number": claim.claim_number,
        "policy_id": claim.policy_id,
        "claimant_id": claim.claimant_id,
        "incident_date": claim.incident_date,
        "incident_location": claim.incident_location,
        "incident_description": claim.incident_description,
        "claim_type": claim.claim_type,
        "status": claim.status,
        "assigned_officer_id": claim.assigned_officer_id,
        "ai_risk_score": claim.ai_risk_score,
        "ai_summary": claim.ai_summary,
        "estimated_amount": claim.estimated_amount,
        "approved_amount": claim.approved_amount,
        "created_at": claim.created_at,
        "updated_at": claim.updated_at,
        "images": images_out,
        "status_history": history_out
    }


@claims_router.patch("/{claim_id}/status", response_model=schemas.ClaimOut)
async def patch_claim_status(
    request: Request,
    claim_id: uuid.UUID,
    transition: schemas.ClaimStatusTransition,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(require_role("insurer_officer", "admin", "advisor")),
    db: AsyncSession = Depends(get_db)
):
    """
    PATCH /{claim_id}/status (insurer_officer only)
    - Body: {status, remarks, approved_amount (if approving)}
    - Valid transitions: submitted→under_review, under_review→approved|rejected|surveyor_assigned, surveyor_assigned→approved|rejected
    - Write to audit_logs with before/after state
    - Notify customer (stub: log notification, real notifications in Phase 6)
    """
    # 1. Fetch Claim
    claim = await db.get(models.Claim, claim_id)
    if not claim:
        raise NotFoundException("Claim not found.")
        
    # 2. Define Valid Transitions
    valid_transitions = {
        models.ClaimStatus.submitted: [models.ClaimStatus.under_review],
        models.ClaimStatus.under_review: [
            models.ClaimStatus.approved,
            models.ClaimStatus.rejected,
            models.ClaimStatus.surveyor_assigned
        ],
        models.ClaimStatus.surveyor_assigned: [
            models.ClaimStatus.approved,
            models.ClaimStatus.rejected
        ]
    }
    
    current_status = claim.status
    target_status = transition.status
    
    if current_status not in valid_transitions or target_status not in valid_transitions[current_status]:
        raise CoverAIException(
            f"Invalid transition from {current_status.value} to {target_status.value}.",
            status_code=400,
            error_code="INVALID_TRANSITION"
        )
        
    # 3. Capture State Before Modifications
    before_state = {
        "status": claim.status.value,
        "approved_amount": float(claim.approved_amount) if claim.approved_amount is not None else None
    }
    
    # 4. Perform Transition
    claim.status = target_status
    if target_status == models.ClaimStatus.approved:
        if transition.approved_amount is None:
            raise CoverAIException("An approved amount must be specified when approving a claim.", status_code=400, error_code="MISSING_APPROVED_AMOUNT")
        claim.approved_amount = transition.approved_amount
        
    await db.flush()
    
    # 5. Write Audit Log
    after_state = {
        "status": claim.status.value,
        "approved_amount": float(claim.approved_amount) if claim.approved_amount is not None else None,
        "remarks": transition.remarks
    }
    
    await log_action(
        db=db,
        actor_id=current_user.id,
        action="CLAIM_STATUS_CHANGE",
        resource_type="claim",
        resource_id=claim.id,
        before_state=before_state,
        after_state=after_state,
        request=request
    )
    
    # 6. Notify Customer
    notification_msg = f"Your claim status was updated to {claim.status.value}. Officer Remarks: '{transition.remarks}'"
    background_tasks.add_task(notify_customer, claim.id, notification_msg)
    
    return claim


@claims_router.get("/insurer/queue", response_model=List[schemas.ClaimOut])
async def insurer_claim_queue(
    claim_status: Optional[models.ClaimStatus] = Query(None, alias="status"),
    claim_type: Optional[models.ClaimType] = None,
    risk_level: Optional[str] = Query(None, description="low / medium / high"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    limit: int = 20,
    current_user: models.User = Depends(require_role("insurer_officer", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    GET /claims/insurer/queue
    Insurer-officer view: all non-draft claims, filterable. Useful for browsing
    and self-assigning claims that haven't been assigned yet.
    """
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 20
    offset = (page - 1) * limit

    filters = [models.Claim.status != models.ClaimStatus.draft]

    if claim_status:
        filters.append(models.Claim.status == claim_status)
    if claim_type:
        filters.append(models.Claim.claim_type == claim_type)
    if date_from:
        filters.append(models.Claim.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        filters.append(models.Claim.created_at <= datetime.combine(date_to, datetime.max.time()))

    # Map risk_level string to score ranges
    if risk_level == "low":
        filters.append(models.Claim.ai_risk_score < 0.4)
    elif risk_level == "medium":
        filters.append(and_(models.Claim.ai_risk_score >= 0.4, models.Claim.ai_risk_score < 0.7))
    elif risk_level == "high":
        filters.append(models.Claim.ai_risk_score >= 0.7)

    query = (
        select(models.Claim)
        .where(*filters)
        .order_by(models.Claim.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().all()


@claims_router.post("/{claim_id}/assign-self", response_model=schemas.ClaimOut)
async def assign_claim_to_self(
    claim_id: uuid.UUID,
    request: Request,
    current_user: models.User = Depends(require_role("insurer_officer")),
    db: AsyncSession = Depends(get_db),
):
    """
    POST /claims/{claim_id}/assign-self
    Allows an insurer_officer to self-assign a submitted claim.
    Transitions submitted → under_review automatically.
    """
    claim = await db.get(models.Claim, claim_id)
    if not claim:
        raise NotFoundException("Claim not found.")

    if claim.status == models.ClaimStatus.draft:
        raise CoverAIException(
            "Cannot assign a draft claim. Claim must be submitted first.",
            status_code=400,
            error_code="INVALID_STATE",
        )

    before_state = {
        "assigned_officer_id": str(claim.assigned_officer_id) if claim.assigned_officer_id else None,
        "status": claim.status.value,
    }

    claim.assigned_officer_id = current_user.id
    if claim.status == models.ClaimStatus.submitted:
        claim.status = models.ClaimStatus.under_review

    await db.flush()

    await log_action(
        db=db,
        actor_id=current_user.id,
        action="CLAIM_SELF_ASSIGN",
        resource_type="claim",
        resource_id=claim.id,
        before_state=before_state,
        after_state={
            "assigned_officer_id": str(current_user.id),
            "status": claim.status.value,
        },
        request=request,
    )

    await db.commit()
    return claim


@claims_router.post("/{claim_id}/images", response_model=List[Dict[str, Any]], status_code=status.HTTP_201_CREATED)
async def upload_claim_images(
    claim_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    current_user: models.User = Depends(require_role("customer")),
    db: AsyncSession = Depends(get_db)
):
    """
    POST /api/v1/claims/{claim_id}/images
    - Role: customer, claim must be draft or submitted
    - Accept multipart/form-data, up to 5 images per request
    - Validate: JPEG/PNG/WebP only, max 10MB each
    - Save via storage backend
    - Create claim_images records
    - Background task: run_image_ai_analysis(claim_image_id)
    - Return: list of {image_id, storage_path, message}
    """
    # 1. Fetch Claim
    claim = await db.get(models.Claim, claim_id)
    if not claim:
        raise NotFoundException("Claim not found.")
        
    # 2. Check Ownership
    if claim.claimant_id != current_user.id:
        raise ForbiddenException("You do not have permission to modify this claim.")
        
    # 3. Check State (must be draft or submitted)
    if claim.status not in [models.ClaimStatus.draft, models.ClaimStatus.submitted]:
        raise CoverAIException("Images can only be uploaded to draft or submitted claims.", status_code=400, error_code="INVALID_STATE")
        
    # 4. Limit up to 5 images per request
    if len(files) > 5:
        raise CoverAIException("A maximum of 5 images can be uploaded per request.", status_code=400, error_code="TOO_MANY_FILES")
        
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    max_size_bytes = 10 * 1024 * 1024 # 10MB
    
    storage = get_storage_backend()
    uploaded_results = []
    
    for f in files:
        # Validate type
        content_type = f.content_type
        # Fallback file extension checks if content_type is generic binary stream
        filename_lower = f.filename.lower()
        if not (content_type in allowed_types or filename_lower.endswith((".jpg", ".jpeg", ".png", ".webp"))):
            raise CoverAIException(f"Unsupported file format: {f.filename}. Only JPEG, PNG, and WebP are allowed.", status_code=400, error_code="INVALID_FILE_TYPE")
            
        # Read bytes and check size
        file_bytes = await f.read()
        file_size = len(file_bytes)
        if file_size > max_size_bytes:
            raise CoverAIException(f"File size for {f.filename} exceeds the 10MB limit.", status_code=400, error_code="FILE_TOO_LARGE")
            
        # Binary validation: check magic bytes
        if filename_lower.endswith((".jpg", ".jpeg")):
            if not file_bytes.startswith(b"\xff\xd8\xff"):
                raise CoverAIException(f"Spoofed file detected: {f.filename} is not a valid JPEG image.", status_code=400, error_code="INVALID_FILE_TYPE")
        elif filename_lower.endswith(".png"):
            if not file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
                raise CoverAIException(f"Spoofed file detected: {f.filename} is not a valid PNG image.", status_code=400, error_code="INVALID_FILE_TYPE")
        elif filename_lower.endswith(".webp"):
            if not (file_bytes.startswith(b"RIFF") and file_bytes[8:12] == b"WEBP"):
                raise CoverAIException(f"Spoofed file detected: {f.filename} is not a valid WebP image.", status_code=400, error_code="INVALID_FILE_TYPE")

        # 5. Save via storage backend
        image_id = uuid.uuid4()
        # Ensure we sanitize file extension
        ext = "jpg"
        if filename_lower.endswith(".png"):
            ext = "png"
        elif filename_lower.endswith(".webp"):
            ext = "webp"
            
        storage_path = f"claims/{claim.id}/images/{image_id}.{ext}"
        storage.upload(file_bytes, storage_path)
        
        # 6. Create claim_images record
        db_image = models.ClaimImage(
            id=image_id,
            claim_id=claim.id,
            uploaded_by=current_user.id,
            storage_path=storage_path,
            original_filename=f.filename,
            mime_type=content_type or f"image/{ext}",
            file_size_bytes=file_size,
            ai_damage_tags=None,
            ai_damage_confidence=None,
            is_verified=False
        )
        db.add(db_image)
        await db.flush()
        
        # 7. Queue Vision background task
        background_tasks.add_task(run_image_ai_analysis, db_image.id)
        
        uploaded_results.append({
            "image_id": db_image.id,
            "storage_path": db_image.storage_path,
            "message": "Image uploaded successfully. Analysis running in background."
        })
        
    await db.commit()
    return uploaded_results


@claims_router.get("/{claim_id}/images", response_model=List[schemas.ClaimImageOut])
async def get_claim_images(
    claim: models.Claim = Depends(require_claim_access),
    db: AsyncSession = Depends(get_db)
):
    """
    GET /api/v1/claims/{claim_id}/images
    - Return list of images with signed URLs and ai_damage_tags
    """
    storage = get_storage_backend()
    
    stmt = select(models.ClaimImage).where(models.ClaimImage.claim_id == claim.id)
    images = (await db.execute(stmt)).scalars().all()
    
    results = []
    for img in images:
        results.append({
            "id": img.id,
            "storage_path": img.storage_path,
            "signed_url": storage.get_url(img.storage_path),
            "ai_damage_tags": img.ai_damage_tags,
            "ai_damage_confidence": img.ai_damage_confidence,
            "is_verified": img.is_verified,
            "created_at": img.created_at
        })
        
    return results
