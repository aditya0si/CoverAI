import hashlib
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
import models

async def get_current_user(db: AsyncSession = Depends(get_db)) -> models.User:
    """
    Placeholder authentication dependency for Phase 2.
    Queries the database for 'customer@coverai.com'. 
    If not seeded or missing, dynamically creates and returns a customer user.
    """
    # 1. Look up standard seeded customer account
    stmt = select(models.User).where(models.User.email == "customer@coverai.com")
    user = (await db.execute(stmt)).scalar_one_or_none()
    if user:
        return user

    # 2. Fallback: get first available customer role
    stmt = select(models.User).where(models.User.role == models.UserRole.customer)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if user:
        return user

    # 3. Dynamic self-healing: create the customer user record instantly
    hashed_password = hashlib.sha256("Password123!".encode()).hexdigest()
    new_user = models.User(
        email="customer@coverai.com",
        phone="+919999999992",
        hashed_password=hashed_password,
        role=models.UserRole.customer,
        full_name="Alice Customer",
        is_active=True,
        is_verified=True
    )
    db.add(new_user)
    await db.flush()
    return new_user
