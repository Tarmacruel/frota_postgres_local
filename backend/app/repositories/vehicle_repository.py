from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department, Organization
from app.models.possession import VehiclePossession
from app.repositories.vehicle_scope import vehicle_visible
from app.models.vehicle import Vehicle, VehicleOwnershipType, VehicleStatus

DEFAULT_VEHICLE_LIST_LIMIT = 1000


class VehicleRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, vehicle_id: UUID) -> Vehicle | None:
        result = await self.db.execute(select(Vehicle).where(Vehicle.id == vehicle_id))
        return result.scalar_one_or_none()

    async def list_options(self, organization_id: UUID | None = None) -> list[dict]:
        stmt = select(
            Vehicle.id, Vehicle.plate, Vehicle.brand, Vehicle.model, Vehicle.chassis_number,
            Vehicle.renavam, Vehicle.is_provisional,
            Vehicle.ownership_type, Vehicle.owner_organization_id,
            LocationHistory.department.label('legacy_department'),
            Allocation.id.label('allocation_id'), Allocation.name.label('allocation_name'),
            Department.id.label('department_id'), Department.name.label('department_name'),
            Organization.id.label('organization_id'), Organization.name.label('organization_name'),
            VehiclePossession.driver_name.label('current_driver_name'),
        ).outerjoin(LocationHistory, and_(LocationHistory.vehicle_id == Vehicle.id,
            LocationHistory.end_date.is_(None))).outerjoin(
            Allocation, Allocation.id == LocationHistory.allocation_id
        ).outerjoin(Department, Department.id == Allocation.department_id).outerjoin(
            Organization, Organization.id == Department.organization_id
        ).outerjoin(VehiclePossession, and_(VehiclePossession.vehicle_id == Vehicle.id,
            VehiclePossession.end_date.is_(None))).order_by(Vehicle.plate)
        if organization_id:
            stmt = stmt.where(vehicle_visible(Vehicle.id, organization_id))
        rows = (await self.db.execute(stmt)).mappings().all()
        options = []
        for row in rows:
            location = None
            if row['legacy_department']:
                label = ' - '.join(part for part in (row['organization_name'], row['department_name'],
                    row['allocation_name']) if part) if row['allocation_id'] else row['legacy_department']
                location = {'organization_id': row['organization_id'], 'organization_name': row['organization_name'],
                    'department_id': row['department_id'], 'allocation_id': row['allocation_id'], 'display_name': label}
            options.append({
                'id': row['id'], 'plate': row['plate'], 'brand': row['brand'], 'model': row['model'],
                'chassis_number': row['chassis_number'], 'renavam': row['renavam'],
                'is_provisional': row['is_provisional'], 'ownership_type': row['ownership_type'],
                'current_location': location, 'current_department': location['display_name'] if location else None,
                'current_driver_name': row['current_driver_name'],
                'can_operate_vehicle': organization_id is None or organization_id == row['organization_id'],
            })
        return options

    async def list_location_options(self, organization_id: UUID | None = None) -> list[str]:
        stmt = select(LocationHistory.department, Organization.name, Department.name, Allocation.name).join(
            Vehicle, Vehicle.id == LocationHistory.vehicle_id
        ).outerjoin(Allocation, Allocation.id == LocationHistory.allocation_id).outerjoin(
            Department, Department.id == Allocation.department_id
        ).outerjoin(Organization, Organization.id == Department.organization_id).where(
            LocationHistory.end_date.is_(None)
        )
        if organization_id:
            stmt = stmt.where(vehicle_visible(Vehicle.id, organization_id))
        rows = (await self.db.execute(stmt)).all()
        return sorted({(' - '.join(part for part in (organization, department, allocation) if part)
            if allocation else legacy) for legacy, organization, department, allocation in rows if legacy})

    async def get_by_id_for_update(self, vehicle_id: UUID) -> Vehicle | None:
        result = await self.db.execute(
            select(Vehicle)
            .where(Vehicle.id == vehicle_id)
            .with_for_update(of=Vehicle)
        )
        return result.scalar_one_or_none()

    async def get_by_plate(self, plate: str) -> Vehicle | None:
        result = await self.db.execute(select(Vehicle).where(Vehicle.plate == plate.upper()))
        return result.scalar_one_or_none()

    async def list(
        self,
        skip: int = 0,
        limit: int = DEFAULT_VEHICLE_LIST_LIMIT,
        status: VehicleStatus | None = None,
        organization_id: UUID | None = None,
    ) -> list[Vehicle]:
        stmt = select(Vehicle).offset(skip).limit(limit).order_by(Vehicle.created_at.desc())
        if status:
            stmt = stmt.where(Vehicle.status == status)
        if organization_id:
            stmt = self._filter_by_active_organization(stmt, organization_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        status: VehicleStatus | None = None,
        ownership_type: VehicleOwnershipType | None = None,
        tag_ids: list[UUID] | None = None,
        search: str | None = None,
        sort: str = "created_at",
        order: str = "desc",
        organization_id: UUID | None = None,
        filter_organization_id: UUID | None = None,
        unassigned: bool = False,
        location: str | None = None,
        focus_id: UUID | None = None,
        with_summary: bool = False,
    ) -> tuple[list[Vehicle], int] | tuple[list[Vehicle], int, dict]:
        sort_map = {
            "created_at": Vehicle.created_at,
            "updated_at": Vehicle.updated_at,
            "plate": Vehicle.plate,
            "brand": Vehicle.brand,
            "model": Vehicle.model,
        }
        sort_column = sort_map.get(sort, Vehicle.created_at)
        sort_column = sort_column.asc() if order.lower() == "asc" else sort_column.desc()

        location_query = select(LocationHistory.id).join(
            Allocation, Allocation.id == LocationHistory.allocation_id
        ).join(Department, Department.id == Allocation.department_id).join(
            Organization, Organization.id == Department.organization_id
        ).where(LocationHistory.vehicle_id == Vehicle.id, LocationHistory.end_date.is_(None))
        location_label = Organization.name + ' - ' + Department.name + ' - ' + Allocation.name
        conditions = []
        if organization_id:
            conditions.append(vehicle_visible(Vehicle.id, organization_id))
        if focus_id:
            conditions.append(Vehicle.id == focus_id)
        else:
            if tag_ids:
                from app.models.vehicle_tag import VehicleTagAssignment
                conditions.append(select(VehicleTagAssignment.id).where(
                    VehicleTagAssignment.vehicle_id == Vehicle.id, VehicleTagAssignment.tag_id.in_(tag_ids),
                    VehicleTagAssignment.removed_at.is_(None)).correlate(Vehicle).exists())
            if status:
                conditions.append(Vehicle.status == status)
            if ownership_type:
                conditions.append(Vehicle.ownership_type == ownership_type)
            if filter_organization_id:
                conditions.append(or_(Vehicle.owner_organization_id == filter_organization_id,
                    location_query.where(Department.organization_id == filter_organization_id).exists()))
            elif unassigned:
                conditions.append(~location_query.exists())
            if location:
                conditions.append(or_(location_query.where(location_label == location).exists(),
                    select(LocationHistory.id).where(LocationHistory.vehicle_id == Vehicle.id,
                        LocationHistory.end_date.is_(None), LocationHistory.allocation_id.is_(None),
                        LocationHistory.department == location).correlate(Vehicle).exists()))
            if search and search.strip():
                term = f"%{search.strip()}%"
                search_conditions = [Vehicle.plate.ilike(term), Vehicle.chassis_number.ilike(term),
                    Vehicle.brand.ilike(term), Vehicle.model.ilike(term),
                    location_query.where(or_(Organization.name.ilike(term), Department.name.ilike(term),
                        Allocation.name.ilike(term), location_label.ilike(term))).exists(),
                    select(LocationHistory.id).where(LocationHistory.vehicle_id == Vehicle.id,
                        LocationHistory.end_date.is_(None), LocationHistory.department.ilike(term)).correlate(Vehicle).exists(),
                    select(Organization.id).where(Organization.id == Vehicle.owner_organization_id,
                        Organization.name.ilike(term)).correlate(Vehicle).exists(),
                    select(VehiclePossession.id).where(VehiclePossession.vehicle_id == Vehicle.id,
                        VehiclePossession.end_date.is_(None), VehiclePossession.driver_name.ilike(term)).correlate(Vehicle).exists()]
                ownership_labels = {VehicleOwnershipType.PROPRIO: 'Próprio',
                    VehicleOwnershipType.LOCADO: 'Locado', VehicleOwnershipType.CEDIDO: 'Cedido'}
                matching_ownership = [value for value, label in ownership_labels.items()
                    if search.strip().lower() in label.lower()]
                if matching_ownership:
                    search_conditions.append(Vehicle.ownership_type.in_(matching_ownership))
                conditions.append(or_(*search_conditions))

        stmt = select(Vehicle).where(*conditions)
        active_driver = select(VehiclePossession.id).where(
            VehiclePossession.vehicle_id == Vehicle.id, VehiclePossession.end_date.is_(None)
        ).correlate(Vehicle).exists()
        summary_stmt = select(
            func.count(Vehicle.id).label('total'),
            func.count(Vehicle.id).filter(Vehicle.ownership_type == VehicleOwnershipType.PROPRIO).label('own'),
            func.count(Vehicle.id).filter(Vehicle.ownership_type == VehicleOwnershipType.LOCADO).label('rented'),
            func.count(Vehicle.id).filter(Vehicle.ownership_type == VehicleOwnershipType.CEDIDO).label('assigned'),
            func.count(Vehicle.id).filter(Vehicle.status == VehicleStatus.ATIVO).label('active'),
            func.count(Vehicle.id).filter(Vehicle.status == VehicleStatus.MANUTENCAO).label('maintenance'),
            func.count(Vehicle.id).filter(Vehicle.status == VehicleStatus.INATIVO).label('inactive'),
            func.count(Vehicle.id).filter(~active_driver).label('without_driver'),
            func.count(Vehicle.id).filter(Vehicle.status == VehicleStatus.ATIVO, ~active_driver).label('active_without_driver'),
            func.max(Vehicle.updated_at).label('latest_update'),
        ).where(*conditions)

        stmt = stmt.order_by(sort_column).offset((page - 1) * limit).limit(limit)
        if with_summary:
            summary = (await self.db.execute(summary_stmt)).mappings().one()
            total = int(summary['total'])
        else:
            summary = None
            total = int((await self.db.execute(select(func.count(Vehicle.id)).where(*conditions))).scalar_one())
        items = list((await self.db.execute(stmt)).scalars().all())
        return (items, total, dict(summary)) if with_summary else (items, total)

    async def is_vehicle_in_organization(self, vehicle_id: UUID, organization_id: UUID) -> bool:
        stmt = (
            select(Vehicle.id)
            .join(LocationHistory, LocationHistory.vehicle_id == Vehicle.id)
            .join(Allocation, Allocation.id == LocationHistory.allocation_id)
            .join(Department, Department.id == Allocation.department_id)
            .where(
                Vehicle.id == vehicle_id,
                LocationHistory.end_date.is_(None),
                Department.organization_id == organization_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def is_vehicle_visible(self, vehicle_id: UUID, organization_id: UUID) -> bool:
        return await self.db.scalar(select(Vehicle.id).where(
            Vehicle.id == vehicle_id, vehicle_visible(Vehicle.id, organization_id))) is not None

    def _filter_by_active_organization(self, stmt, organization_id: UUID):
        return stmt.where(vehicle_visible(Vehicle.id, organization_id))

    async def create(self, vehicle: Vehicle) -> Vehicle:
        self.db.add(vehicle)
        await self.db.flush()
        await self.db.refresh(vehicle)
        return vehicle

    async def delete(self, vehicle: Vehicle) -> None:
        await self.db.delete(vehicle)

    async def get_active_history(self, vehicle_id: UUID) -> LocationHistory | None:
        result = await self.db.execute(
            select(LocationHistory)
            .options(joinedload(LocationHistory.allocation).joinedload(Allocation.department).joinedload(Department.organization))
            .where(LocationHistory.vehicle_id == vehicle_id, LocationHistory.end_date.is_(None))
            .order_by(LocationHistory.start_date.desc())
        )
        return result.scalar_one_or_none()

    async def list_history(
        self,
        vehicle_id: UUID,
        *,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> list[LocationHistory]:
        stmt = (
            select(LocationHistory)
            .options(joinedload(LocationHistory.allocation).joinedload(Allocation.department).joinedload(Department.organization))
            .where(LocationHistory.vehicle_id == vehicle_id)
            .order_by(LocationHistory.start_date.desc())
        )
        if start_date:
            stmt = stmt.where(or_(LocationHistory.end_date.is_(None), LocationHistory.end_date >= start_date))
        if end_date:
            stmt = stmt.where(LocationHistory.start_date <= end_date)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_history(self, history: LocationHistory) -> LocationHistory:
        self.db.add(history)
        await self.db.flush()
        await self.db.refresh(history)
        return history

    async def get_active_possession(self, vehicle_id: UUID) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .where(VehiclePossession.vehicle_id == vehicle_id, VehiclePossession.end_date.is_(None))
            .order_by(VehiclePossession.start_date.desc())
        )
        return result.scalar_one_or_none()
