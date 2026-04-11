from __future__ import annotations

from uuid import UUID
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.claim import Claim
from app.models.driver import Driver
from app.models.possession import VehiclePossession


class DriverRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, driver_id: UUID) -> Driver | None:
        result = await self.db.execute(select(Driver).where(Driver.id == driver_id))
        return result.scalar_one_or_none()

    async def get_active_by_document(self, documento: str, *, exclude_id: UUID | None = None) -> Driver | None:
        stmt = select(Driver).where(Driver.documento == documento, Driver.ativo.is_(True))
        if exclude_id:
            stmt = stmt.where(Driver.id != exclude_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        search: str | None = None,
        active_only: bool | None = None,
    ) -> tuple[list[Driver], int]:
        stmt = select(Driver)
        count_stmt = select(func.count(Driver.id))

        if active_only is True:
            stmt = stmt.where(Driver.ativo.is_(True))
            count_stmt = count_stmt.where(Driver.ativo.is_(True))
        elif active_only is False:
            stmt = stmt.where(Driver.ativo.is_(False))
            count_stmt = count_stmt.where(Driver.ativo.is_(False))

        if search:
            term = f"%{search.strip()}%"
            filter_clause = or_(Driver.nome_completo.ilike(term), Driver.documento.ilike(term))
            stmt = stmt.where(filter_clause)
            count_stmt = count_stmt.where(filter_clause)

        stmt = stmt.order_by(Driver.ativo.desc(), Driver.nome_completo.asc(), Driver.created_at.desc()).offset((page - 1) * limit).limit(limit)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        items = list((await self.db.execute(stmt)).scalars().all())
        return items, total

    async def list_active(self, *, search: str | None = None, limit: int = 100) -> list[Driver]:
        stmt = select(Driver).where(Driver.ativo.is_(True))
        if search:
            term = f"%{search.strip()}%"
            stmt = stmt.where(or_(Driver.nome_completo.ilike(term), Driver.documento.ilike(term)))
        stmt = stmt.order_by(Driver.nome_completo.asc()).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, driver: Driver) -> Driver:
        self.db.add(driver)
        await self.db.flush()
        await self.db.refresh(driver)
        return driver

    async def count_links(self, driver_id: UUID) -> int:
        possession_total = int(
            (await self.db.execute(select(func.count(VehiclePossession.id)).where(VehiclePossession.driver_id == driver_id))).scalar_one()
        )
        claim_total = int((await self.db.execute(select(func.count(Claim.id)).where(Claim.driver_id == driver_id))).scalar_one())
        return possession_total + claim_total
