from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog
from app.models.location_history import LocationHistory
from app.models.master_data import Allocation
from app.models.user import User
from app.models.vehicle import Vehicle, VehicleOwnershipType, VehicleStatus
from app.repositories.master_data_repository import MasterDataRepository
from app.services.audit_service import AuditService
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.vehicle import VehicleCreate, VehicleUpdate


class VehicleService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.vehicles = VehicleRepository(db)
        self.master_data = MasterDataRepository(db)
        self.audit = AuditService(db)

    async def list(self, skip: int, limit: int, status_filter: VehicleStatus | None):
        vehicles = await self.vehicles.list(skip=skip, limit=limit, status=status_filter)
        items = []
        for vehicle in vehicles:
            active = await self.vehicles.get_active_history(vehicle.id)
            possession = await self.vehicles.get_active_possession(vehicle.id)
            items.append(self._serialize_vehicle(vehicle, active, possession))
        return items

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        status_filter: VehicleStatus | None = None,
        ownership_type: VehicleOwnershipType | None = None,
        search: str | None = None,
        sort: str = "created_at",
        order: str = "desc",
    ) -> PaginatedResponse[dict]:
        vehicles, total = await self.vehicles.list_paginated(
            page=page,
            limit=limit,
            status=status_filter,
            ownership_type=ownership_type,
            search=search,
            sort=sort,
            order=order,
        )
        items = []
        for vehicle in vehicles:
            active = await self.vehicles.get_active_history(vehicle.id)
            possession = await self.vehicles.get_active_possession(vehicle.id)
            items.append(self._serialize_vehicle(vehicle, active, possession))
        return PaginatedResponse[dict](data=items, pagination=build_pagination(page, limit, total))

    async def get_history(self, vehicle_id: UUID):
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")
        history = await self.vehicles.list_history(vehicle_id)
        audit_logs = await self._list_vehicle_audit_logs(vehicle_id)
        events = [self._serialize_history(item) for item in history]
        events.extend(self._serialize_audit_event(item) for item in audit_logs)
        return sorted(events, key=lambda item: item["occurred_at"], reverse=True)

    async def create(self, data: VehicleCreate, current_user: User) -> dict:
        existing = await self.vehicles.get_by_plate(data.plate.upper())
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Placa ja cadastrada")

        chassis_number = self._normalize_chassis(data.chassis_number)
        if chassis_number:
            duplicate_chassis = await self._get_by_chassis(chassis_number)
            if duplicate_chassis:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Chassi ja cadastrado")

        allocation = await self._require_allocation(data.allocation_id)
        vehicle = Vehicle(
            plate=data.plate.upper().strip(),
            chassis_number=chassis_number,
            brand=data.brand.strip(),
            model=data.model.strip(),
            vehicle_type=data.vehicle_type,
            ownership_type=data.ownership_type,
            status=data.status,
        )
        history = LocationHistory(
            allocation_id=allocation.id,
            department=allocation.display_name,
        )

        try:
            vehicle = await self.vehicles.create(vehicle)
            history.vehicle_id = vehicle.id
            await self.vehicles.create_history(history)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="VEHICLE",
                entity_id=vehicle.id,
                entity_label=vehicle.plate,
                details={
                    "chassis_number": vehicle.chassis_number,
                    "brand": vehicle.brand,
                    "model": vehicle.model,
                    "vehicle_type": vehicle.vehicle_type.value,
                    "ownership_type": vehicle.ownership_type.value,
                    "status": vehicle.status.value,
                    "location": history.department,
                },
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel criar o veiculo") from exc

        active = await self.vehicles.get_active_history(vehicle.id)
        return self._serialize_vehicle(vehicle, active, None)

    async def update(self, vehicle_id: UUID, data: VehicleUpdate, current_user: User) -> dict:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")

        previous_active = await self.vehicles.get_active_history(vehicle.id)
        previous_values = {
            "plate": vehicle.plate,
            "chassis_number": vehicle.chassis_number,
            "brand": vehicle.brand,
            "model": vehicle.model,
            "vehicle_type": vehicle.vehicle_type.value,
            "ownership_type": vehicle.ownership_type.value,
            "status": vehicle.status.value,
            "location": previous_active.display_name if previous_active else None,
        }

        if data.plate and data.plate.upper().strip() != vehicle.plate:
            duplicate = await self.vehicles.get_by_plate(data.plate.upper().strip())
            if duplicate and duplicate.id != vehicle.id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Placa ja cadastrada")

        if data.chassis_number is not None:
            next_chassis = self._normalize_chassis(data.chassis_number)
            if next_chassis != vehicle.chassis_number:
                duplicate_chassis = await self._get_by_chassis(next_chassis)
                if duplicate_chassis and duplicate_chassis.id != vehicle.id:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Chassi ja cadastrado")

        try:
            if data.plate is not None:
                vehicle.plate = data.plate.upper().strip()
            if data.chassis_number is not None:
                vehicle.chassis_number = self._normalize_chassis(data.chassis_number)
            if data.brand is not None:
                vehicle.brand = data.brand.strip()
            if data.model is not None:
                vehicle.model = data.model.strip()
            if data.vehicle_type is not None:
                vehicle.vehicle_type = data.vehicle_type
            if data.ownership_type is not None:
                vehicle.ownership_type = data.ownership_type
            if data.status is not None:
                vehicle.status = data.status

            if data.allocation_id is not None:
                allocation = await self._require_allocation(data.allocation_id)
                active = await self.vehicles.get_active_history(vehicle.id)
                current_allocation_id = active.allocation_id if active else None
                if current_allocation_id != allocation.id:
                    if active:
                        active.end_date = datetime.now(timezone.utc)
                    new_history = LocationHistory(
                        vehicle_id=vehicle.id,
                        allocation_id=allocation.id,
                        department=allocation.display_name,
                        justification=data.edit_reason,
                    )
                    await self.vehicles.create_history(new_history)

            updated_active = await self.vehicles.get_active_history(vehicle.id)
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="VEHICLE",
                entity_id=vehicle.id,
                entity_label=vehicle.plate,
                details={
                    "reason": data.edit_reason,
                    "before": previous_values,
                    "after": {
                        "plate": vehicle.plate,
                        "chassis_number": vehicle.chassis_number,
                        "brand": vehicle.brand,
                        "model": vehicle.model,
                        "vehicle_type": vehicle.vehicle_type.value,
                        "ownership_type": vehicle.ownership_type.value,
                        "status": vehicle.status.value,
                        "location": updated_active.display_name if updated_active else None,
                    },
                },
            )
            await self.db.flush()
            await self.db.refresh(vehicle)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel atualizar o veiculo") from exc

        active = await self.vehicles.get_active_history(vehicle.id)
        possession = await self.vehicles.get_active_possession(vehicle.id)
        return self._serialize_vehicle(vehicle, active, possession)

    async def delete(self, vehicle_id: UUID, current_user: User) -> None:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")

        active = await self.vehicles.get_active_history(vehicle.id)
        possession = await self.vehicles.get_active_possession(vehicle.id)

        try:
            await self.audit.record(
                actor=current_user,
                action="DELETE",
                entity_type="VEHICLE",
                entity_id=vehicle.id,
                entity_label=vehicle.plate,
                details={
                    "chassis_number": vehicle.chassis_number,
                    "brand": vehicle.brand,
                    "model": vehicle.model,
                    "vehicle_type": vehicle.vehicle_type.value,
                    "ownership_type": vehicle.ownership_type.value,
                    "status": vehicle.status.value,
                    "location": active.display_name if active else None,
                    "current_driver": possession.driver_name if possession else None,
                },
            )
            await self.vehicles.delete(vehicle)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel remover o veiculo") from exc

    async def _get_by_chassis(self, chassis_number: str | None) -> Vehicle | None:
        if not chassis_number:
            return None
        result = await self.db.execute(
            select(Vehicle).where(Vehicle.chassis_number == chassis_number)
        )
        return result.scalar_one_or_none()

    async def _require_allocation(self, allocation_id: UUID) -> Allocation:
        allocation = await self.master_data.get_allocation(allocation_id)
        if not allocation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lotacao nao encontrada")
        return allocation

    async def _list_vehicle_audit_logs(self, vehicle_id: UUID) -> list[AuditLog]:
        result = await self.db.execute(
            select(AuditLog)
            .where(
                AuditLog.entity_type == "VEHICLE",
                AuditLog.entity_id == vehicle_id,
                AuditLog.action.in_(("CREATE", "UPDATE")),
            )
            .order_by(AuditLog.created_at.desc())
        )
        return list(result.scalars().all())

    def _normalize_chassis(self, chassis_number: str | None) -> str | None:
        if chassis_number is None:
            return None
        normalized = chassis_number.strip().upper()
        return normalized or None

    def _serialize_vehicle(self, vehicle: Vehicle, active_history: LocationHistory | None, possession) -> dict:
        current_location = self._serialize_location(active_history)
        return {
            "id": vehicle.id,
            "plate": vehicle.plate,
            "chassis_number": vehicle.chassis_number,
            "brand": vehicle.brand,
            "model": vehicle.model,
            "vehicle_type": vehicle.vehicle_type,
            "ownership_type": vehicle.ownership_type,
            "status": vehicle.status,
            "current_department": current_location["display_name"] if current_location else None,
            "current_location": current_location,
            "current_driver_name": possession.driver_name if possession else None,
            "created_at": vehicle.created_at,
            "updated_at": vehicle.updated_at,
        }

    def _serialize_location(self, history: LocationHistory | None) -> dict | None:
        if not history:
            return None
        return {
            "organization_id": history.allocation.organization_id if history.allocation else None,
            "organization_name": history.organization_name,
            "department_id": history.allocation.department_id if history.allocation else None,
            "department_name": history.department_name,
            "allocation_id": history.allocation_id,
            "allocation_name": history.allocation_name,
            "display_name": history.display_name,
        }

    def _serialize_history(self, history: LocationHistory) -> dict:
        return {
            "id": history.id,
            "event_type": "MOVEMENT",
            "action": None,
            "occurred_at": history.start_date,
            "title": "Movimentacao de lotacao",
            "actor_name": None,
            "justification": history.justification,
            "allocation_id": history.allocation_id,
            "department": history.department,
            "display_name": history.display_name,
            "organization_name": history.organization_name,
            "department_name": history.department_name,
            "allocation_name": history.allocation_name,
            "start_date": history.start_date,
            "end_date": history.end_date,
            "created_at": history.created_at,
            "before": None,
            "after": None,
        }

    def _serialize_audit_event(self, log: AuditLog) -> dict:
        details = log.details or {}
        before = details.get("before") if isinstance(details.get("before"), dict) else None
        if isinstance(details.get("after"), dict):
            after = details["after"]
        elif log.action == "CREATE" and isinstance(details, dict):
            after = details
        else:
            after = None

        return {
            "id": log.id,
            "event_type": "CREATE" if log.action == "CREATE" else "EDIT",
            "action": log.action,
            "occurred_at": log.created_at,
            "title": "Cadastro do veiculo" if log.action == "CREATE" else "Edicao cadastral",
            "actor_name": log.actor_name,
            "justification": details.get("reason"),
            "allocation_id": None,
            "department": None,
            "display_name": None,
            "organization_name": None,
            "department_name": None,
            "allocation_name": None,
            "start_date": None,
            "end_date": None,
            "created_at": log.created_at,
            "before": before,
            "after": after,
        }
