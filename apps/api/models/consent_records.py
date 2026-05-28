import enum
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Enum, DateTime, text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base

class ConsentType(str, enum.Enum):
    data_processing = "data_processing"
    marketing = "marketing"
    ai_analysis = "ai_analysis"
    third_party_sharing = "third_party_sharing"

class ConsentRecord(Base):
    __tablename__ = "consent_records"
    
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False
    )
    consent_type: Mapped[ConsentType] = mapped_column(
        Enum(ConsentType, name="consent_type_enum"),
        nullable=False
    )
    granted: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    granted_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        server_default=text("now()"),
        nullable=False
    )
    revoked_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(100), nullable=True)
    user_agent: Mapped[str] = mapped_column(String(500), nullable=True)
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="consent_records")
    
    def __repr__(self) -> str:
        return f"<ConsentRecord {self.consent_type.value} user={self.user_id} granted={self.granted}>"
