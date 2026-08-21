import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
from core.database import Base

class PolicyChunk(Base):
    __tablename__ = "policy_chunks"
    
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    policy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("policies.id", ondelete="CASCADE"),
        index=True,
        nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(nullable=False)
    content: Mapped[str] = mapped_column(nullable=False)
    
    # Gemini text-embedding-004 has 768 dimensions
    embedding = mapped_column(Vector(768))
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        server_default=text("now()"),
        nullable=False
    )
    
    # Relationships
    policy: Mapped["Policy"] = relationship(back_populates="chunks")
    
    def __repr__(self) -> str:
        return f"<PolicyChunk {self.policy_id} - {self.chunk_index}>"
