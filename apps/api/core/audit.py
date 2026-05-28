import uuid
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Request
import models

async def log_action(
    db: AsyncSession,
    actor_id: Optional[uuid.UUID],
    action: str,
    resource_type: str,
    resource_id: Optional[uuid.UUID],
    before_state: Optional[Dict[str, Any]] = None,
    after_state: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None
):
    """
    Asynchronously logs a user action to the audit_logs table.
    
    Args:
        db: The async database session.
        actor_id: The UUID of the user performing the action (nullable for public endpoints like register/login).
        action: The string descriptor of the action (e.g., 'LOGIN', 'REGISTER', 'UPLOAD_POLICY').
        resource_type: The table or domain resource type affected (e.g., 'user', 'policy', 'claim').
        resource_id: The UUID of the resource created or modified.
        before_state: Dict representation of the resource state before the action.
        after_state: Dict representation of the resource state after the action.
        request: Optional FastAPI Request object to automatically extract client IP address.
    """
    ip_address = None
    if request:
        # Check standard headers for proxy configurations first, fallback to client host
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            ip_address = forwarded.split(",")[0].strip()
        elif request.client:
            ip_address = request.client.host
            
    audit_log = models.AuditLog(
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        before_state=before_state,
        after_state=after_state,
        ip_address=ip_address
    )
    db.add(audit_log)
    await db.flush()  # Enforce persistence queueing within current transaction
