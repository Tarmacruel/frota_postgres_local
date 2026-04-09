from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.models.possession import VehiclePossession
from app.repositories.possession_repository import PossessionRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.possession import PossessionCreate, PossessionUpdate
from app.services.audit_service import AuditService


class PossessionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.possessions = PossessionRepository(db)
        self.vehicles = VehicleRepository(db)
        self.audit = AuditService(db)

    async def list(self, vehicle_id: UUID | None = None, active: bool | None = None) -> list[dict]:
        records = await self.possessions.list(vehicle_id=vehicle_id, active=active)
        return [self._serialize(record) for record in records]

    async def list_active(self) -> list[dict]:
        return await self.list(active=True)

    async def get_current_driver(self, vehicle_id: UUID) -> dict:
        await self._ensure_vehicle_exists(vehicle_id)
        record = await self.possessions.get_active_by_vehicle(vehicle_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum condutor ativo encontrado para este veiculo")
        return self._serialize(record)

    async def start(self, data: PossessionCreate, current_user: User) -> dict:
        await self._ensure_vehicle_exists(data.vehicle_id)

        effective_start = data.start_date or datetime.now(timezone.utc)
        current_active = await self.possessions.get_active_by_vehicle(data.vehicle_id)
        if current_active and effective_start < current_active.start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nova posse nao pode iniciar antes da posse ativa atual",
            )

        possession = VehiclePossession(
            vehicle_id=data.vehicle_id,
            driver_name=data.driver_name,
            driver_document=data.driver_document,
            driver_contact=data.driver_contact,
            start_date=effective_start,
            observation=data.observation,
        )

        try:
            await self.possessions.end_active_for_vehicle(data.vehicle_id, effective_start)
            await self.possessions.create(possession)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="POSSESSION",
                entity_id=possession.id,
                entity_label=f"{possession.vehicle.plate if possession.vehicle else data.vehicle_id} - {possession.driver_name}",
                details={
                    "vehicle_id": str(possession.vehicle_id),
                    "driver_document": possession.driver_document,
                    "driver_contact": possession.driver_contact,
                    "start_date": possession.start_date.isoformat(),
                    "observation": possession.observation,
                },
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel iniciar a posse") from exc

        return await self._get_by_id(possession.id)

    async def end(self, possession_id: UUID, data: PossessionUpdate, current_user: User) -> dict:
        possession = await self.possessions.get_by_id(possession_id)
        if not possession:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse nao encontrado")
        if possession.end_date is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Registro de posse ja encerrado")

        payload = data.model_dump(exclude_unset=True)
        effective_end = payload.get("end_date") or datetime.now(timezone.utc)
        if effective_end < possession.start_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data final nao pode ser anterior ao inicio da posse")

        possession.end_date = effective_end
        if "observation" in payload:
            possession.observation = payload["observation"]

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="POSSESSION",
                entity_id=possession.id,
                entity_label=f"{possession.vehicle.plate if possession.vehicle else possession.vehicle_id} - {possession.driver_name}",
                details={
                    "event": "END_POSSESSION",
                    "end_date": possession.end_date.isoformat() if possession.end_date else None,
                    "observation": possession.observation,
                },
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel encerrar a posse") from exc

        return await self._get_by_id(possession.id)

    async def _get_by_id(self, possession_id: UUID) -> dict:
        record = await self.possessions.get_by_id(possession_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse nao encontrado")
        return self._serialize(record)

    async def _ensure_vehicle_exists(self, vehicle_id: UUID) -> None:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")

    def _serialize(self, record: VehiclePossession) -> dict:
        return {
            "id": record.id,
            "vehicle_id": record.vehicle_id,
            "vehicle_plate": record.vehicle.plate if record.vehicle else "",
            "driver_name": record.driver_name,
            "driver_document": record.driver_document,
            "driver_contact": record.driver_contact,
            "start_date": record.start_date,
            "end_date": record.end_date,
            "observation": record.observation,
            "created_at": record.created_at,
            "is_active": record.is_active,
        }
