import uuid
import json
import logging
import base64
import time
from typing import Dict, Any, List
from sqlalchemy import select
import google.generativeai as genai

from core.config import settings
from core.database import SessionLocal
from core.storage import get_storage_backend, LocalStorageBackend, S3StorageBackend
import models

logger = logging.getLogger("uvicorn.error")

# Initialize Gemini client with the API key from settings
genai.configure(api_key=settings.GEMINI_API_KEY)

# Model names — using gemini-2.5-flash for speed/cost balance on structured tasks,
# gemini-2.5-pro-vision for image analysis (multimodal)
TRIAGE_MODEL  = "gemini-2.5-flash"
VISION_MODEL  = "gemini-2.5-flash"


def extract_relevant_policy_sections(text: str, claim_type: str) -> str:
    """
    Extract relevant clauses and terms from the policy extracted text
    based on keyword matching to focus the AI context.
    """
    if not text:
        return "No policy text available."
        
    keywords = ["coverage", "exclusion", "liability", "limit", "deductible", "clause"]
    
    claim_type_lower = str(claim_type).lower()
    if "own_damage" in claim_type_lower:
        keywords.extend(["own damage", "collision", "accidental", "bumper", "glass", "windshield", "scratch"])
    elif "third_party" in claim_type_lower:
        keywords.extend(["third party", "liability", "injury", "property damage", "lawsuit"])
    elif "theft" in claim_type_lower:
        keywords.extend(["theft", "stolen", "burglary", "missing", "key"])
    elif "natural_calamity" in claim_type_lower:
        keywords.extend(["calamity", "flood", "earthquake", "storm", "hurricane", "act of god"])
    elif "fire" in claim_type_lower:
        keywords.extend(["fire", "explosion", "self-ignition", "lightning"])

    lines = text.split("\n")
    relevant_lines = []
    for line in lines:
        if any(kw in line.lower() for kw in keywords):
            relevant_lines.append(line.strip())
            if len(relevant_lines) > 40:  # Cap to prevent too much context
                break
                
    if not relevant_lines:
        return text[:4000]  # Fallback to first 4000 chars
        
    return "\n".join(relevant_lines)


