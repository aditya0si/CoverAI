import uuid
from typing import Optional
from pydantic import Field
from schemas import BaseSchema
from models.conversations import ContextType

class ConversationCreate(BaseSchema):
    """Schema to initialize a new conversation workspace, with optional context binding."""
    policy_id: Optional[uuid.UUID] = None
    claim_id: Optional[uuid.UUID] = None
    context_type: Optional[ContextType] = ContextType.general


class ConversationCreateOut(BaseSchema):
    """Response returned upon successful creation of a new conversation."""
    conversation_id: uuid.UUID


class MessageCreate(BaseSchema):
    """Payload representing a user's question sent to a conversation context."""
    question: str = Field(..., min_length=1, description="The insurance policy question to ask the AI.")
