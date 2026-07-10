from __future__ import annotations

from datetime import datetime
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.models.maintenance import MaintenanceRecord
from app.models.user import User
from app.repositories.maintenance_repository import MaintenanceRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
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
        current_user: User | None = None,
    ) -> list[dict]:
        if production_scope_is_empty(current_user):
            return []

        organization_id = scoped_organization_id(current_user)
        records = await self.records.list(vehicle_id=vehicle_id, start=start, end=end, organization_id=organization_id)
        return [self._serialize(record) for record in records]

    async def get(self, record_id: UUID, current_user: User | None = None) -> dict:
        record = await self.records.get_by_id(record_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de manutenção não encontrado")
        await self._ensure_vehicle_visible_to_user(record.vehicle_id, current_user)
        return self._serialize(record)

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        vehicle_id: UUID | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        only_open: bool | None = None,
        search: str | None = None,
        current_user: User | None = None,
    ) -> PaginatedResponse[dict]:
        if production_scope_is_empty(current_user):
            return PaginatedResponse[dict](data=[], pagination=build_pagination(page, limit, 0))

        organization_id = scoped_organization_id(current_user)
        records, total = await self.records.list_paginated(
            page=page,
            limit=limit,
            vehicle_id=vehicle_id,
            start=start,
            end=end,
            only_open=only_open,
            search=search,
            organization_id=organization_id,
        )
        return PaginatedResponse[dict](data=[self._serialize(record) for record in records], pagination=build_pagination(page, limit, total))

    async def create(self, data: MaintenanceCreate, current_user: User) -> dict:
        await self._ensure_vehicle_exists(data.vehicle_id, current_user=current_user)

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
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível registrar a manutenção") from exc

        return await self.get(record.id, current_user=current_user)

    async def update(self, record_id: UUID, data: MaintenanceUpdate, current_user: User) -> dict:
        record = await self.records.get_by_id(record_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de manutenção não encontrado")

        await self._ensure_vehicle_visible_to_user(record.vehicle_id, current_user)

        payload = data.model_dump(exclude_unset=True)
        previous_values = {
            "service_description": record.service_description,
            "parts_replaced": record.parts_replaced,
            "total_cost": str(record.total_cost),
            "end_date": record.end_date.isoformat() if record.end_date else None,
        }
        next_end_date = payload["end_date"] if "end_date" in payload else record.end_date
        if next_end_date and next_end_date < record.start_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data final não pode ser anterior a data inicial")

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
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível atualizar a manutenção") from exc

        return await self.get(record.id, current_user=current_user)

    async def delete(self, record_id: UUID, current_user: User) -> None:
        record = await self.records.get_by_id(record_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de manutenção não encontrado")

        await self._ensure_vehicle_visible_to_user(record.vehicle_id, current_user)

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
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível remover a manutenção") from exc

    async def _ensure_vehicle_exists(self, vehicle_id: UUID, current_user: User | None = None) -> None:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")

        await self._ensure_vehicle_visible_to_user(vehicle_id, current_user)

    async def _ensure_vehicle_visible_to_user(self, vehicle_id: UUID, current_user: User | None) -> None:
        organization_id = scoped_organization_id(current_user)
        if organization_id is None:
            if production_scope_is_empty(current_user):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
            return
        if not await self.vehicles.is_vehicle_in_organization(vehicle_id, organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")

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
