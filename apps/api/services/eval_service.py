import google.generativeai as genai
import json
from pydantic import BaseModel
from core.config import settings

genai.configure(api_key=settings.GEMINI_API_KEY)

JUDGE_PROMPT = """
You are an impartial AI judge. You will be provided with:
1. A Question
2. An Expected Answer
3. The Actual Answer provided by an AI Agent

Your job is to evaluate the Actual Answer based on:
- Faithfulness: Does it avoid hallucinating information not present in the Expected Answer or Context?
- Relevance: Does it directly answer the user's Question?

Score the Actual Answer from 1 to 5, where 5 is perfect.
Respond in valid JSON format with the following structure:
{
    "score": <int>,
    "reasoning": "<string>"
}
"""

class EvalResult(BaseModel):
    score: int
    reasoning: str

async def evaluate_rag_response(question: str, expected_answer: str, actual_answer: str) -> EvalResult:
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=JUDGE_PROMPT,
        generation_config={"response_mime_type": "application/json", "temperature": 0.0}
    )
    
    prompt = f"Question: {question}\nExpected Answer: {expected_answer}\nActual Answer: {actual_answer}"
    
    # We use stream=False because it's a short JSON response
    response = await model.generate_content_async(prompt)
    
    try:
        data = json.loads(response.text)
        return EvalResult(score=data.get("score", 1), reasoning=data.get("reasoning", "Failed to parse"))
    except Exception as e:
        return EvalResult(score=1, reasoning=f"Parse error: {e}")
