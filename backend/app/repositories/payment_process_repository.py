from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.types import String

from app.models.fuel_station import FuelStation
from app.models.fuel_supply import FuelSupply
from app.models.location_history import LocationHistory
from app.models.maintenance import MaintenanceRecord
from app.models.master_data import Allocation, Department
from app.models.payment_process import (
    PaymentContract,
    PaymentContractAmendment,
    PaymentContractStatus,
    PaymentProcessChecklistItem,
    PaymentProcess,
    PaymentProcessKind,
    PaymentProcessStage,
    PaymentProcessStageEvent,
    PaymentSupplier,
)


class PaymentProcessRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, record: PaymentProcess) -> PaymentProcess:
        self.db.add(record)
        await self.db.flush()
        return record

    async def delete(self, record: PaymentProcess) -> None:
        await self.db.delete(record)
        await self.db.flush()

    async def flush(self) -> None:
        await self.db.flush()

    async def get_by_import_key(self, import_key: str) -> PaymentProcess | None:
        result = await self.db.execute(
            select(PaymentProcess)
            .options(*self._process_options())
            .where(PaymentProcess.import_key == import_key)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, process_id: UUID) -> PaymentProcess | None:
        result = await self.db.execute(
            select(PaymentProcess)
            .options(*self._process_options())
            .where(PaymentProcess.id == process_id)
        )
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        kind: PaymentProcessKind | None = None,
        stage: PaymentProcessStage | None = None,
        status_filter: str | None = None,
        organization_id: UUID | None = None,
        supplier_id: UUID | None = None,
        contract_id: UUID | None = None,
        competence_month: date | None = None,
        due_from: date | None = None,
        due_to: date | None = None,
        search: str | None = None,
    ) -> tuple[list[PaymentProcess], int]:
        stmt = select(PaymentProcess).outerjoin(PaymentSupplier, PaymentSupplier.id == PaymentProcess.supplier_id).outerjoin(
            PaymentContract, PaymentContract.id == PaymentProcess.contract_id
        )
        stmt = stmt.options(*self._process_options())
        count_stmt = select(func.count(func.distinct(PaymentProcess.id))).outerjoin(PaymentSupplier, PaymentSupplier.id == PaymentProcess.supplier_id).outerjoin(
            PaymentContract, PaymentContract.id == PaymentProcess.contract_id
        )
        filters = self._filters(
            kind=kind,
            stage=stage,
            status_filter=status_filter,
            organization_id=organization_id,
            supplier_id=supplier_id,
            contract_id=contract_id,
            competence_month=competence_month,
            due_from=due_from,
            due_to=due_to,
            search=search,
        )

        if filters:
            clause = and_(*filters)
            stmt = stmt.where(clause)
            count_stmt = count_stmt.where(clause)

        stmt = (
            stmt.order_by(PaymentProcess.due_date.asc().nullslast(), PaymentProcess.issue_date.desc().nullslast(), PaymentProcess.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        total = int((await self.db.execute(count_stmt)).scalar_one())
        records = list((await self.db.execute(stmt)).scalars().unique().all())
        return records, total

    async def list_for_export(
        self,
        *,
        kind: PaymentProcessKind | None = None,
        stage: PaymentProcessStage | None = None,
        status_filter: str | None = None,
        organization_id: UUID | None = None,
        supplier_id: UUID | None = None,
        contract_id: UUID | None = None,
        competence_month: date | None = None,
        due_from: date | None = None,
        due_to: date | None = None,
        search: str | None = None,
        limit: int = 10000,
    ) -> list[PaymentProcess]:
        stmt = select(PaymentProcess).outerjoin(PaymentSupplier, PaymentSupplier.id == PaymentProcess.supplier_id).outerjoin(
            PaymentContract, PaymentContract.id == PaymentProcess.contract_id
        )
        stmt = stmt.options(*self._process_options())
        filters = self._filters(
            kind=kind,
            stage=stage,
            status_filter=status_filter,
            organization_id=organization_id,
            supplier_id=supplier_id,
            contract_id=contract_id,
            competence_month=competence_month,
            due_from=due_from,
            due_to=due_to,
            search=search,
        )
        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = stmt.order_by(PaymentProcess.due_date.asc().nullslast(), PaymentProcess.issue_date.desc().nullslast(), PaymentProcess.created_at.desc()).limit(limit)
        return list((await self.db.execute(stmt)).scalars().unique().all())

    async def list_suppliers(self, *, search: str | None = None, active_only: bool = False) -> list[PaymentSupplier]:
        stmt = select(PaymentSupplier)
        filters = []
        if active_only:
            filters.append(PaymentSupplier.active.is_(True))
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(or_(PaymentSupplier.name.ilike(term), PaymentSupplier.cnpj.ilike(term), PaymentSupplier.notes.ilike(term)))
        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = stmt.order_by(PaymentSupplier.name.asc())
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_supplier(self, supplier_id: UUID) -> PaymentSupplier | None:
        result = await self.db.execute(select(PaymentSupplier).where(PaymentSupplier.id == supplier_id))
        return result.scalar_one_or_none()

    async def get_supplier_by_name(self, name: str) -> PaymentSupplier | None:
        result = await self.db.execute(select(PaymentSupplier).where(func.upper(PaymentSupplier.name) == name.upper()))
        return result.scalar_one_or_none()

    async def get_supplier_by_cnpj(self, cnpj: str) -> PaymentSupplier | None:
        result = await self.db.execute(select(PaymentSupplier).where(PaymentSupplier.cnpj == cnpj))
        return result.scalar_one_or_none()

    async def create_supplier(self, supplier: PaymentSupplier) -> PaymentSupplier:
        self.db.add(supplier)
        await self.db.flush()
        return supplier

    async def list_contracts(
        self,
        *,
        supplier_id: UUID | None = None,
        status_filter: PaymentContractStatus | None = None,
        kind: PaymentProcessKind | None = None,
        search: str | None = None,
    ) -> list[PaymentContract]:
        stmt = select(PaymentContract).options(*self._contract_options()).join(PaymentSupplier, PaymentSupplier.id == PaymentContract.supplier_id)
        filters = []
        if supplier_id:
            filters.append(PaymentContract.supplier_id == supplier_id)
        if status_filter:
            filters.append(PaymentContract.status == status_filter)
        if kind:
            filters.append(PaymentContract.kind == kind)
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(
                or_(
                    PaymentContract.number.ilike(term),
                    PaymentContract.contract_type.ilike(term),
                    PaymentContract.object_description.ilike(term),
                    PaymentContract.notes.ilike(term),
                    PaymentSupplier.name.ilike(term),
                )
            )
        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = stmt.order_by(PaymentSupplier.name.asc(), PaymentContract.number.asc())
        return list((await self.db.execute(stmt)).scalars().unique().all())

    async def get_contract(self, contract_id: UUID) -> PaymentContract | None:
        result = await self.db.execute(select(PaymentContract).options(*self._contract_options()).where(PaymentContract.id == contract_id))
        return result.scalar_one_or_none()

    async def get_contract_by_supplier_number(self, supplier_id: UUID, number: str) -> PaymentContract | None:
        result = await self.db.execute(
            select(PaymentContract)
            .options(*self._contract_options())
            .where(PaymentContract.supplier_id == supplier_id, func.upper(PaymentContract.number) == number.upper())
        )
        return result.scalar_one_or_none()

    async def create_contract(self, contract: PaymentContract) -> PaymentContract:
        self.db.add(contract)
        await self.db.flush()
        return contract

    async def create_contract_amendment(self, amendment: PaymentContractAmendment) -> PaymentContractAmendment:
        self.db.add(amendment)
        await self.db.flush()
        return amendment

    async def contract_process_totals(self, contract_id: UUID) -> dict[str, Decimal]:
        active_stages = [stage.value for stage in PaymentProcessStage if stage not in {PaymentProcessStage.CANCELLED, PaymentProcessStage.RETURNED}]
        paid_stages = [PaymentProcessStage.PAID.value, PaymentProcessStage.ARCHIVED.value]
        result = await self.db.execute(
            select(
                func.coalesce(func.sum(PaymentProcess.amount).filter(PaymentProcess.stage.in_(active_stages)), 0),
                func.coalesce(func.sum(PaymentProcess.amount).filter(PaymentProcess.stage.in_(paid_stages)), 0),
            ).where(PaymentProcess.contract_id == contract_id)
        )
        consumed, paid = result.one()
        consumed = Decimal(str(consumed or 0))
        paid = Decimal(str(paid or 0))
        return {"consumed_amount": consumed, "paid_amount": paid, "pending_amount": max(consumed - paid, Decimal("0"))}

    async def list_contract_processes(self, contract_id: UUID) -> list[PaymentProcess]:
        result = await self.db.execute(
            select(PaymentProcess)
            .options(*self._process_options())
            .where(PaymentProcess.contract_id == contract_id)
            .order_by(PaymentProcess.competence_month.asc().nullslast(), PaymentProcess.issue_date.asc().nullslast(), PaymentProcess.created_at.asc())
        )
        return list(result.scalars().unique().all())

    async def contract_organization_ids(self, contract_id: UUID) -> set[UUID]:
        result = await self.db.execute(
            select(PaymentProcess.organization_id)
            .where(PaymentProcess.contract_id == contract_id, PaymentProcess.organization_id.is_not(None))
            .distinct()
        )
        return {item for item in result.scalars().all() if item}

    async def list_fuel_operations_for_supplier(
        self,
        *,
        supplier_cnpj: str | None,
        supplier_name: str | None,
        organization_ids: set[UUID] | None = None,
        start_at: datetime | None = None,
    ) -> list[FuelSupply]:
        stmt = (
            select(FuelSupply)
            .options(joinedload(FuelSupply.vehicle), joinedload(FuelSupply.fuel_station_ref), joinedload(FuelSupply.organization))
            .outerjoin(FuelStation, FuelStation.id == FuelSupply.fuel_station_id)
        )
        filters = []
        identity_filters = []
        if supplier_cnpj:
            digits = "".join(character for character in supplier_cnpj if character.isdigit())
            if digits:
                identity_filters.append(func.regexp_replace(func.coalesce(FuelStation.cnpj, ""), r"\D", "", "g") == digits)
        if supplier_name and supplier_name.strip():
            normalized = supplier_name.strip()
            identity_filters.append(FuelStation.name.ilike(f"%{normalized}%"))
            identity_filters.append(FuelSupply.fuel_station.ilike(f"%{normalized}%"))
        if identity_filters:
            filters.append(or_(*identity_filters))
        if organization_ids:
            filters.append(FuelSupply.organization_id.in_(organization_ids))
        if start_at:
            filters.append(FuelSupply.supplied_at >= start_at)
        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = stmt.order_by(FuelSupply.supplied_at.asc(), FuelSupply.created_at.asc())
        return list((await self.db.execute(stmt)).scalars().unique().all())

    async def list_maintenance_operations_for_organizations(
        self,
        *,
        organization_ids: set[UUID] | None = None,
        start_at: datetime | None = None,
    ) -> list[MaintenanceRecord]:
        stmt = select(MaintenanceRecord).options(joinedload(MaintenanceRecord.vehicle))
        filters = []
        if organization_ids:
            stmt = (
                stmt.join(LocationHistory, LocationHistory.vehicle_id == MaintenanceRecord.vehicle_id)
                .join(Allocation, Allocation.id == LocationHistory.allocation_id)
                .join(Department, Department.id == Allocation.department_id)
            )
            filters.extend(
                [
                    LocationHistory.end_date.is_(None),
                    Department.organization_id.in_(organization_ids),
                ]
            )
        if start_at:
            filters.append(MaintenanceRecord.start_date >= start_at)
        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = stmt.order_by(MaintenanceRecord.start_date.asc(), MaintenanceRecord.created_at.asc())
        return list((await self.db.execute(stmt)).scalars().unique().all())

    def _process_options(self):
        return (
            joinedload(PaymentProcess.organization),
            joinedload(PaymentProcess.supplier),
            joinedload(PaymentProcess.contract).joinedload(PaymentContract.supplier),
            joinedload(PaymentProcess.contract).selectinload(PaymentContract.amendments),
            joinedload(PaymentProcess.contract).selectinload(PaymentContract.processes),
            joinedload(PaymentProcess.assigned_to),
            selectinload(PaymentProcess.references),
            selectinload(PaymentProcess.checklist_items).joinedload(PaymentProcessChecklistItem.updater),
            selectinload(PaymentProcess.stage_events).joinedload(PaymentProcessStageEvent.creator),
        )

    def _contract_options(self):
        return (
            joinedload(PaymentContract.supplier),
            selectinload(PaymentContract.amendments),
        )

    def _filters(
        self,
        *,
        kind: PaymentProcessKind | None,
        stage: PaymentProcessStage | None,
        status_filter: str | None,
        organization_id: UUID | None,
        supplier_id: UUID | None,
        contract_id: UUID | None,
        competence_month: date | None,
        due_from: date | None,
        due_to: date | None,
        search: str | None,
    ) -> list:
        filters = []
        if kind:
            filters.append(PaymentProcess.kind == kind)
        if stage:
            filters.append(PaymentProcess.stage == stage)
        if status_filter:
            filters.append(PaymentProcess.status.ilike(f"%{status_filter.strip()}%"))
        if organization_id:
            filters.append(PaymentProcess.organization_id == organization_id)
        if supplier_id:
            filters.append(PaymentProcess.supplier_id == supplier_id)
        if contract_id:
            filters.append(PaymentProcess.contract_id == contract_id)
        if competence_month:
            filters.append(PaymentProcess.competence_month == competence_month)
        if due_from:
            filters.append(PaymentProcess.due_date >= due_from)
        if due_to:
            filters.append(PaymentProcess.due_date <= due_to)
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(
                or_(
                    PaymentProcess.process_number.ilike(term),
                    PaymentProcess.system.ilike(term),
                    PaymentProcess.status.ilike(term),
                    PaymentProcess.billing_number.ilike(term),
                    PaymentProcess.invoice_number.ilike(term),
                    PaymentProcess.invoice_type.ilike(term),
                    PaymentProcess.unit_name.ilike(term),
                    PaymentProcess.process_type.ilike(term),
                    PaymentProcess.supplier_name.ilike(term),
                    PaymentProcess.contract_number.ilike(term),
                    PaymentSupplier.name.ilike(term),
                    PaymentContract.number.ilike(term),
                    PaymentProcess.location.ilike(term),
                    PaymentProcess.notes.ilike(term),
                    PaymentProcess.stage_owner.ilike(term),
                    PaymentProcess.status_note.ilike(term),
                    PaymentProcess.commitment_number.ilike(term),
                    PaymentProcess.liquidation_number.ilike(term),
                    PaymentProcess.payment_order_number.ilike(term),
                    cast(PaymentProcess.amount, String).ilike(term),
                )
            )
        return filters
