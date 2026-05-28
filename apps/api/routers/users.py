import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
import models
import schemas

users_router = APIRouter(prefix="/users", tags=["Users"])

@users_router.post("", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(user: schemas.UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    stmt = select(models.User).where(models.User.email == user.email)
    existing_user = (await db.execute(stmt)).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )
    
    db_user = models.User(**user.model_dump())
    db.add(db_user)
    await db.flush()  # populate ID
    return db_user

@users_router.get("", response_model=List[schemas.UserOut])
async def list_users(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    stmt = select(models.User).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()

@users_router.get("/{user_id}", response_model=schemas.UserOut)
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    db_user = await db.get(models.User, user_id)
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return db_user

@users_router.put("/{user_id}", response_model=schemas.UserOut)
async def update_user(user_id: uuid.UUID, user_update: schemas.UserUpdate, db: AsyncSession = Depends(get_db)):
    db_user = await db.get(models.User, user_id)
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    
    update_data = user_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_user, key, value)
    
    await db.flush()
    return db_user

@users_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    db_user = await db.get(models.User, user_id)
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    
    await db.delete(db_user)
    return None
