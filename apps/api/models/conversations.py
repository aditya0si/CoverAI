import enum
import uuid
from datetime import datetime
from sqlalchemy import Enum, DateTime, text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base

class ContextType(str, enum.Enum):
    policy_qa = "policy_qa"
    claim_guidance = "claim_guidance"
    general = "general"

class Conversation(Base):
    __tablename__ = "conversations"
    
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
    policy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("policies.id", ondelete="SET NULL"),
        index=True,
        nullable=True
    )
    claim_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("claims.id", ondelete="SET NULL"),
        index=True,
        nullable=True
    )
    
    context_type: Mapped[ContextType] = mapped_column(
        Enum(ContextType, name="context_type_enum"),
        default=ContextType.general,
        nullable=False
    )
    message_count: Mapped[int] = mapped_column(default=0, server_default=text("0"), nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        server_default=text("now()"),
        nullable=False
    )
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="conversations")
    policy: Mapped["Policy"] = relationship(back_populates="conversations")
    claim: Mapped["Claim"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Conversation {self.id} (context={self.context_type.value})>"
