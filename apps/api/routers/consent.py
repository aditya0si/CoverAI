import uuid
import json
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, status, Request, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db, SessionLocal
from core.security import get_current_user
from core.exceptions import CoverAIException, NotFoundException
from core.audit import log_action
from core.storage import get_storage_backend
from core.encryption import hash_phone
import models

logger = logging.getLogger("uvicorn.error")

consent_router = APIRouter(prefix="/consent", tags=["Consent Management"])

# ==========================================
# Pydantic Schemas
# ==========================================

class ConsentPatchRequest(BaseModel):
    granted: bool

class ConsentRecordResponse(BaseModel):
    consent_type: str
    granted: bool
    granted_at: datetime
    revoked_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class DataExportRequestResponse(BaseModel):
    request_id: uuid.UUID
    message: str

class DataDeletionRequestResponse(BaseModel):
    request_id: uuid.UUID
    message: str

# ==========================================
# Background Tasks
# ==========================================

async def run_data_export(request_id: uuid.UUID, user_id: uuid.UUID):
    """
    Background job to compile all of a user's data into a single, beautiful JSON
    export file, upload it to storage, and stub sending the download email.
    """
    async with SessionLocal() as db:
        try:
            req = await db.get(models.DataExportRequest, request_id)
            if not req:
                logger.error(f"[Data Export] Request {request_id} not found in DB.")
                return

            user = await db.get(models.User, user_id)
            if not user:
                req.status = models.ExportStatus.failed
                await db.commit()
                return

            # 1. Compile Policies (without extracted_text)
            stmt = select(models.Policy).where(models.Policy.user_id == user_id)
            policies = (await db.execute(stmt)).scalars().all()
            policies_data = []
            for p in policies:
                policies_data.append({
                    "id": str(p.id),
                    "policy_number": p.policy_number,
                    "insurer_name": p.insurer_name,
                    "vehicle_registration": p.vehicle_registration,  # EncryptedString transparently decrypts
                    "vehicle_make": p.vehicle_make,
                    "vehicle_model": p.vehicle_model,
                    "vehicle_year": p.vehicle_year,
                    "policy_type": p.policy_type.value,
                    "start_date": p.start_date.isoformat(),
                    "end_date": p.end_date.isoformat(),
                    "premium_amount": float(p.premium_amount),
                    "sum_insured": float(p.sum_insured),
                    "status": p.status.value,
                    "created_at": p.created_at.isoformat()
                })

            # 2. Compile Claims
            stmt = select(models.Claim).where(models.Claim.claimant_id == user_id)
            claims = (await db.execute(stmt)).scalars().all()
            claims_data = []
            for c in claims:
                claims_data.append({
                    "id": str(c.id),
                    "claim_number": c.claim_number,
                    "policy_id": str(c.policy_id),
                    "incident_date": c.incident_date.isoformat(),
                    "incident_location": c.incident_location,
                    "incident_description": c.incident_description,
                    "claim_type": c.claim_type.value,
                    "status": c.status.value,
                    "ai_risk_score": c.ai_risk_score,
                    "ai_summary": c.ai_summary,
                    "estimated_amount": float(c.estimated_amount),
                    "approved_amount": float(c.approved_amount) if c.approved_amount else None,
                    "created_at": c.created_at.isoformat()
                })

            # 3. Compile Messages
            stmt = select(models.Conversation).where(models.Conversation.user_id == user_id)
            conversations = (await db.execute(stmt)).scalars().all()
            messages_data = []
            for conv in conversations:
                stmt_msg = select(models.Message).where(models.Message.conversation_id == conv.id)
                messages = (await db.execute(stmt_msg)).scalars().all()
                for m in messages:
                    messages_data.append({
                        "id": str(m.id),
                        "conversation_id": str(m.conversation_id),
                        "role": m.role.value,
                        "content": m.content,
                        "created_at": m.created_at.isoformat()
                    })

            # 4. Compile Consent Records
            stmt = select(models.ConsentRecord).where(models.ConsentRecord.user_id == user_id)
            consents = (await db.execute(stmt)).scalars().all()
            consent_data = []
            for con in consents:
                consent_data.append({
                    "consent_type": con.consent_type.value,
                    "granted": con.granted,
                    "granted_at": con.granted_at.isoformat(),
                    "revoked_at": con.revoked_at.isoformat() if con.revoked_at else None
                })

            # 5. Compile Audit Logs
            stmt = select(models.AuditLog).where(models.AuditLog.actor_id == user_id)
            audit_logs = (await db.execute(stmt)).scalars().all()
            audit_data = []
            for al in audit_logs:
                audit_data.append({
                    "id": str(al.id),
                    "action": al.action,
                    "resource_type": al.resource_type,
                    "resource_id": str(al.resource_id) if al.resource_id else None,
                    "before_state": al.before_state,
                    "after_state": al.after_state,
                    "ip_address": al.ip_address,
                    "created_at": al.created_at.isoformat()
                })

            # Formulate the payload
            export_payload = {
                "export_metadata": {
                    "request_id": str(request_id),
                    "compiled_at": datetime.utcnow().isoformat(),
                    "dpdp_compliance": "Yes - DPDP Act 2023 India Section 6"
                },
                "user": {
                    "id": str(user.id),
                    "email": user.email,
                    "phone": user.phone,  # Decrypted automatically
                    "full_name": user.full_name,
                    "role": user.role.value,
                    "created_at": user.created_at.isoformat()
                },
                "policies": policies_data,
                "claims": claims_data,
                "conversations": [{"id": str(conv.id), "title": getattr(conv, "title", "Chat")} for conv in conversations],
                "messages": messages_data,
                "consent_records": consent_data,
                "audit_logs": audit_data
            }

            # Serialize and upload
            json_bytes = json.dumps(export_payload, indent=2).encode("utf-8")
            storage = get_storage_backend()
            storage_path = f"exports/{user_id}/{request_id}.json"
            download_url = storage.upload(json_bytes, storage_path)

            # Update request status
            req.status = models.ExportStatus.completed
            req.completed_at = datetime.utcnow()
            req.download_url = download_url

            # Log mock email dispatch
            logger.info(
                f"[DPDP EMAIL STUB] To: {user.email}\n"
                f"Subject: Your CoverAI Personal Data Export is Ready\n"
                f"Body: Hello {user.full_name}, as per your DPDP request, you can download your data archive from: {download_url}\n"
                f"This link will expire within 7 days."
            )
            await db.commit()

        except Exception as err:
            logger.error(f"[Data Export Task] Critical error compiling export: {err}")
            try:
                req = await db.get(models.DataExportRequest, request_id)
                if req:
                    req.status = models.ExportStatus.failed
                    await db.commit()
            except Exception:
                pass

