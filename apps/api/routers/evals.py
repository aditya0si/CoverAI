import uuid
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import require_role
import models
from services.eval_service import evaluate_rag_response, EvalResult
from services.qa_service import ask_policy_question

evals_router = APIRouter(prefix="/evals", tags=["Evaluations"])

class EvalRequest(BaseModel):
    policy_id: uuid.UUID
    question: str
    expected_answer: str

class EvalResponse(BaseModel):
    actual_answer: str
    score: int
    reasoning: str

@evals_router.post("/run", response_model=EvalResponse)
async def run_evaluation(
    request: EvalRequest,
    current_user: models.User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db)
):
    """
    Run an LLM-as-a-judge evaluation for a specific policy question.
    Only accessible by admins.
    """
    # 1. Ask the AI the question via the RAG pipeline
    # We use a temporary conversation (None)
    # Note: ask_policy_question returns an AsyncGenerator because of streaming,
    # so we iterate over it to get the full answer.
    try:
        generator = await ask_policy_question(
            policy_id=request.policy_id,
            question=request.question,
            user_id=current_user.id,
            conversation_id=None,
            db=db
        )
        
        actual_answer = ""
        async for chunk in generator:
            actual_answer += chunk
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate answer: {e}")
        
    # 2. Run the evaluation
    eval_result = await evaluate_rag_response(
        question=request.question,
        expected_answer=request.expected_answer,
        actual_answer=actual_answer
    )
    
    return EvalResponse(
        actual_answer=actual_answer,
        score=eval_result.score,
        reasoning=eval_result.reasoning
    )
