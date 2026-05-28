import uuid
import time
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import google.generativeai as genai

from core.config import settings
from models import Policy, Conversation, Message, MessageRole, ContextType, AICallLog
from core.exceptions import NotFoundException, ForbiddenException

# Configure official Gemini SDK
genai.configure(api_key=settings.GEMINI_API_KEY)

SYSTEM_PROMPT = """You are an insurance policy assistant for Indian motor insurance. Answer only based on the policy document provided.
If the answer is not in the document, say "This information is not available in your policy document."
Use simple, plain English. Do not use legal jargon. If the user asks about a claim process, guide them step by step.
Always mention relevant policy numbers, coverage limits, or exclusions when applicable.
Never invent information. This is a regulated financial product."""


async def ask_policy_question(
    policy_id: uuid.UUID,
    question: str,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    db: AsyncSession
) -> AsyncGenerator[str, None]:
    """
    Asks a question about a policy's terms and streams the response using Gemini official SDK.
    Handles conversation creation, context loading (last 6 messages), system prompts,
    and database persistence of messages.
    """
    # 1. Load policy and verify ownership
    policy = await db.get(Policy, policy_id)
    if not policy:
        raise NotFoundException("Policy not found.")
        
    if policy.user_id != user_id:
        raise NotFoundException("Policy not found or not owned by user.")

    # 2. Get or create conversation
    if conversation_id is None:
        conversation = Conversation(
            user_id=user_id,
            policy_id=policy_id,
            context_type=ContextType.policy_qa
        )
        db.add(conversation)
        await db.flush()
        conversation_id = conversation.id
    else:
        # Verify conversation exists and belongs to the user
        conversation = await db.get(Conversation, conversation_id)
        if not conversation or conversation.user_id != user_id:
            raise NotFoundException("Conversation not found.")

    # 3. Load last 6 messages for context
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(6)
    )
    result = await db.execute(stmt)
    history_messages = result.scalars().all()
    # History loaded desc, reverse to make it chronological (asc)
    history_messages.reverse()

    # 4. Construct Gemini Contents History
    contents = []
    for msg in history_messages:
        role = "user" if msg.role == MessageRole.user else "model"
        contents.append({
            "role": role,
            "parts": [msg.content]
        })

    # Add the current user query
    contents.append({
        "role": "user",
        "parts": [question]
    })

    # Track call performance
    start_time = time.time()

    # 5. Initialize Model with custom system instruction and temperature
    system_instruction = f"{SYSTEM_PROMPT}\n\nPOLICY DOCUMENT EXTRACT:\n{policy.extracted_text or 'No policy document text available.'}"
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=system_instruction,
        generation_config={"temperature": 0.0}
    )

    # 6. Stream content asynchronously
    response = await model.generate_content_async(contents, stream=True)
    full_response_text = ""
    async for chunk in response:
        if chunk.text:
            full_response_text += chunk.text
            yield chunk.text

    duration_ms = int((time.time() - start_time) * 1000)

    # 7. Save the message history to the database after streaming completes
    user_msg = Message(
        conversation_id=conversation_id,
        role=MessageRole.user,
        content=question
    )
    assistant_msg = Message(
        conversation_id=conversation_id,
        role=MessageRole.assistant,
        content=full_response_text
    )
    
    db.add(user_msg)
    db.add(assistant_msg)
    
    # Log the AI call in db
    prompt_str = str(contents)
    prompt_tokens = len(prompt_str) // 4
    completion_tokens = len(full_response_text) // 4
    
    ai_call_log = AICallLog(
        claim_id=None,
        policy_id=policy_id,
        service="qa",
        model="gemini-2.5-flash",
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        duration_ms=duration_ms
    )
    db.add(ai_call_log)
    
    await db.flush()  # flush changes to database
