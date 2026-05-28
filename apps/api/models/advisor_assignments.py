import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base

class AdvisorAssignment(Base):
    __tablename__ = "advisor_assignments"
    
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    advisor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False
    )
    
    granted_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        server_default=text("now()"),
        nullable=False
    )
    revoked_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Relationships
    advisor: Mapped["User"] = relationship(
        foreign_keys=[advisor_id],
        back_populates="advisor_customers"
    )
    customer: Mapped["User"] = relationship(
        foreign_keys=[customer_id],
        back_populates="customer_advisors"
    )
    
    def __repr__(self) -> str:
        return f"<AdvisorAssignment id={self.id} advisor={self.advisor_id} customer={self.customer_id} is_active={self.is_active}>"
