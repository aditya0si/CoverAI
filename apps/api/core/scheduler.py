import logging
import uuid
from datetime import datetime, timedelta
from sqlalchemy import select, delete, update, func
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from core.database import SessionLocal
from core.storage import get_storage_backend
from core.audit import log_action
from core.encryption import encrypt
import models

logger = logging.getLogger("uvicorn.error")

scheduler = AsyncIOScheduler()

async def run_data_minimization_expired_policies():
    """
    Every Sunday, delete extracted_text from policies older than 2 years AND with status=expired.
    """
    two_years_ago = datetime.utcnow() - timedelta(days=2 * 365)
    async with SessionLocal() as db:
        try:
            stmt = (
                update(models.Policy)
                .where(
                    models.Policy.status == models.PolicyStatus.expired,
                    models.Policy.end_date < two_years_ago,
                    models.Policy.extracted_text != None
                )
                .values(extracted_text=None)
            )
            res = await db.execute(stmt)
            await db.commit()
            logger.info(f"[Data Minimization] Policy text cleanup finished: {res.rowcount} policies minified.")
        except Exception as e:
            logger.error(f"[Data Minimization] Failed running policy text cleanup: {e}")

async def run_data_minimization_old_messages():
    """
    Every Sunday, delete conversation messages older than 1 year (preserving count on conversation level).
    """
    one_year_ago = datetime.utcnow() - timedelta(days=365)
    async with SessionLocal() as db:
        try:
            # 1. Update message count for conversations that have messages older than 1 year
            stmt_conv = select(
                models.Message.conversation_id, 
                func.count(models.Message.id).label("count")
            ).where(
                models.Message.created_at < one_year_ago
            ).group_by(models.Message.conversation_id)
            
            res_conv = await db.execute(stmt_conv)
            conv_counts = res_conv.all()
            
            for conv_id, count in conv_counts:
                stmt_update = (
                    update(models.Conversation)
                    .where(models.Conversation.id == conv_id)
                    .values(message_count=models.Conversation.message_count + count)
                )
                await db.execute(stmt_update)
                
            # 2. Delete messages older than 1 year
            stmt_del = delete(models.Message).where(models.Message.created_at < one_year_ago)
            res_del = await db.execute(stmt_del)
            
            await db.commit()
            logger.info(f"[Data Minimization] Old messages cleanup finished: {res_del.rowcount} messages deleted.")
        except Exception as e:
            logger.error(f"[Data Minimization] Failed running message cleanup: {e}")

async def run_data_deletion_grace_period():
    """
    Daily check for pending DataDeletionRequest records that are older than 30 days.
    Under Section 12 of DPDP, this implements the final erasure by:
    - Anonymizing user profile details (email, full name, phone).
    - Nulling out policy extracted_text.
    - Nulling out claim descriptions.
    - Deleting physical claim images from storage.
    - Retaining audit logs (regulatory requirements for 7 years).
    """
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    async with SessionLocal() as db:
        try:
            stmt = select(models.DataDeletionRequest).where(
                models.DataDeletionRequest.status == models.DeletionStatus.pending,
                models.DataDeletionRequest.requested_at < thirty_days_ago
            )
            result = await db.execute(stmt)
            requests = result.scalars().all()
            
            if not requests:
                logger.info("[Scheduler Deletion] No pending DPDP deletion requests eligible for erasure today.")
                return
                
            storage = get_storage_backend()
            
            for req in requests:
                user_id = req.user_id
                user = await db.get(models.User, user_id)
                if not user:
                    req.status = models.DeletionStatus.processed
                    req.processed_at = datetime.utcnow()
                    continue
                
                logger.info(f"[Scheduler Deletion] Commencing final DPDP erasure for user {user_id}.")
                
                # 1. Anonymize user details
                anon_id = uuid.uuid4().hex[:8]
                user.full_name = "Anonymized User"
                user.email = f"deleted_{anon_id}@anonymized.coverai.com"
                user.phone = "0000000000"  # Will transparently encrypt
                user.phone_hash = f"anon_{uuid.uuid4().hex}"
                user.is_active = False
                user.is_verified = False
                
                # 2. Null out policy extracted_text
                stmt_policy = (
                    update(models.Policy)
                    .where(models.Policy.user_id == user_id)
                    .values(extracted_text=None)
                )
                await db.execute(stmt_policy)
                
                # 3. Anonymize claims and delete physical images from storage
                stmt_claims = select(models.Claim).where(models.Claim.claimant_id == user_id)
                res_claims = await db.execute(stmt_claims)
                claims = res_claims.scalars().all()
                
                for c in claims:
                    c.incident_description = "Deleted as per DPDP account erasure request."
                    c.incident_location = "Anonymized"
                    
                    # Fetch and delete claim images
                    stmt_images = select(models.ClaimImage).where(models.ClaimImage.claim_id == c.id)
                    res_images = await db.execute(stmt_images)
                    images = res_images.scalars().all()
                    
                    for img in images:
                        try:
                            storage.delete(img.storage_path)
                        except Exception as storage_err:
                            logger.error(f"[Scheduler Deletion] Failed to delete file {img.storage_path} from storage: {storage_err}")
                        
                        await db.delete(img)
                
                # Mark request as processed
                req.status = models.DeletionStatus.processed
                req.processed_at = datetime.utcnow()
                
                # Log action to audit trails (system actor)
                await log_action(
                    db=db,
                    actor_id=None,
                    action="ANONYMIZE_USER_DPDP",
                    resource_type="user",
                    resource_id=user_id,
                    after_state={"status": "erased_and_anonymized"}
                )
                
                logger.info(f"[Scheduler Deletion] Successfully anonymized user {user_id} and cleared personal metadata.")
                
            await db.commit()
            
        except Exception as e:
            logger.error(f"[Scheduler Deletion] Error executing grace deletion task: {e}")

def init_scheduler():
    """
    Initializes and starts the automated cron scheduler.
    """
    # Minimization tasks: Every Sunday at midnight (00:00)
    scheduler.add_job(
        run_data_minimization_expired_policies,
        "cron",
        day_of_week="sun",
        hour=0,
        minute=0,
        id="policy_minimization",
        replace_existing=True
    )
    scheduler.add_job(
        run_data_minimization_old_messages,
        "cron",
        day_of_week="sun",
        hour=0,
        minute=0,
        id="message_minimization",
        replace_existing=True
    )
    
    # Grace deletion tasks: Every day at 01:00 AM
    scheduler.add_job(
        run_data_deletion_grace_period,
        "cron",
        hour=1,
        minute=0,
        id="deletion_grace_anonymization",
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("[Scheduler] Automated DPDP Retention and Minimization scheduler started successfully.")
