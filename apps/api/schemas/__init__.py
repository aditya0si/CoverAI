import uuid
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field

# Base configuration for all schemas
class BaseSchema(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        from_attributes=True,
    )

# ==========================================
# User Schemas
# ==========================================
UserRole = Literal["admin", "insurer_officer", "advisor", "aggregator", "customer"]

class UserBase(BaseSchema):
    email: str = Field(..., pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    role: UserRole = "customer"
    is_active: bool = True

class UserCreate(UserBase):
    pass

class UserUpdate(BaseSchema):
    email: Optional[str] = Field(None, pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    first_name: Optional[str] = Field(None, min_length=1)
    last_name: Optional[str] = Field(None, min_length=1)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None

class UserOut(UserBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ==========================================
# Vehicle Schemas
# ==========================================
class VehicleBase(BaseSchema):
    make: str = Field(..., min_length=1)
    model: str = Field(..., min_length=1)
    year: int = Field(..., ge=1900)
    vin: str = Field(..., min_length=17, max_length=17)
    license_plate: str = Field(..., min_length=2)

class VehicleCreate(VehicleBase):
    owner_id: uuid.UUID

class VehicleUpdate(BaseSchema):
    make: Optional[str] = Field(None, min_length=1)
    model: Optional[str] = Field(None, min_length=1)
    year: Optional[int] = Field(None, ge=1900)
    vin: Optional[str] = Field(None, min_length=17, max_length=17)
    license_plate: Optional[str] = Field(None, min_length=2)

class VehicleOut(VehicleBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ==========================================
# Policy Schemas (Legacy)
# ==========================================
PolicyStatus = Literal["draft", "active", "expired", "cancelled"]

class PolicyBase(BaseSchema):
    coverage_amount: float = Field(..., gt=0)
    premium_amount: float = Field(..., gt=0)
    status: PolicyStatus = "draft"
    start_date: datetime
    end_date: datetime

class PolicyCreate(PolicyBase):
    holder_id: uuid.UUID
    vehicle_id: uuid.UUID

class PolicyUpdate(BaseSchema):
    coverage_amount: Optional[float] = Field(None, gt=0)
    premium_amount: Optional[float] = Field(None, gt=0)
    status: Optional[PolicyStatus] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class PolicyOut(PolicyBase):
    id: uuid.UUID
    policy_number: str
    holder_id: uuid.UUID
    vehicle_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ==========================================
# Claim Schemas (Imported from claim.py)
# ==========================================
from .claim import (
    AITriageAssessment,
    PolicySummary,
    ClaimCreate,
    ClaimUpdate,
    ClaimStatusTransition,
    ClaimSubmitResponse,
    ClaimImageOut,
    AuditLogOut,
    ClaimOut,
    ClaimDetailResponse,
    ClaimCreateResponse,
)
