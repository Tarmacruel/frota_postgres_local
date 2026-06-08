from __future__ import annotations

from uuid import UUID
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.fine import Fine, FineInfraction, FineStatus
from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department


class FineRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, fine_id: UUID) -> Fine | None:
        result = await self.db.execute(
            select(Fine)
            .options(joinedload(Fine.vehicle), joinedload(Fine.driver), joinedload(Fine.infraction_type))
            .where(Fine.id == fine_id)
        )
        return result.scalar_one_or_none()

    async def get_by_ticket_and_vehicle(self, ticket_number: str, vehicle_id: UUID) -> Fine | None:
        result = await self.db.execute(
            select(Fine)
            .options(joinedload(Fine.vehicle), joinedload(Fine.driver), joinedload(Fine.infraction_type))
            .where(Fine.ticket_number == ticket_number, Fine.vehicle_id == vehicle_id)
        )
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        vehicle_id: UUID | None = None,
        organization_id: UUID | None = None,
        status: FineStatus | None = None,
        search: str | None = None,
    ) -> tuple[list[Fine], int]:
        stmt = select(Fine).options(joinedload(Fine.vehicle), joinedload(Fine.driver), joinedload(Fine.infraction_type))
        count_stmt = select(func.count(Fine.id))

        if vehicle_id:
            stmt = stmt.where(Fine.vehicle_id == vehicle_id)
            count_stmt = count_stmt.where(Fine.vehicle_id == vehicle_id)
        if organization_id:
            stmt = (
                stmt
                .join(LocationHistory, (LocationHistory.vehicle_id == Fine.vehicle_id) & LocationHistory.end_date.is_(None))
                .join(Allocation, Allocation.id == LocationHistory.allocation_id)
                .join(Department, Department.id == Allocation.department_id)
                .where(Department.organization_id == organization_id)
            )
            count_stmt = (
                count_stmt
                .join(LocationHistory, (LocationHistory.vehicle_id == Fine.vehicle_id) & LocationHistory.end_date.is_(None))
                .join(Allocation, Allocation.id == LocationHistory.allocation_id)
                .join(Department, Department.id == Allocation.department_id)
                .where(Department.organization_id == organization_id)
            )
        if status:
            stmt = stmt.where(Fine.status == status)
            count_stmt = count_stmt.where(Fine.status == status)
        if search:
            term = f"%{search.strip()}%"
            stmt = stmt.outerjoin(FineInfraction, FineInfraction.id == Fine.infraction_type_id)
            count_stmt = count_stmt.outerjoin(FineInfraction, FineInfraction.id == Fine.infraction_type_id)
            filter_clause = or_(
                Fine.ticket_number.ilike(term),
                Fine.description.ilike(term),
                Fine.location.ilike(term),
                FineInfraction.code.ilike(term),
                FineInfraction.description.ilike(term),
            )
            stmt = stmt.where(filter_clause)
            count_stmt = count_stmt.where(filter_clause)

        stmt = stmt.order_by(Fine.infraction_date.desc(), Fine.created_at.desc()).offset((page - 1) * limit).limit(limit)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        items = list((await self.db.execute(stmt)).scalars().unique().all())
        return items, total

    async def create(self, fine: Fine) -> Fine:
        self.db.add(fine)
        await self.db.flush()
        await self.db.refresh(fine)
        return fine

    async def list_infractions(
        self,
        *,
        search: str | None = None,
        active_only: bool = True,
        limit: int = 200,
    ) -> list[FineInfraction]:
        stmt = select(FineInfraction)
        if active_only:
            stmt = stmt.where(FineInfraction.is_active.is_(True))
        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    FineInfraction.code.ilike(term),
                    FineInfraction.desdobramento.ilike(term),
                    FineInfraction.description.ilike(term),
                    FineInfraction.ctb_article.ilike(term),
                    FineInfraction.normalized_description.ilike(term),
                )
            )
        stmt = stmt.order_by(FineInfraction.is_provisional.asc(), FineInfraction.code.asc(), FineInfraction.desdobramento.asc()).limit(limit)
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_infraction_by_id(self, infraction_id: UUID) -> FineInfraction | None:
        return (await self.db.execute(select(FineInfraction).where(FineInfraction.id == infraction_id))).scalar_one_or_none()

    async def get_infraction_by_code(self, code: str, desdobramento: str | None = None) -> FineInfraction | None:
        stmt = select(FineInfraction).where(FineInfraction.code == code)
        if desdobramento is not None:
            stmt = stmt.where(FineInfraction.desdobramento == desdobramento)
        stmt = stmt.order_by(FineInfraction.desdobramento.asc())
        return (await self.db.execute(stmt)).scalars().first()

    async def get_infraction_by_normalized_description(self, normalized_description: str) -> FineInfraction | None:
        return (
            await self.db.execute(
                select(FineInfraction).where(FineInfraction.normalized_description == normalized_description).order_by(FineInfraction.is_provisional.asc())
            )
        ).scalars().first()

    async def create_infraction(self, infraction: FineInfraction) -> FineInfraction:
        self.db.add(infraction)
        await self.db.flush()
        await self.db.refresh(infraction)
        return infraction
