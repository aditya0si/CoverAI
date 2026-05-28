import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
import models
import schemas

vehicles_router = APIRouter(prefix="/vehicles", tags=["Vehicles"])

@vehicles_router.post("", response_model=schemas.VehicleOut, status_code=status.HTTP_201_CREATED)
async def create_vehicle(vehicle: schemas.VehicleCreate, db: AsyncSession = Depends(get_db)):
    # Verify owner exists
    owner = await db.get(models.User, vehicle.owner_id)
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Owner (user) not found.")
    
    # Verify unique VIN
    stmt = select(models.Vehicle).where(models.Vehicle.vin == vehicle.vin)
    existing_vehicle = (await db.execute(stmt)).scalar_one_or_none()
    if existing_vehicle:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A vehicle with this VIN already exists."
        )
    
    db_vehicle = models.Vehicle(**vehicle.model_dump())
    db.add(db_vehicle)
    await db.flush()
    return db_vehicle

@vehicles_router.get("", response_model=List[schemas.VehicleOut])
async def list_vehicles(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    stmt = select(models.Vehicle).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()

@vehicles_router.get("/{vehicle_id}", response_model=schemas.VehicleOut)
async def get_vehicle(vehicle_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    db_vehicle = await db.get(models.Vehicle, vehicle_id)
    if not db_vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    return db_vehicle

@vehicles_router.put("/{vehicle_id}", response_model=schemas.VehicleOut)
async def update_vehicle(vehicle_id: uuid.UUID, vehicle_update: schemas.VehicleUpdate, db: AsyncSession = Depends(get_db)):
    db_vehicle = await db.get(models.Vehicle, vehicle_id)
    if not db_vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    
    update_data = vehicle_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_vehicle, key, value)
    
    await db.flush()
    return db_vehicle

@vehicles_router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle(vehicle_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    db_vehicle = await db.get(models.Vehicle, vehicle_id)
    if not db_vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    
    await db.delete(db_vehicle)
    return None
