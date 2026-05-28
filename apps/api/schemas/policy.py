import uuid
from datetime import datetime
from typing import Optional
from pydantic import Field
from schemas import BaseSchema
from models.policies import PolicyStatus, PolicyType

class PolicyUploadResponse(BaseSchema):
    """Schema returned after a successful policy document upload and text extraction."""
    policy_id: uuid.UUID
    policy_number: str
    message: str


class PolicyDetailOut(BaseSchema):
    """Full details of a policy, excluding raw extracted text for performance and security."""
    id: uuid.UUID
    policy_number: str
    user_id: uuid.UUID
    insurer_name: str
    vehicle_registration: str
    vehicle_make: str
    vehicle_model: str
    vehicle_year: int
    policy_type: PolicyType
    start_date: datetime
    end_date: datetime
    premium_amount: float
    sum_insured: float
    pdf_storage_path: Optional[str] = None
    status: PolicyStatus
    created_at: datetime
    updated_at: datetime
