import uuid
import random
import string
from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.security import get_current_user, require_role, require_policy_owner
from core.storage import get_storage_backend
from core.exceptions import NotFoundException, ForbiddenException, CoverAIException
from core.audit import log_action
from services.pdf_service import extract_text_from_pdf, parse_policy_metadata, PdfExtractionError
import models
from schemas.policy import PolicyUploadResponse, PolicyDetailOut

policies_router = APIRouter(prefix="/policies", tags=["Policies"])

def generate_policy_number() -> str:
    return "POL-" + "".join(random.choices(string.digits, k=8))


async def log_audit_action(
    actor_id: uuid.UUID,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID,
    before_state: dict = None,
    after_state: dict = None
):
    """Background task to commit audit logs to the database asynchronously."""
    from core.database import SessionLocal
    async with SessionLocal() as db:
        try:
            log_record = models.AuditLog(
                actor_id=actor_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                before_state=before_state,
                after_state=after_state
            )
            db.add(log_record)
            await db.commit()
        except Exception:
            # Silence background logging failures to prevent request blocking
            pass


@policies_router.post("/upload", response_model=PolicyUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_policy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    vehicle_registration: str = Form(...),
    insurer_name: str = Form(...),
    current_user: models.User = Depends(require_role("customer")),
    db: AsyncSession = Depends(get_db)
):
    # 1. Validate: PDF check and size limit (20MB)
    if not file.filename.lower().endswith(".pdf") and file.content_type != "application/pdf":
        raise CoverAIException("Invalid file format. Only PDF documents are allowed.", status_code=422, error_code="VALIDATION_ERROR")
    
    # Read bytes to check file size
    file_bytes = await file.read()
    max_size = 20 * 1024 * 1024 # 20MB
    if len(file_bytes) > max_size:
        raise CoverAIException("File size exceeds the 20MB limit.", status_code=422, error_code="VALIDATION_ERROR")

    # Secure Validation: Check PDF magic bytes (starts with %PDF)
    if not file_bytes.startswith(b"%PDF"):
        raise CoverAIException("Invalid file format. Spoofed PDF document detected via magic bytes.", status_code=422, error_code="VALIDATION_ERROR")

    # 2. Extract Text via PDF extraction service
    try:
        extraction_result = extract_text_from_pdf(file_bytes)
    except PdfExtractionError as e:
        raise CoverAIException(str(e), status_code=422, error_code="PDF_EXTRACTION_ERROR")

    full_text = extraction_result["text"]
    
    # 3. Parse Metadata using our regex assistant
    parsed_metadata = parse_policy_metadata(full_text)

    # 4. Generate policy numbers and create DB record
    policy_num = generate_policy_number()
    policy_id = uuid.uuid4()
    
    # Upload to storage backend
    storage = get_storage_backend()
    storage_path = f"policies/{policy_id}/{file.filename}"
    uploaded_url = storage.upload(file_bytes, storage_path)

    # 5. Populate and create database record
    db_policy = models.Policy(
        id=policy_id,
        policy_number=policy_num,
        user_id=current_user.id,
        insurer_name=insurer_name,
        vehicle_registration=vehicle_registration,
        vehicle_make=parsed_metadata.get("vehicle_make", "Unknown"),
        vehicle_model=parsed_metadata.get("vehicle_model", "Unknown"),
        vehicle_year=parsed_metadata.get("vehicle_year", 2024),
        policy_type=models.PolicyType.comprehensive,
        start_date=parsed_metadata.get("start_date", datetime.utcnow()),
        end_date=parsed_metadata.get("end_date", datetime.utcnow() + timedelta(days=365)),
        premium_amount=parsed_metadata.get("premium_amount", 15000.00),
        sum_insured=parsed_metadata.get("sum_insured", 500000.00),
        pdf_storage_path=uploaded_url,
        extracted_text=full_text,
        status=models.PolicyStatus.active
    )
    
    db.add(db_policy)
    await db.flush()

    # 6. Record Audit Action
    await log_action(
        db=db,
        actor_id=current_user.id,
        action="UPLOAD_POLICY",
        resource_type="policy",
        resource_id=policy_id,
        after_state={
            "policy_number": policy_num,
            "insurer_name": insurer_name,
            "vehicle_registration": vehicle_registration
        }
    )

    return {
        "policy_id": policy_id,
        "policy_number": policy_num,
        "message": "Policy uploaded and text extracted successfully."
    }


@policies_router.get("/{policy_id}", response_model=PolicyDetailOut)
async def get_policy(
    policy: models.Policy = Depends(require_policy_owner)
):
    return policy


@policies_router.get("", response_model=List[PolicyDetailOut])
async def list_policies(
    page: int = 1,
    limit: int = 20,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Enforce positive integers for pagination
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 20
        
    offset = (page - 1) * limit
    stmt = (
        select(models.Policy)
        .where(models.Policy.user_id == current_user.id)
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
