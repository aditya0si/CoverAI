import enum
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Enum, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from core.database import Base
from .custom_types import EncryptedString

class UserRole(str, enum.Enum):
    customer = "customer"
    insurer_officer = "insurer_officer"
    advisor = "advisor"
    aggregator = "aggregator"
    admin = "admin"

class User(Base):
    __tablename__ = "users"
    
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # nullable: Google OAuth users may not have a phone number
    phone: Mapped[Optional[str]] = mapped_column(EncryptedString(255), nullable=True)
    phone_hash: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True, nullable=True)
    # nullable: Google OAuth users have no password
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role_enum"),
        default=UserRole.customer,
        nullable=False
    )
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Google OAuth fields
    google_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    
    # DPDP Flags
    ai_analysis_consent: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
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
    policies: Mapped[list["Policy"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan"
    )
    claims: Mapped[list["Claim"]] = relationship(
        foreign_keys="[Claim.claimant_id]",
        back_populates="claimant",
        cascade="all, delete-orphan"
    )
    assigned_claims: Mapped[list["Claim"]] = relationship(
        foreign_keys="[Claim.assigned_officer_id]",
        back_populates="assigned_officer"
    )
    claim_images_uploaded: Mapped[list["ClaimImage"]] = relationship(
        back_populates="uploader",
        cascade="all, delete-orphan"
    )
    advisor_customers: Mapped[list["AdvisorAssignment"]] = relationship(
        foreign_keys="[AdvisorAssignment.advisor_id]",
        back_populates="advisor",
        cascade="all, delete-orphan"
    )
    customer_advisors: Mapped[list["AdvisorAssignment"]] = relationship(
        foreign_keys="[AdvisorAssignment.customer_id]",
        back_populates="customer",
        cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan"
    )
    consent_records: Mapped[list["ConsentRecord"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan"
    )
    data_export_requests: Mapped[list["DataExportRequest"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan"
    )
    data_deletion_requests: Mapped[list["DataDeletionRequest"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        back_populates="actor"
    )
    
    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role.value})>"
