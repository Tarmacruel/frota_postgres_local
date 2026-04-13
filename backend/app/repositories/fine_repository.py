from __future__ import annotations

from uuid import UUID
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.fine import Fine, FineStatus


class FineRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, fine_id: UUID) -> Fine | None:
        result = await self.db.execute(select(Fine).options(joinedload(Fine.vehicle), joinedload(Fine.driver)).where(Fine.id == fine_id))
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        vehicle_id: UUID | None = None,
        status: FineStatus | None = None,
        search: str | None = None,
    ) -> tuple[list[Fine], int]:
        stmt = select(Fine).options(joinedload(Fine.vehicle), joinedload(Fine.driver))
        count_stmt = select(func.count(Fine.id))

        if vehicle_id:
            stmt = stmt.where(Fine.vehicle_id == vehicle_id)
            count_stmt = count_stmt.where(Fine.vehicle_id == vehicle_id)
        if status:
            stmt = stmt.where(Fine.status == status)
            count_stmt = count_stmt.where(Fine.status == status)
        if search:
            term = f"%{search.strip()}%"
            filter_clause = or_(Fine.ticket_number.ilike(term), Fine.description.ilike(term), Fine.location.ilike(term))
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
