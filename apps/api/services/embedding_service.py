import uuid
import logging
from typing import List
import google.generativeai as genai

from core.config import settings
from core.database import SessionLocal
from models import Policy, PolicyChunk

logger = logging.getLogger("uvicorn.error")

genai.configure(api_key=settings.GEMINI_API_KEY)
EMBEDDING_MODEL = "models/text-embedding-004"

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 100) -> List[str]:
    """
    Split text into chunks of approximately `chunk_size` characters,
    with an overlap of `overlap` characters.
    """
    if not text:
        return []
        
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = ""
    
    for para in paragraphs:
        if len(current_chunk) + len(para) > chunk_size and current_chunk:
            chunks.append(current_chunk.strip())
            # Keep the last `overlap` characters for context
            current_chunk = current_chunk[-overlap:] + "\n\n" + para
        else:
            if current_chunk:
                current_chunk += "\n\n" + para
            else:
                current_chunk = para
                
    if current_chunk:
        chunks.append(current_chunk.strip())
        
    return chunks

async def generate_and_store_embeddings(policy_id: uuid.UUID):
    """
    Background task to chunk policy text and store embeddings using Gemini.
    """
    async with SessionLocal() as db:
        try:
            policy = await db.get(Policy, policy_id)
            if not policy or not policy.extracted_text:
                logger.error(f"[Embedding Service] Policy {policy_id} not found or has no text.")
                return
                
            logger.info(f"[Embedding Service] Starting embedding generation for Policy {policy_id}")
            
            chunks = chunk_text(policy.extracted_text)
            
            if not chunks:
                logger.warning(f"[Embedding Service] No chunks generated for Policy {policy_id}.")
                return
            
            # Delete existing chunks for this policy if any (idempotency)
            from sqlalchemy import delete
            await db.execute(delete(PolicyChunk).where(PolicyChunk.policy_id == policy_id))
            
            # Generate embeddings in bulk
            result = genai.embed_content(
                model=EMBEDDING_MODEL,
                content=chunks,
                task_type="retrieval_document"
            )
            embeddings = result['embedding']
            
            # Save chunks to DB
            chunk_records = []
            for i, (chunk_text_content, embedding_vector) in enumerate(zip(chunks, embeddings)):
                record = PolicyChunk(
                    policy_id=policy_id,
                    chunk_index=i,
                    content=chunk_text_content,
                    embedding=embedding_vector
                )
                chunk_records.append(record)
                
            db.add_all(chunk_records)
            policy.embedding_model_version = EMBEDDING_MODEL
            
            await db.commit()
            logger.info(f"[Embedding Service] Successfully stored {len(chunk_records)} chunks for Policy {policy_id}")
            
        except Exception as err:
            logger.error(f"[Embedding Service] Error generating embeddings for Policy {policy_id}: {err}")