async def run_ai_triage(claim_id: uuid.UUID):
    """
    Background task to analyze the claim against the policy using Gemini.
    Saves results to the Claim model and logs metrics to the ai_call_logs table.
    """
    async with SessionLocal() as db:
        try:
            # 1. Fetch Claim and Policy
            claim = await db.get(models.Claim, claim_id)
            if not claim:
                logger.error(f"[AI Triage] Claim {claim_id} not found.")
                return
                
            # Check user consent
            user = await db.get(models.User, claim.claimant_id)
            if not user or not getattr(user, "ai_analysis_consent", True):
                logger.warning(
                    f"[AI Triage] Skipping triage for claim {claim_id} because user "
                    f"{claim.claimant_id} has not granted or has revoked AI analysis consent."
                )
                return
                
            policy = await db.get(models.Policy, claim.policy_id)
            if not policy:
                logger.error(f"[AI Triage] Policy {claim.policy_id} not found for Claim {claim_id}.")
                return
                
            # 2. Extract relevant policy text
            relevant_policy = extract_relevant_policy_sections(
                policy.extracted_text or "", claim.claim_type.value
            )
            
            # 3. Construct Gemini prompt
            prompt = (
                "You are an insurance claim analyst for Indian motor vehicle insurance. "
                "Analyze the claim against the policy and output a JSON object ONLY (no markdown, no explanation). "
                "The response must exactly match this JSON schema:\n"
                "{\n"
                "  \"risk_score\": 0.0-1.0,\n"
                "  \"coverage_assessment\": \"likely_covered | possibly_covered | likely_not_covered | unclear\",\n"
                "  \"key_policy_clauses\": [\"list of relevant clauses found in policy\"],\n"
                "  \"red_flags\": [\"any inconsistencies or suspicious indicators\"],\n"
                "  \"recommended_action\": \"auto_approve | standard_review | escalate | request_documents\",\n"
                "  \"summary_for_officer\": \"2-3 sentence plain English summary for the claims officer\"\n"
                "}\n\n"
                f"CLAIM DETAILS:\n"
                f"- Claim Type: {claim.claim_type.value}\n"
                f"- Incident Date: {claim.incident_date.isoformat()}\n"
                f"- Incident Location: {claim.incident_location}\n"
                f"- Incident Description: {claim.incident_description}\n"
                f"- Estimated Amount: {claim.estimated_amount}\n\n"
                f"RELEVANT POLICY CLAUSES:\n"
                f"{relevant_policy}"
            )
            
            # 4. Call Gemini with duration tracking
            start_time = time.time()
            model = genai.GenerativeModel(
                model_name=TRIAGE_MODEL,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.0,
                    response_mime_type="application/json",
                )
            )
            response = await model.generate_content_async(prompt)
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Increment Prometheus counter
            from core.metrics import ai_calls_total
            ai_calls_total.labels(service="triage", model=TRIAGE_MODEL).inc()
            
            # Extract response text and token usage
            raw_content = response.text
            usage = response.usage_metadata
            prompt_tokens    = getattr(usage, "prompt_token_count", len(prompt) // 4)
            completion_tokens = getattr(usage, "candidates_token_count", len(raw_content) // 4)
            
            # 5. Parse output and update database
            try:
                parsed_json = json.loads(raw_content)
                risk_score = float(parsed_json.get("risk_score", 0.5))
                
                claim.ai_risk_score = risk_score
                claim.ai_summary = raw_content
                logger.info(
                    f"[AI Triage] Claim {claim_id} triage completed. Risk score: {risk_score}"
                )
            except Exception as parse_err:
                logger.error(
                    f"[AI Triage] Failed to parse Gemini JSON response for Claim {claim_id}: {parse_err}"
                )
                # Save raw response as fallback so data isn't lost
                claim.ai_summary = raw_content
                claim.ai_risk_score = 0.5
                
            # 6. Save AICallLog
            log_record = models.AICallLog(
                claim_id=claim.id,
                policy_id=policy.id,
                service="triage",
                model=TRIAGE_MODEL,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                duration_ms=duration_ms
            )
            db.add(log_record)
            
            await db.commit()
            
        except Exception as err:
            logger.error(f"[AI Triage] Critical error during triage of claim {claim_id}: {err}")
            # Ensure background tasks never raise exceptions that disrupt request thread
            pass


async def get_image_bytes(storage_path: str) -> bytes:
    """
    Robust utility to retrieve raw file bytes from either local storage or AWS S3.
    """
    storage = get_storage_backend()
    if isinstance(storage, LocalStorageBackend):
        full_path = storage.base_dir / storage_path
        if not full_path.exists():
            raise FileNotFoundError(f"Local image file not found at: {full_path}")
        return full_path.read_bytes()
    elif isinstance(storage, S3StorageBackend):
        if storage.s3:
            s3_obj = storage.s3.get_object(Bucket=storage.bucket_name, Key=storage_path)
            return s3_obj['Body'].read()
        else:
            raise ValueError("S3 client not initialized on storage backend.")
    else:
        raise ValueError(f"Unsupported storage backend type: {type(storage)}")


async def run_image_ai_analysis(claim_image_id: uuid.UUID):
    """
    Background task to run vision analysis on a claim image using Gemini Vision.
    Updates claim image metadata, alerts officer if suspicious, and logs AI metrics.
    """
    async with SessionLocal() as db:
        try:
            # 1. Fetch Claim Image
            image = await db.get(models.ClaimImage, claim_image_id)
            if not image:
                logger.error(f"[AI Vision] Image {claim_image_id} not found.")
                return
                
            # Check user consent
            user = await db.get(models.User, image.uploaded_by)
            if not user or not getattr(user, "ai_analysis_consent", True):
                logger.warning(
                    f"[AI Vision] Skipping vision analysis for image {claim_image_id} because "
                    f"user {image.uploaded_by} has not granted or has revoked AI analysis consent."
                )
                return
                
            # 2. Retrieve image bytes and base64 encode them
            try:
                image_bytes = await get_image_bytes(image.storage_path)
            except Exception as io_err:
                logger.error(
                    f"[AI Vision] Failed to load image bytes for Image {claim_image_id}: {io_err}"
                )
                return
                
            # 3. Build Gemini multimodal prompt (text + inline image)
            vision_prompt = (
                "You are a motor vehicle damage assessor. Analyze this image and return a JSON object ONLY "
                "(no markdown, no explanation):\n"
                "{\n"
                "  \"damage_detected\": true|false,\n"
                "  \"damage_areas\": [\"list of damaged parts visible, e.g. front bumper, windshield\"],\n"
                "  \"damage_severity\": \"minor | moderate | severe | total_loss\",\n"
                "  \"confidence\": 0.0-1.0,\n"
                "  \"notes\": \"brief observation\"\n"
                "}"
            )

            # Gemini accepts inline image data directly
            image_part = {
                "mime_type": image.mime_type or "image/jpeg",
                "data": base64.b64encode(image_bytes).decode("utf-8")
            }
            
            # 4. Call Gemini Vision with duration tracking
            start_time = time.time()
            model = genai.GenerativeModel(
                model_name=VISION_MODEL,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.0,
                    response_mime_type="application/json",
                )
            )
            response = await model.generate_content_async([vision_prompt, image_part])
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Increment Prometheus counter
            from core.metrics import ai_calls_total
            ai_calls_total.labels(service="image", model=VISION_MODEL).inc()
            
            raw_content = response.text
            usage = response.usage_metadata
            prompt_tokens     = getattr(usage, "prompt_token_count", len(vision_prompt) // 4 + 1100)
            completion_tokens = getattr(usage, "candidates_token_count", len(raw_content) // 4)
            
            # 5. Parse response and update database
            try:
                parsed_json = json.loads(raw_content)
                damage_detected = parsed_json.get("damage_detected", False)
                confidence = float(parsed_json.get("confidence", 0.5))
                
                # Update image fields
                image.ai_damage_tags = parsed_json
                image.ai_damage_confidence = confidence
                
                # Suspect check: no damage detected with high confidence → flag for officer
                if not damage_detected and confidence > 0.8:
                    logger.warning(
                        f"[AI Vision] Suspect claim flagged: Image {claim_image_id} "
                        f"has no damage detected with high confidence!"
                    )
                    claim = await db.get(models.Claim, image.claim_id)
                    if claim:
                        if claim.ai_summary:
                            try:
                                summary_data = json.loads(claim.ai_summary)
                                if "red_flags" in summary_data:
                                    summary_data["red_flags"].append(
                                        f"Suspicious: image {image.id} shows no damage with high confidence."
                                    )
                                else:
                                    summary_data["red_flags"] = [
                                        f"Suspicious: image {image.id} shows no damage with high confidence."
                                    ]
                                claim.ai_summary = json.dumps(summary_data)
                            except Exception:
                                claim.ai_summary += (
                                    f"\n[RED FLAG] Suspicious: image {image.id} "
                                    f"shows no damage with high confidence."
                                )
                        else:
                            mock_summary = {
                                "risk_score": 1.0,
                                "coverage_assessment": "unclear",
                                "key_policy_clauses": [],
                                "red_flags": [
                                    f"Suspicious: image {image.id} shows no damage with high confidence."
                                ],
                                "recommended_action": "escalate",
                                "summary_for_officer": "Suspicious upload detected during vision check."
                            }
                            claim.ai_summary = json.dumps(mock_summary)
                            
                        # Boost risk score significantly
                        claim.ai_risk_score = 1.0
            except Exception as parse_err:
                logger.error(
                    f"[AI Vision] Failed to parse JSON response for Image {claim_image_id}: {parse_err}"
                )
                image.ai_damage_tags = {"raw_response": raw_content}
                image.ai_damage_confidence = 0.5
                
            # 6. Log AI Call
            log_record = models.AICallLog(
                claim_id=image.claim_id,
                policy_id=None,
                service="image",
                model=VISION_MODEL,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                duration_ms=duration_ms
            )
            db.add(log_record)
            
            await db.commit()
            logger.info(f"[AI Vision] Image analysis completed for Image {claim_image_id}.")
            
        except Exception as err:
            logger.error(
                f"[AI Vision] Critical error during vision analysis of image {claim_image_id}: {err}"
            )
            pass


async def notify_insurer(claim_id: uuid.UUID):
    """
    Background stub to log insurer claims notification.
    """
    logger.info(
        f"[Notification] NOTIFY INSURER: A new claim CLM-{claim_id} has been submitted "
        f"and is ready for officer assignment."
    )


async def notify_customer(claim_id: uuid.UUID, message: str):
    """
    Background stub to log customer notification regarding status change.
    """
    logger.info(f"[Notification] NOTIFY CUSTOMER: Claim {claim_id} update alert: '{message}'")
