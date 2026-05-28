import uuid
from typing import List
from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.security import get_current_user
from core.exceptions import NotFoundException, CoverAIException
from services.qa_service import ask_policy_question
import models
from schemas.conversation import ConversationCreate, ConversationCreateOut, MessageCreate

conversations_router = APIRouter(prefix="/conversations", tags=["Conversations"])

@conversations_router.post("", response_model=ConversationCreateOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Initializes a new conversation session workspace for Q&A."""
    # Validate optional policy association
    if payload.policy_id:
        policy = await db.get(models.Policy, payload.policy_id)
        if not policy or policy.user_id != current_user.id:
            raise NotFoundException("Policy not found.")

    # Validate optional claim association
    if payload.claim_id:
        claim = await db.get(models.Claim, payload.claim_id)
        if not claim or claim.claimant_id != current_user.id:
            raise NotFoundException("Claim not found.")

    db_conversation = models.Conversation(
        user_id=current_user.id,
        policy_id=payload.policy_id,
        claim_id=payload.claim_id,
        context_type=payload.context_type or models.ContextType.general
    )
    db.add(db_conversation)
    await db.flush()
    
    return {"conversation_id": db_conversation.id}


@conversations_router.get("/policy/{policy_id}", response_model=ConversationCreateOut)
async def get_policy_conversation(
    policy_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves an existing conversation session for a policy context."""
    stmt = (
        select(models.Conversation)
        .where(
            models.Conversation.policy_id == policy_id,
            models.Conversation.user_id == current_user.id
        )
        .order_by(models.Conversation.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise NotFoundException("No conversation found for this policy.")
    
    return {"conversation_id": conversation.id}


@conversations_router.get("/{conversation_id}/messages", response_model=List[dict])
async def get_conversation_messages(
    conversation_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves all past messages in a conversation session."""
    conversation = await db.get(models.Conversation, conversation_id)
    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundException("Conversation not found.")

    stmt = (
        select(models.Message)
        .where(models.Message.conversation_id == conversation_id)
        .order_by(models.Message.created_at.asc())
    )
    result = await db.execute(stmt)
    messages = result.scalars().all()

    return [
        {
            "id": str(msg.id),
            "role": msg.role.value,
            "content": msg.content,
            "created_at": msg.created_at.isoformat()
        }
        for msg in messages
    ]


@conversations_router.post("/{conversation_id}/messages")
async def ask_conversation_question(
    conversation_id: uuid.UUID,
    payload: MessageCreate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submits a question to a conversation session and streams responses 
    back via Server-Sent Events (SSE) using the format data: {chunk}\n\n.
    """
    # 1. Load conversation and verify ownership
    conversation = await db.get(models.Conversation, conversation_id)
    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundException("Conversation not found.")

    if not conversation.policy_id:
        raise CoverAIException("This conversation has no policy bound to it.", status_code=400, error_code="BAD_REQUEST")

    async def event_generator():
        try:
            # Yield streaming tokens using the Q&A service
            async for token in ask_policy_question(
                policy_id=conversation.policy_id,
                question=payload.question,
                user_id=current_user.id,
                conversation_id=conversation_id,
                db=db
            ):
                yield f"data: {token}\n\n"
            # Final event indicating completion
            yield "data: [DONE]\n\n"
        except Exception as e:
            # Output structured SSE error message in event of failures
            yield f"data: Error: {str(e)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