# ==========================================
# API Router Handlers
# ==========================================

@consent_router.get("/", response_model=List[ConsentRecordResponse])
async def get_consent_records(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all active consent records for the currently authenticated user.
    """
    stmt = select(models.ConsentRecord).where(models.ConsentRecord.user_id == current_user.id)
    result = await db.execute(stmt)
    return result.scalars().all()


@consent_router.patch("/{consent_type}")
async def update_consent_record(
    consent_type: str,
    payload: ConsentPatchRequest,
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Updates or creates a consent record for the current user.
    If revoking 'ai_analysis', updates user.ai_analysis_consent flag to False,
    retains existing AI summaries, and logs changes to the audit trails.
    """
    # Verify valid consent type
    valid_consent_types = [ct.value for ct in models.ConsentType]
    if consent_type not in valid_consent_types:
        raise CoverAIException(
            detail=f"Invalid consent type. Must be one of: {valid_consent_types}",
            status_code=400,
            error_code="BAD_REQUEST"
        )

    # 1. Fetch or create consent record
    stmt = select(models.ConsentRecord).where(
        models.ConsentRecord.user_id == current_user.id,
        models.ConsentRecord.consent_type == models.ConsentType(consent_type)
    )
    consent_record = (await db.execute(stmt)).scalar_one_or_none()

    before_state = None
    if consent_record:
        before_state = {
            "consent_type": consent_record.consent_type.value,
            "granted": consent_record.granted,
            "revoked_at": consent_record.revoked_at.isoformat() if consent_record.revoked_at else None
        }
        # Update existing
        consent_record.granted = payload.granted
        if not payload.granted:
            consent_record.revoked_at = datetime.utcnow()
        else:
            consent_record.revoked_at = None
    else:
        # Create new
        consent_record = models.ConsentRecord(
            user_id=current_user.id,
            consent_type=models.ConsentType(consent_type),
            granted=payload.granted,
            revoked_at=None if payload.granted else datetime.utcnow()
        )
        db.add(consent_record)

    # 2. Check revoking specific consents (ai_analysis)
    message = f"Consent for '{consent_type}' updated successfully."
    if consent_type == "ai_analysis":
        current_user.ai_analysis_consent = payload.granted
        if not payload.granted:
            message = (
                "Consent for AI analysis has been withdrawn. Existing summaries will be "
                "retained for administrative audit trails, but future claims triage and "
                "vision damage analysis will not execute unless consent is granted again."
            )

    # 3. Log to audit trail
    await log_action(
        db=db,
        actor_id=current_user.id,
        action="UPDATE_CONSENT",
        resource_type="consent_record",
        resource_id=consent_record.id if getattr(consent_record, "id", None) else current_user.id,
        before_state=before_state,
        after={
            "consent_type": consent_type,
            "granted": payload.granted,
            "revoked_at": consent_record.revoked_at.isoformat() if consent_record.revoked_at else None
        },
        request=request
    )

    await db.commit()

    return {
        "status": "success",
        "message": message,
        "consent": {
            "consent_type": consent_type,
            "granted": payload.granted
        }
    }


@consent_router.post("/data-export-request", response_model=DataExportRequestResponse)
async def request_data_export(
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submits a DPDP Right to Data Portability request.
    Spawns a background worker to compile all personal profiles, policies, claims,
    and chat history into a downloadable format.
    """
    # Create request record
    export_req = models.DataExportRequest(
        user_id=current_user.id,
        status=models.ExportStatus.pending
    )
    db.add(export_req)
    await db.flush()

    # Log to audit trail
    await log_action(
        db=db,
        actor_id=current_user.id,
        action="REQUEST_DATA_EXPORT",
        resource_type="data_export_request",
        resource_id=export_req.id,
        request=request
    )

    await db.commit()

    # Launch background processing
    background_tasks.add_task(run_data_export, export_req.id, current_user.id)

    return {
        "request_id": export_req.id,
        "message": "Your personal data archive export is being compiled. It will be ready within 24 hours."
    }


@consent_router.get("/data-export-requests")
async def get_data_export_requests(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all data export requests for the currently authenticated user.
    """
    stmt = select(models.DataExportRequest).where(
        models.DataExportRequest.user_id == current_user.id
    ).order_by(models.DataExportRequest.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@consent_router.get("/data-deletion-requests")
async def get_data_deletion_requests(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all data deletion requests for the currently authenticated user.
    """
    stmt = select(models.DataDeletionRequest).where(
        models.DataDeletionRequest.user_id == current_user.id
    ).order_by(models.DataDeletionRequest.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@consent_router.post("/data-deletion-request", response_model=DataDeletionRequestResponse)
async def request_data_deletion(
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submits a DPDP Right to Erasure request.
    Under Section 12, a 30-day grace period is enforced before final deletion/anonymization
    routines are completed to prevent accidental loss and allow audit reviews.
    """
    # Check for existing pending requests first
    stmt = select(models.DataDeletionRequest).where(
        models.DataDeletionRequest.user_id == current_user.id,
        models.DataDeletionRequest.status == models.DeletionStatus.pending
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        return {
            "request_id": existing.id,
            "message": "You already have a pending deletion request. Your account is currently scheduled for deletion."
        }

    # Create new deletion request
    deletion_req = models.DataDeletionRequest(
        user_id=current_user.id,
        status=models.DeletionStatus.pending
    )
    db.add(deletion_req)
    await db.flush()

    # Log action to audit trails
    await log_action(
        db=db,
        actor_id=current_user.id,
        action="REQUEST_DATA_DELETION",
        resource_type="data_deletion_request",
        resource_id=deletion_req.id,
        request=request
    )

    await db.commit()

    return {
        "request_id": deletion_req.id,
        "message": "Your account deletion request has been submitted. Your account will be completely anonymized within 30 days. You can cancel this request anytime within these 30 days."
    }


@consent_router.post("/data-deletion-request/cancel")
async def cancel_data_deletion(
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Cancels a pending account deletion request during the 30-day grace period.
    """
    stmt = select(models.DataDeletionRequest).where(
        models.DataDeletionRequest.user_id == current_user.id,
        models.DataDeletionRequest.status == models.DeletionStatus.pending
    )
    deletion_req = (await db.execute(stmt)).scalar_one_or_none()
    if not deletion_req:
        raise NotFoundException("No pending data deletion request found for your account.")

    # Cancel request
    deletion_req.status = models.DeletionStatus.cancelled
    
    # Log cancel action
    await log_action(
        db=db,
        actor_id=current_user.id,
        action="CANCEL_DATA_DELETION",
        resource_type="data_deletion_request",
        resource_id=deletion_req.id,
        request=request
    )

    await db.commit()

    return {
        "status": "success",
        "message": "Your account deletion request has been cancelled successfully. Your personal data remains active."
    }
