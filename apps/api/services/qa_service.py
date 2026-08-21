import uuid
import time
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import google.generativeai as genai

from core.config import settings
from models import Policy, Conversation, Message, MessageRole, ContextType, AICallLog, PolicyChunk, Claim

# Configure official Gemini SDK
genai.configure(api_key=settings.GEMINI_API_KEY)

SYSTEM_PROMPT = """You are an insurance policy assistant for Indian motor insurance. Answer only based on the policy document provided.
If the answer is not in the document, say "This information is not available in your policy document."
Use simple, plain English. Do not use legal jargon. If the user asks about a claim process, guide them step by step.
Always mention relevant policy numbers, coverage limits, or exclusions when applicable.
Never invent information. This is a regulated financial product."""


async def get_claim_status_tool(claim_number: str, db: AsyncSession, user_id: uuid.UUID) -> str:
    """Gets the current status and details of a filed insurance claim by its claim number."""
    stmt = select(Claim).where(Claim.claim_number == claim_number).where(Claim.claimant_id == user_id)
    result = await db.execute(stmt)
    claim = result.scalar_one_or_none()
    
    if not claim:
        return f"No claim found with number {claim_number} for this user."
    
    return f"Claim {claim_number} is currently '{claim.status.value}'. Filed on {claim.incident_date}. Estimated Amount: {claim.estimated_amount}. Claim Type: {claim.claim_type.value}."

# Define the tool schema for Gemini
claim_status_tool_schema = {
    "function_declarations": [
        {
            "name": "get_claim_status",
            "description": "Gets the current status and details of a filed insurance claim by its claim number.",
            "parameters": {
                "type": "object",
                "properties": {
                    "claim_number": {
                        "type": "string",
                        "description": "The claim number, usually starting with CLM- e.g. CLM-123456"
                    }
                },
                "required": ["claim_number"]
            }
        }
    ]
}


async def ask_policy_question(
    policy_id: uuid.UUID,
    question: str,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    db: AsyncSession
) -> AsyncGenerator[str, None]:
    """
    Asks a question about a policy's terms and streams the response using Gemini official SDK.
    Handles conversation creation, RAG semantic search over policy chunks,
    agentic tool calling for claim status, and database persistence of messages.
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
    history_messages = list(result.scalars().all())
    history_messages.reverse()

    contents = []
    for msg in history_messages:
        role = "user" if msg.role == MessageRole.user else "model"
        contents.append({"role": role, "parts": [msg.content]})

    # 4. RAG: Embed the query and search Vector DB
    # We embed the current question to find relevant chunks.
    query_embedding_result = genai.embed_content(
        model="models/text-embedding-004",
        content=question,
        task_type="retrieval_query"
    )
    query_embedding = query_embedding_result['embedding']
    
    # Query vector database using L2 distance (or cosine similarity via <=>)
    # Using cosine distance <=> here
    chunk_stmt = (
        select(PolicyChunk)
        .where(PolicyChunk.policy_id == policy_id)
        .order_by(PolicyChunk.embedding.cosine_distance(query_embedding))
        .limit(5)
    )
    chunk_result = await db.execute(chunk_stmt)
    top_chunks = chunk_result.scalars().all()
    
    context_text = "\n\n...\n\n".join([chunk.content for chunk in top_chunks])
    
    if not context_text:
        context_text = "No policy document chunks available."

    # Add the current user query
    contents.append({"role": "user", "parts": [question]})

    start_time = time.time()

    # 5. Initialize Model with Agent Tools and RAG Context
    system_instruction = f"{SYSTEM_PROMPT}\n\nRELEVANT POLICY DOCUMENT EXTRACTS:\n{context_text}"
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=system_instruction,
        tools=claim_status_tool_schema,
        generation_config={"temperature": 0.0}
    )

    # 6. Stream content asynchronously, handle Tool Calling
    chat = model.start_chat(history=contents[:-1])
    # Send message, if function call is returned, handle it
    response = chat.send_message(question, stream=False)
    
    full_response_text = ""
    
    # Check if a function call was requested
    if response.parts and hasattr(response.parts[0], 'function_call') and response.parts[0].function_call:
        fc = response.parts[0].function_call
        if fc.name == "get_claim_status":
            claim_num = fc.args.get("claim_number")
            # Execute tool
            tool_result = await get_claim_status_tool(claim_num, db, user_id)
            
            # Send result back to model
            response = chat.send_message(
                {"role": "function", "parts": [{"function_response": {"name": "get_claim_status", "response": {"result": tool_result}}}]},
                stream=True
            )
            
            async for chunk in response:
                if chunk.text:
                    full_response_text += chunk.text
                    yield chunk.text
    else:
        # Standard text response, but wait, `send_message` with `stream=False` was already executed.
        # We can just yield the text.
        full_response_text = response.text
        # Fake streaming it out to match the generator interface
        # In a real app we would use send_message(stream=True) but tools + streaming is complex.
        yield full_response_text

    duration_ms = int((time.time() - start_time) * 1000)

    # 7. Save the message history
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
    
    prompt_tokens = 0
    completion_tokens = 0
    if hasattr(response, 'usage_metadata'):
        prompt_tokens = response.usage_metadata.prompt_token_count
        completion_tokens = response.usage_metadata.candidates_token_count
    
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
    
    await db.flush()
