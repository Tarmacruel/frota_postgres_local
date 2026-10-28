from __future__ import annotations

from datetime import datetime
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from app.services.operational_scope import attribute_operation, ensure_record_visible
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.models.maintenance import MaintenanceRecord
from app.models.user import User
from app.models.vehicle import Vehicle
from app.repositories.maintenance_repository import MaintenanceRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import build_pagination
from app.schemas.maintenance import MaintenanceCreate, MaintenanceListResponse, MaintenanceUpdate
from app.services.audit_service import AuditService
from app.core.config import settings
from app.services.contract_balance_service import ContractBalanceService, funding_fields


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
        records = await self.records.list(
            vehicle_id=vehicle_id,
            start=start,
            end=end,
            organization_id=organization_id,
        )
        return [self._serialize(record) for record in records]

    async def get(self, record_id: UUID, current_user: User | None = None) -> dict:
        record = await self.records.get_by_id(record_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de manutencao nao encontrado")
        await ensure_record_visible(self.db, record, current_user)
        result = self._serialize(record)
        if settings.CONTRACT_QUANTITY_ENABLED and record.contract_reservation_id:
            result['contract_funding'] = await ContractBalanceService(self.db).funding(record.contract_reservation_id)
        return result

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
        filter_organization_id: UUID | None = None,
        unassigned: bool = False,
        focus_id: UUID | None = None,
        current_user: User | None = None,
    ) -> MaintenanceListResponse:
        if production_scope_is_empty(current_user):
            return MaintenanceListResponse(data=[], pagination=build_pagination(page, limit, 0), summary={"total": 0, "open": 0, "closed": 0})

        organization_id = scoped_organization_id(current_user)
        records, total, summary = await self.records.list_paginated(
            page=page,
            limit=limit,
            vehicle_id=vehicle_id,
            start=start,
            end=end,
            only_open=only_open,
            search=search,
            filter_organization_id=filter_organization_id,
            unassigned=unassigned,
            focus_id=focus_id,
            with_summary=True,
            organization_id=organization_id,
        )
        return MaintenanceListResponse(data=[self._serialize(record) for record in records], pagination=build_pagination(page, limit, total), summary=summary)

    async def create(self, data: MaintenanceCreate, current_user: User) -> dict:
        if settings.CONTRACT_BALANCE_ENABLED:
            raise HTTPException(409, 'Emita um pedido de manutenção com contrato, oficina e orçamento antes de iniciar o serviço')
        vehicle = await self._ensure_vehicle_exists(data.vehicle_id, current_user=current_user)

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
            await attribute_operation(self.db, record, current_user, new=True)
            await self.records.create(record)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="MAINTENANCE",
                entity_id=record.id,
                entity_label=f"{vehicle.plate} - {record.service_description[:60]}",
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

        return await self.get(record.id, current_user=current_user)

    async def update(self, record_id: UUID, data: MaintenanceUpdate, current_user: User) -> dict:
        record = await self.records.get_by_id(record_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de manutencao nao encontrado")

        await ensure_record_visible(self.db, record, current_user)
        await attribute_operation(self.db, record, current_user)

        payload = data.model_dump(exclude_unset=True)
        item_lines = payload.pop('item_lines', None)
        reason = payload.pop('reason', None)
        if item_lines is not None and len((reason or '').strip()) < 10:
            raise HTTPException(422, 'Justifique a retificação dos itens e quantidades (mínimo 10 caracteres)')
        previous_values = {
            "service_description": record.service_description,
            "parts_replaced": record.parts_replaced,
            "total_cost": str(record.total_cost),
            "end_date": record.end_date.isoformat() if record.end_date else None,
        }
        next_end_date = payload["end_date"] if "end_date" in payload else record.end_date
        if settings.CONTRACT_BALANCE_ENABLED and record.contract_reservation_id:
            if payload.get('total_cost', record.total_cost) != record.total_cost and len((reason or '').strip()) < 10:
                raise HTTPException(422, 'Justifique a alteração do custo da manutenção (mínimo 10 caracteres)')
            if record.end_date is None:
                raise HTTPException(409, 'Conclua o pedido de manutenção para registrar o custo real')
            if next_end_date is None:
                raise HTTPException(409, 'Uma execução financeira concluída não pode voltar a ficar aberta')
        if next_end_date and next_end_date < record.start_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data final nao pode ser anterior a data inicial")

        for field, value in payload.items():
            setattr(record, field, value)
        if settings.CONTRACT_BALANCE_ENABLED and record.contract_reservation_id:
            await ContractBalanceService(self.db).rectify_operation('MAINTENANCE', record.id,
                amount=record.total_cost, actor=current_user, reason=reason or 'Retificação dos dados da manutenção concluída', occurred_at=record.end_date, item_lines=item_lines)

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="MAINTENANCE",
                entity_id=record.id,
                entity_label=f"{record.vehicle.plate if record.vehicle else record.vehicle_id} - {record.service_description[:60]}",
                details={
                    "before": previous_values,
                    "reason": reason,
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

        return await self.get(record.id, current_user=current_user)

    async def delete(self, record_id: UUID, current_user: User) -> None:
        record = await self.records.get_by_id(record_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de manutencao nao encontrado")

        await ensure_record_visible(self.db, record, current_user)
        await attribute_operation(self.db, record, current_user)
        if settings.CONTRACT_BALANCE_ENABLED and record.contract_reservation_id:
            raise HTTPException(409, 'Manutenção com efeito financeiro não pode ser apagada. Utilize a retificação.')

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

    async def _ensure_vehicle_exists(self, vehicle_id: UUID, current_user: User | None = None) -> Vehicle:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")

        return vehicle

    async def _ensure_vehicle_visible_to_user(self, vehicle_id: UUID, current_user: User | None) -> None:
        organization_id = scoped_organization_id(current_user)
        if organization_id is None:
            if production_scope_is_empty(current_user):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")
            return
        if not await self.vehicles.is_vehicle_in_organization(vehicle_id, organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")

    def _serialize(self, record: MaintenanceRecord) -> dict:
        return {
            **funding_fields(record),
            "id": record.id,
            "vehicle_loan_id": getattr(record, "vehicle_loan_id", None),
            "responsible_organization_id": getattr(record, "responsible_organization_id", None),
            "vehicle_id": record.vehicle_id,
            "vehicle_plate": record.vehicle.plate if record.vehicle else "",
            "vehicle_type": getattr(record.vehicle, "vehicle_type", None),
            "start_date": record.start_date,
            "end_date": record.end_date,
            "service_description": record.service_description,
            "parts_replaced": record.parts_replaced,
            "total_cost": record.total_cost,
            "created_by": record.created_by,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        }
