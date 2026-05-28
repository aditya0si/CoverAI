import uuid
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import Field, field_validator
from schemas import BaseSchema
from models.claims import ClaimType, ClaimStatus

class AITriageAssessment(BaseSchema):
    risk_score: float = Field(..., ge=0.0, le=1.0)
    coverage_assessment: str
    key_policy_clauses: List[str]
    red_flags: List[str]
    recommended_action: str
    summary_for_officer: str

class ClaimCreate(BaseSchema):
    policy_id: uuid.UUID
    incident_date: datetime
    incident_location: str = Field(..., min_length=2, max_length=255)
    incident_description: str = Field(..., min_length=10)
    claim_type: ClaimType
    estimated_amount: float = Field(0.0, ge=0.0)

class ClaimUpdate(BaseSchema):
    incident_location: Optional[str] = None
    incident_description: Optional[str] = None
    claim_type: Optional[ClaimType] = None
    estimated_amount: Optional[float] = None

class ClaimStatusTransition(BaseSchema):
    status: ClaimStatus
    remarks: str = Field(..., min_length=1)
    approved_amount: Optional[float] = None

class ClaimSubmitResponse(BaseSchema):
    claim_id: uuid.UUID
    status: ClaimStatus
    message: str

class ClaimImageOut(BaseSchema):
    id: uuid.UUID
    storage_path: str
    signed_url: str
    ai_damage_tags: Optional[Dict[str, Any]] = None
    ai_damage_confidence: Optional[float] = None
    is_verified: bool
    created_at: datetime

class AuditLogOut(BaseSchema):
    id: uuid.UUID
    actor_id: Optional[uuid.UUID] = None
    action: str
    resource_type: str
    resource_id: Optional[uuid.UUID] = None
    before_state: Optional[Dict[str, Any]] = None
    after_state: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    created_at: datetime

class ClaimOut(BaseSchema):
    id: uuid.UUID
    claim_number: str
    status: ClaimStatus
    claim_type: ClaimType
    incident_date: datetime
    estimated_amount: float
    created_at: datetime

class ClaimDetailResponse(BaseSchema):
    id: uuid.UUID
    claim_number: str
    policy_id: uuid.UUID
    claimant_id: uuid.UUID
    incident_date: datetime
    incident_location: str
    incident_description: str
    claim_type: ClaimType
    status: ClaimStatus
    assigned_officer_id: Optional[uuid.UUID] = None
    ai_risk_score: Optional[float] = None
    ai_summary: Optional[AITriageAssessment] = None
    estimated_amount: float
    approved_amount: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    images: List[ClaimImageOut] = []
    status_history: List[AuditLogOut] = []

    @field_validator("ai_summary", mode="before")
    @classmethod
    def parse_ai_summary(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                pass
        return v

class ClaimCreateResponse(BaseSchema):
    claim_id: uuid.UUID
    claim_number: str
    status: ClaimStatus
