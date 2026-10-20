import uuid
import random
import string
from datetime import datetime, timedelta
from pathlib import Path, PureWindowsPath
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.security import get_current_user, require_role, require_policy_owner
from core.storage import get_storage_backend
from core.exceptions import CoverAIException
from core.audit import log_action
from services.pdf_service import extract_text_from_pdf, parse_policy_metadata, PdfExtractionError
from services.embedding_service import generate_and_store_embeddings
import models
from schemas.policy import PolicyUploadResponse, PolicyDetailOut

policies_router = APIRouter(prefix="/policies", tags=["Policies"])

#: Longest client filename we are willing to parse. Real PDF basenames are far
#: shorter; the cap keeps the validator linear on hostile input.
MAX_PDF_FILENAME_LENGTH = 255


def generate_policy_number() -> str:
    return "POL-" + "".join(random.choices(string.digits, k=8))


def policy_storage_path(policy_id: uuid.UUID) -> str:
    """Canonical storage key for a policy PDF.

    The key is entirely server-generated: the client filename never reaches the
    storage layer, so no multipart value can influence where bytes land.
    """
    return f"policies/{policy_id}/policy.pdf"


def is_safe_pdf_filename(filename: str | None) -> bool:
    """True only for a plain ``.pdf`` basename with no path semantics.

    Accepted: ``policy.pdf``, ``Apex Policy 2026.PDF``.
    Rejected: anything carrying a POSIX or Windows separator, a ``..`` path
    component, an absolute or drive-prefixed form, or a control character.
    """
    if not isinstance(filename, str) or not filename:
        return False
    if len(filename) > MAX_PDF_FILENAME_LENGTH:
        return False
    if any(ord(char) < 32 or ord(char) == 127 for char in filename):
        return False
    # ``..`` as a path component is traversal, in either separator flavour.
    if ".." in filename.replace("\\", "/").split("/"):
        return False
    # Both separator flavours, regardless of the host OS running the API.
    if "/" in filename or "\\" in filename:
        return False
    if filename.startswith(("/", "\\")) or Path(filename).is_absolute():
        return False
    if PureWindowsPath(filename).is_absolute() or PureWindowsPath(filename).drive:
        return False
    if not filename.lower().endswith(".pdf"):
        return False
    return True


@policies_router.post("/upload", response_model=PolicyUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_policy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    vehicle_registration: str = Form(...),
    insurer_name: str = Form(...),
    current_user: models.User = Depends(require_role("customer")),
    db: AsyncSession = Depends(get_db)
):
    # 1. Validate: the client filename must be a plain .pdf basename. The
    # extension gate stands on its own; Content-Type is never treated as proof
    # of format, and the raw name is never echoed back to the client.
    if not is_safe_pdf_filename(file.filename):
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
    
    # Upload to storage backend on a canonical, server-generated key. The
    # client-supplied filename never participates in the storage path.
    storage = get_storage_backend()
    storage_path = policy_storage_path(policy_id)
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

    # 7. Trigger async chunking and embedding
    background_tasks.add_task(generate_and_store_embeddings, policy_id)

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
