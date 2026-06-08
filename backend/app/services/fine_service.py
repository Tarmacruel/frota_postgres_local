from __future__ import annotations

import re
import unicodedata
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.models.fine import Fine, FineInfraction, FineStatus
from app.models.user import User
from app.repositories.driver_repository import DriverRepository
from app.repositories.fine_repository import FineRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.fine import FineCreate, FineInfractionCreate, FineInfractionUpdate, FineUpdate
from app.services.audit_service import AuditService


class FineService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.fines = FineRepository(db)
        self.vehicles = VehicleRepository(db)
        self.drivers = DriverRepository(db)
        self.audit = AuditService(db)

    async def list(
        self,
        *,
        page: int,
        limit: int,
        vehicle_id: UUID | None = None,
        organization_id: UUID | None = None,
        status_filter: FineStatus | None = None,
        search: str | None = None,
        current_user: User | None = None,
    ) -> PaginatedResponse[dict]:
        if production_scope_is_empty(current_user):
            return PaginatedResponse[dict](data=[], pagination=build_pagination(page, limit, 0))

        organization_id = scoped_organization_id(current_user, organization_id)
        items, total = await self.fines.list_paginated(
            page=page,
            limit=limit,
            vehicle_id=vehicle_id,
            organization_id=organization_id,
            status=status_filter,
            search=search,
        )
        return PaginatedResponse[dict](data=[self._serialize(item) for item in items], pagination=build_pagination(page, limit, total))

    async def get(self, fine_id: UUID, current_user: User | None = None) -> dict:
        fine = await self.fines.get_by_id(fine_id)
        if not fine:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Multa nao encontrada")
        await self._ensure_vehicle_visible_to_user(fine.vehicle_id, current_user)
        return self._serialize(fine)

    async def create(self, data: FineCreate, current_user: User) -> dict:
        vehicle = await self.vehicles.get_by_id(data.vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")
        await self._ensure_vehicle_visible_to_user(data.vehicle_id, current_user)

        infraction = await self._require_active_infraction(data.infraction_type_id)
        if data.driver_id:
            driver = await self.drivers.get_by_id(data.driver_id)
            if not driver:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor nao encontrado")

        payload = data.model_dump()
        payload["description"] = payload.get("description") or infraction.description
        fine = Fine(created_by=current_user.id, **payload)
        try:
            await self.fines.create(fine)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="FINE",
                entity_id=fine.id,
                entity_label=f"{vehicle.plate} - {fine.ticket_number}",
                details=self._serialize(fine),
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel registrar a multa") from exc
        return await self.get(fine.id, current_user=current_user)

    async def update(self, fine_id: UUID, data: FineUpdate, current_user: User) -> dict:
        fine = await self.fines.get_by_id(fine_id)
        if not fine:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Multa nao encontrada")

        await self._ensure_vehicle_visible_to_user(fine.vehicle_id, current_user)

        payload = data.model_dump(exclude_unset=True)
        if "driver_id" in payload and payload["driver_id"]:
            driver = await self.drivers.get_by_id(payload["driver_id"])
            if not driver:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor nao encontrado")
        if "infraction_type_id" in payload and payload["infraction_type_id"]:
            infraction = await self._require_active_infraction(payload["infraction_type_id"])
            payload["description"] = payload.get("description") or infraction.description

        before = self._serialize(fine)
        for field, value in payload.items():
            setattr(fine, field, value)

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="FINE",
                entity_id=fine.id,
                entity_label=f"{fine.vehicle.plate if fine.vehicle else fine.vehicle_id} - {fine.ticket_number}",
                details={"before": before, "after": self._serialize(fine)},
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel atualizar a multa") from exc
        return await self.get(fine.id, current_user=current_user)

    async def list_infractions(self, *, search: str | None = None, active_only: bool = True, limit: int = 200) -> list[dict]:
        items = await self.fines.list_infractions(search=search, active_only=active_only, limit=limit)
        return [self._serialize_infraction(item) for item in items]

    async def create_infraction(self, data: FineInfractionCreate, current_user: User) -> dict:
        payload = data.model_dump()
        payload["normalized_description"] = self.normalize_description(payload["description"])
        payload["is_official"] = False
        payload["is_provisional"] = False
        infraction = FineInfraction(**payload)
        try:
            await self.fines.create_infraction(infraction)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="FINE_INFRACTION",
                entity_id=infraction.id,
                entity_label=f"{infraction.code}-{infraction.desdobramento}",
                details=self._serialize_infraction(infraction),
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Enquadramento ja cadastrado") from exc
        return self._serialize_infraction(infraction)

    async def update_infraction(self, infraction_id: UUID, data: FineInfractionUpdate, current_user: User) -> dict:
        infraction = await self.fines.get_infraction_by_id(infraction_id)
        if not infraction:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquadramento nao encontrado")

        before = self._serialize_infraction(infraction)
        payload = data.model_dump(exclude_unset=True)
        if "description" in payload and payload["description"]:
            payload["normalized_description"] = self.normalize_description(payload["description"])
        for field, value in payload.items():
            setattr(infraction, field, value)

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="FINE_INFRACTION",
                entity_id=infraction.id,
                entity_label=f"{infraction.code}-{infraction.desdobramento}",
                details={"before": before, "after": self._serialize_infraction(infraction)},
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel atualizar o enquadramento") from exc
        return self._serialize_infraction(infraction)

    async def _require_active_infraction(self, infraction_id: UUID) -> FineInfraction:
        infraction = await self.fines.get_infraction_by_id(infraction_id)
        if not infraction or not infraction.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquadramento de multa nao encontrado")
        return infraction

    async def _ensure_vehicle_visible_to_user(self, vehicle_id: UUID, current_user: User | None) -> None:
        organization_id = scoped_organization_id(current_user)
        if organization_id is None:
            if production_scope_is_empty(current_user):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")
            return
        if not await self.vehicles.is_vehicle_in_organization(vehicle_id, organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")

    def _serialize(self, fine: Fine) -> dict:
        return {
            "id": fine.id,
            "vehicle_id": fine.vehicle_id,
            "vehicle_plate": fine.vehicle.plate if fine.vehicle else "",
            "driver_id": fine.driver_id,
            "driver_name": fine.driver.nome_completo if fine.driver else None,
            "infraction_type_id": fine.infraction_type_id,
            "infraction_type": self._serialize_infraction(fine.infraction_type) if fine.infraction_type else None,
            "ticket_number": fine.ticket_number,
            "infraction_date": fine.infraction_date,
            "infraction_time": fine.infraction_time,
            "due_date": fine.due_date,
            "amount": fine.amount,
            "description": fine.description,
            "location": fine.location,
            "status": fine.status,
            "communication_number": fine.communication_number,
            "sent_date": fine.sent_date,
            "process_number": fine.process_number,
            "source_status": fine.source_status,
            "imported_driver_name": fine.imported_driver_name,
            "notes": fine.notes,
            "source_import_row_id": fine.source_import_row_id,
            "created_by": fine.created_by,
            "created_at": fine.created_at,
            "updated_at": fine.updated_at,
        }

    def _serialize_infraction(self, infraction: FineInfraction) -> dict:
        return {
            "id": infraction.id,
            "code": infraction.code,
            "desdobramento": infraction.desdobramento,
            "description": infraction.description,
            "ctb_article": infraction.ctb_article,
            "offender": infraction.offender,
            "severity": infraction.severity,
            "competent_body": infraction.competent_body,
            "default_amount": infraction.default_amount,
            "points": infraction.points,
            "is_active": infraction.is_active,
            "is_official": infraction.is_official,
            "is_provisional": infraction.is_provisional,
            "source": infraction.source,
            "created_at": infraction.created_at,
            "updated_at": infraction.updated_at,
        }

    @classmethod
    def normalize_description(cls, value: str | None) -> str:
        text = "".join(ch for ch in unicodedata.normalize("NFD", str(value or "").upper()) if unicodedata.category(ch) != "Mn")
        return re.sub(r"[^A-Z0-9]+", " ", text).strip()
