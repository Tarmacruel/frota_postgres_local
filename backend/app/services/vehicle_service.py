from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.location_history import LocationHistory
from app.models.vehicle import Vehicle, VehicleStatus
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.vehicle import VehicleCreate, VehicleUpdate


class VehicleService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.vehicles = VehicleRepository(db)

    async def list(self, skip: int, limit: int, status_filter: VehicleStatus | None):
        vehicles = await self.vehicles.list(skip=skip, limit=limit, status=status_filter)
        for vehicle in vehicles:
            active = await self.vehicles.get_active_history(vehicle.id)
            possession = await self.vehicles.get_active_possession(vehicle.id)
            vehicle.current_department = active.department if active else None
            vehicle.current_driver_name = possession.driver_name if possession else None
        return vehicles

    async def get_history(self, vehicle_id: UUID):
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")
        return await self.vehicles.list_history(vehicle_id)

    async def create(self, data: VehicleCreate) -> Vehicle:
        existing = await self.vehicles.get_by_plate(data.plate.upper())
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Placa ja cadastrada")

        vehicle = Vehicle(
            plate=data.plate.upper().strip(),
            brand=data.brand.strip(),
            model=data.model.strip(),
            status=data.status,
        )
        history = LocationHistory(department=data.department.strip())

        try:
            vehicle = await self.vehicles.create(vehicle)
            history.vehicle_id = vehicle.id
            await self.vehicles.create_history(history)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel criar o veiculo") from exc

        active = await self.vehicles.get_active_history(vehicle.id)
        vehicle.current_department = active.department if active else None
        vehicle.current_driver_name = None
        return vehicle

    async def update(self, vehicle_id: UUID, data: VehicleUpdate) -> Vehicle:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")

        if data.plate and data.plate.upper().strip() != vehicle.plate:
            duplicate = await self.vehicles.get_by_plate(data.plate.upper().strip())
            if duplicate and duplicate.id != vehicle.id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Placa ja cadastrada")

        try:
            if data.plate is not None:
                vehicle.plate = data.plate.upper().strip()
            if data.brand is not None:
                vehicle.brand = data.brand.strip()
            if data.model is not None:
                vehicle.model = data.model.strip()
            if data.status is not None:
                vehicle.status = data.status

            if data.department is not None:
                active = await self.vehicles.get_active_history(vehicle.id)
                current_department = active.department if active else None
                if current_department != data.department.strip():
                    if active:
                        active.end_date = datetime.now(timezone.utc)
                    new_history = LocationHistory(vehicle_id=vehicle.id, department=data.department.strip())
                    await self.vehicles.create_history(new_history)

            await self.db.flush()
            await self.db.refresh(vehicle)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel atualizar o veiculo") from exc

        active = await self.vehicles.get_active_history(vehicle.id)
        possession = await self.vehicles.get_active_possession(vehicle.id)
        vehicle.current_department = active.department if active else None
        vehicle.current_driver_name = possession.driver_name if possession else None
        return vehicle

    async def delete(self, vehicle_id: UUID) -> None:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")

        try:
            await self.vehicles.delete(vehicle)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel remover o veiculo") from exc
