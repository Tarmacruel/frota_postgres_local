from __future__ import annotations

from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.fine import Fine, FineStatus
from app.models.user import User
from app.repositories.driver_repository import DriverRepository
from app.repositories.fine_repository import FineRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.fine import FineCreate, FineUpdate
from app.services.audit_service import AuditService


class FineService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.fines = FineRepository(db)
        self.vehicles = VehicleRepository(db)
        self.drivers = DriverRepository(db)
        self.audit = AuditService(db)

    async def list(self, *, page: int, limit: int, vehicle_id: UUID | None = None, status_filter: FineStatus | None = None, search: str | None = None) -> PaginatedResponse[dict]:
        items, total = await self.fines.list_paginated(page=page, limit=limit, vehicle_id=vehicle_id, status=status_filter, search=search)
        return PaginatedResponse[dict](data=[self._serialize(item) for item in items], pagination=build_pagination(page, limit, total))

    async def get(self, fine_id: UUID) -> dict:
        fine = await self.fines.get_by_id(fine_id)
        if not fine:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Multa não encontrada")
        return self._serialize(fine)

    async def create(self, data: FineCreate, current_user: User) -> dict:
        vehicle = await self.vehicles.get_by_id(data.vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
        if data.driver_id:
            driver = await self.drivers.get_by_id(data.driver_id)
            if not driver:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor não encontrado")

        fine = Fine(created_by=current_user.id, **data.model_dump())
        try:
            await self.fines.create(fine)
            await self.audit.record(actor=current_user, action="CREATE", entity_type="FINE", entity_id=fine.id, entity_label=f"{vehicle.plate} - {fine.ticket_number}", details=self._serialize(fine))
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível registrar a multa") from exc
        return await self.get(fine.id)

    async def update(self, fine_id: UUID, data: FineUpdate, current_user: User) -> dict:
        fine = await self.fines.get_by_id(fine_id)
        if not fine:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Multa não encontrada")

        payload = data.model_dump(exclude_unset=True)
        if "driver_id" in payload and payload["driver_id"]:
            driver = await self.drivers.get_by_id(payload["driver_id"])
            if not driver:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor não encontrado")

        before = self._serialize(fine)
        for field, value in payload.items():
            setattr(fine, field, value)

        try:
            await self.audit.record(actor=current_user, action="UPDATE", entity_type="FINE", entity_id=fine.id, entity_label=f"{fine.vehicle.plate if fine.vehicle else fine.vehicle_id} - {fine.ticket_number}", details={"before": before, "after": self._serialize(fine)})
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível atualizar a multa") from exc
        return await self.get(fine.id)

    def _serialize(self, fine: Fine) -> dict:
        return {
            "id": fine.id,
            "vehicle_id": fine.vehicle_id,
            "vehicle_plate": fine.vehicle.plate if fine.vehicle else "",
            "driver_id": fine.driver_id,
            "driver_name": fine.driver.nome_completo if fine.driver else None,
            "ticket_number": fine.ticket_number,
            "infraction_date": fine.infraction_date,
            "due_date": fine.due_date,
            "amount": fine.amount,
            "description": fine.description,
            "location": fine.location,
            "status": fine.status,
            "created_by": fine.created_by,
            "created_at": fine.created_at,
            "updated_at": fine.updated_at,
        }
