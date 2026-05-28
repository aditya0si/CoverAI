import enum
import uuid
from datetime import datetime
from sqlalchemy import Enum, DateTime, text, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base

class ExportStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"

class DataExportRequest(Base):
    __tablename__ = "data_export_requests"
    
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
    status: Mapped[ExportStatus] = mapped_column(
        Enum(ExportStatus, name="export_status_enum"),
        default=ExportStatus.pending,
        nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        server_default=text("now()"),
        nullable=False
    )
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    download_url: Mapped[str] = mapped_column(String(500), nullable=True)
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="data_export_requests")

    def __repr__(self) -> str:
        return f"<DataExportRequest {self.id} user={self.user_id} status={self.status.value}>"
