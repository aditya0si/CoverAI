import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base

class AICallLog(Base):
    __tablename__ = "ai_call_logs"
    
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    claim_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("claims.id", ondelete="SET NULL"),
        index=True,
        nullable=True
    )
    policy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("policies.id", ondelete="SET NULL"),
        index=True,
        nullable=True
    )
    
    service: Mapped[str] = mapped_column(String(100), nullable=False) # e.g. triage, image, qa
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        server_default=text("now()"),
        nullable=False
    )
    
    # Relationships
    claim = relationship("Claim", foreign_keys=[claim_id])
    policy = relationship("Policy", foreign_keys=[policy_id])
    
    def __repr__(self) -> str:
        return f"<AICallLog service={self.service} model={self.model} duration={self.duration_ms}ms>"
