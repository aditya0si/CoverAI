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
    customer_prediction: Optional[str] = None
    customer_explanation: Optional[str] = None

class PolicySummary(BaseSchema):
    """Embedded policy context for insurer claim detail view."""
    id: uuid.UUID
    policy_number: str
    insurer_name: str
    vehicle_registration: str
    vehicle_make: str
    vehicle_model: str
    vehicle_year: int
    policy_type: str
    start_date: datetime
    end_date: datetime
    premium_amount: float
    sum_insured: float
    status: str
    extracted_text: Optional[str] = None

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
    ai_customer_prediction: Optional[str] = None
    ai_customer_explanation: Optional[str] = None
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
    ai_customer_prediction: Optional[str] = None
    ai_customer_explanation: Optional[str] = None
    estimated_amount: float
    approved_amount: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    images: List[ClaimImageOut] = []
    status_history: List[AuditLogOut] = []
    policy: Optional[PolicySummary] = None

    @field_validator("ai_summary", mode="before")
    @classmethod
    def parse_ai_summary(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return {
                    "risk_score": 0.5,
                    "coverage_assessment": "unclear",
                    "key_policy_clauses": [],
                    "red_flags": [],
                    "recommended_action": "standard_review",
                    "summary_for_officer": v,
                    "customer_prediction": "needs_more_info",
                    "customer_explanation": "Your claim is currently under standard review."
                }
        return v

class ClaimCreateResponse(BaseSchema):
    claim_id: uuid.UUID
    claim_number: str
    status: ClaimStatus

