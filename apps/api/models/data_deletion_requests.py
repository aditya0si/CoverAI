import enum
import uuid
from datetime import datetime
from sqlalchemy import Enum, DateTime, text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base

class DeletionStatus(str, enum.Enum):
    pending = "pending"
    processed = "processed"
    cancelled = "cancelled"

class DataDeletionRequest(Base):
    __tablename__ = "data_deletion_requests"
    
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
    status: Mapped[DeletionStatus] = mapped_column(
        Enum(DeletionStatus, name="deletion_status_enum"),
        default=DeletionStatus.pending,
        nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        server_default=text("now()"),
        nullable=False
    )
    processed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="data_deletion_requests")

    def __repr__(self) -> str:
        return f"<DataDeletionRequest {self.id} user={self.user_id} status={self.status.value}>"
