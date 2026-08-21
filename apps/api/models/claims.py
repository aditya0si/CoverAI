import enum
import uuid
import random
import string
from datetime import datetime
from sqlalchemy import String, Numeric, Float, Enum, DateTime, text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base

class ClaimType(str, enum.Enum):
    own_damage = "own_damage"
    third_party = "third_party"
    theft = "theft"
    natural_calamity = "natural_calamity"
    fire = "fire"

class ClaimStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    under_review = "under_review"
    surveyor_assigned = "surveyor_assigned"
    approved = "approved"
    rejected = "rejected"
    settled = "settled"
    disputed = "disputed"

def generate_claim_number() -> str:
    return "CLM-" + "".join(random.choices(string.digits, k=8))

class Claim(Base):
    __tablename__ = "claims"
    
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    claim_number: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        index=True,
        default=generate_claim_number,
        nullable=False
    )
    policy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("policies.id", ondelete="CASCADE"),
        nullable=False
    )
    claimant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False
    )
    
    incident_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    incident_location: Mapped[str] = mapped_column(nullable=False)
    incident_description: Mapped[str] = mapped_column(nullable=False)
    
    claim_type: Mapped[ClaimType] = mapped_column(
        Enum(ClaimType, name="claim_type_enum"),
        nullable=False
    )
    status: Mapped[ClaimStatus] = mapped_column(
        Enum(ClaimStatus, name="claim_status_enum"),
        default=ClaimStatus.draft,
        nullable=False
    )
    
    assigned_officer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True
    )
    
    ai_risk_score: Mapped[float] = mapped_column(Float, nullable=True)
    ai_summary: Mapped[str] = mapped_column(nullable=True)
    ai_customer_prediction: Mapped[str] = mapped_column(String(50), nullable=True)
    ai_customer_explanation: Mapped[str] = mapped_column(nullable=True)
    
    estimated_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    approved_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        server_default=text("now()"),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=text("now()"),
        nullable=False
    )
    
    # Relationships
    policy: Mapped["Policy"] = relationship(back_populates="claims")
    claimant: Mapped["User"] = relationship(
        foreign_keys=[claimant_id],
        back_populates="claims"
    )
    assigned_officer: Mapped["User"] = relationship(
        foreign_keys=[assigned_officer_id],
        back_populates="assigned_claims"
    )
    images: Mapped[list["ClaimImage"]] = relationship(
        back_populates="claim",
        cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="claim"
    )
    
    # Table arguments for composite indexes
    __table_args__ = (
        Index("idx_claims_policy_status", "policy_id", "status"),
    )
    
    def __repr__(self) -> str:
        return f"<Claim {self.claim_number} ({self.status.value})>"
