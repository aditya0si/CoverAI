import enum
import uuid
from datetime import datetime
from sqlalchemy import String, Numeric, Enum, DateTime, text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .custom_types import EncryptedString

class PolicyType(str, enum.Enum):
    comprehensive = "comprehensive"
    third_party = "third_party"
    standalone_od = "standalone_od"

class PolicyStatus(str, enum.Enum):
    active = "active"
    expired = "expired"
    cancelled = "cancelled"

class Policy(Base):
    __tablename__ = "policies"
    
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    policy_number: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False
    )
    
    insurer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    vehicle_registration: Mapped[str] = mapped_column(EncryptedString(255), nullable=False)
    vehicle_make: Mapped[str] = mapped_column(String(100), nullable=False)
    vehicle_model: Mapped[str] = mapped_column(String(100), nullable=False)
    vehicle_year: Mapped[int] = mapped_column(nullable=False)
    
    policy_type: Mapped[PolicyType] = mapped_column(
        Enum(PolicyType, name="policy_type_enum"),
        nullable=False
    )
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    premium_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    sum_insured: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    
    pdf_storage_path: Mapped[str] = mapped_column(String(500), nullable=True)
    extracted_text: Mapped[str] = mapped_column(nullable=True)
    embedding_model_version: Mapped[str] = mapped_column(String(100), nullable=True)
    
    status: Mapped[PolicyStatus] = mapped_column(
        Enum(PolicyStatus, name="policy_status_enum"),
        default=PolicyStatus.active,
        nullable=False
    )
    
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
    user: Mapped["User"] = relationship(back_populates="policies")
    claims: Mapped[list["Claim"]] = relationship(
        back_populates="policy",
        cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="policy"
    )
    
    def __repr__(self) -> str:
        return f"<Policy {self.policy_number} ({self.status.value})>"
