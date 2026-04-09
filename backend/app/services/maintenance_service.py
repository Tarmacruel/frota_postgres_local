from __future__ import annotations

from datetime import datetime
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.maintenance import MaintenanceRecord
from app.models.user import User
from app.repositories.maintenance_repository import MaintenanceRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.maintenance import MaintenanceCreate, MaintenanceUpdate
from app.services.audit_service import AuditService


class MaintenanceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.records = MaintenanceRepository(db)
        self.vehicles = VehicleRepository(db)
        self.audit = AuditService(db)

    async def list(
        self,
        vehicle_id: UUID | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[dict]:
        records = await self.records.list(vehicle_id=vehicle_id, start=start, end=end)
        return [self._serialize(record) for record in records]

    async def get(self, record_id: UUID) -> dict:
        record = await self.records.get_by_id(record_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de manutencao nao encontrado")
        return self._serialize(record)

    async def create(self, data: MaintenanceCreate, current_user: User) -> dict:
        await self._ensure_vehicle_exists(data.vehicle_id)

        record = MaintenanceRecord(
            vehicle_id=data.vehicle_id,
            start_date=data.start_date,
            end_date=data.end_date,
            service_description=data.service_description,
            parts_replaced=data.parts_replaced,
            total_cost=data.total_cost,
            created_by=current_user.id,
        )

        try:
            await self.records.create(record)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="MAINTENANCE",
                entity_id=record.id,
                entity_label=f"{record.vehicle.plate if record.vehicle else data.vehicle_id} - {record.service_description[:60]}",
                details={
                    "vehicle_id": str(record.vehicle_id),
                    "service_description": record.service_description,
                    "parts_replaced": record.parts_replaced,
                    "total_cost": str(record.total_cost),
                    "start_date": record.start_date.isoformat(),
                    "end_date": record.end_date.isoformat() if record.end_date else None,
                },
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel registrar a manutencao") from exc

        return await self.get(record.id)

    async def update(self, record_id: UUID, data: MaintenanceUpdate, current_user: User) -> dict:
        record = await self.records.get_by_id(record_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de manutencao nao encontrado")

        payload = data.model_dump(exclude_unset=True)
        previous_values = {
            "service_description": record.service_description,
            "parts_replaced": record.parts_replaced,
            "total_cost": str(record.total_cost),
            "end_date": record.end_date.isoformat() if record.end_date else None,
        }
        next_end_date = payload["end_date"] if "end_date" in payload else record.end_date
        if next_end_date and next_end_date < record.start_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data final nao pode ser anterior a data inicial")

        for field, value in payload.items():
            setattr(record, field, value)

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="MAINTENANCE",
                entity_id=record.id,
                entity_label=f"{record.vehicle.plate if record.vehicle else record.vehicle_id} - {record.service_description[:60]}",
                details={
                    "before": previous_values,
                    "after": {
                        "service_description": record.service_description,
                        "parts_replaced": record.parts_replaced,
                        "total_cost": str(record.total_cost),
                        "end_date": record.end_date.isoformat() if record.end_date else None,
                    },
                },
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel atualizar a manutencao") from exc

        return await self.get(record.id)

    async def delete(self, record_id: UUID, current_user: User) -> None:
        record = await self.records.get_by_id(record_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de manutencao nao encontrado")

        try:
            await self.audit.record(
                actor=current_user,
                action="DELETE",
                entity_type="MAINTENANCE",
                entity_id=record.id,
                entity_label=f"{record.vehicle.plate if record.vehicle else record.vehicle_id} - {record.service_description[:60]}",
                details={
                    "parts_replaced": record.parts_replaced,
                    "total_cost": str(record.total_cost),
                    "start_date": record.start_date.isoformat(),
                    "end_date": record.end_date.isoformat() if record.end_date else None,
                },
            )
            await self.records.delete(record)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel remover a manutencao") from exc

    async def _ensure_vehicle_exists(self, vehicle_id: UUID) -> None:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")

    def _serialize(self, record: MaintenanceRecord) -> dict:
        return {
            "id": record.id,
            "vehicle_id": record.vehicle_id,
            "vehicle_plate": record.vehicle.plate if record.vehicle else "",
            "start_date": record.start_date,
            "end_date": record.end_date,
            "service_description": record.service_description,
            "parts_replaced": record.parts_replaced,
            "total_cost": record.total_cost,
            "created_by": record.created_by,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        }
