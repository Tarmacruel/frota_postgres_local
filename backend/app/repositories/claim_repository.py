from __future__ import annotations

from uuid import UUID
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.claim import Claim, ClaimStatus, ClaimType


class ClaimRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, claim_id: UUID) -> Claim | None:
        result = await self.db.execute(
            select(Claim)
            .options(joinedload(Claim.vehicle), joinedload(Claim.driver))
            .where(Claim.id == claim_id)
        )
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        vehicle_id: UUID | None = None,
        status: ClaimStatus | None = None,
        tipo: ClaimType | None = None,
        search: str | None = None,
    ) -> tuple[list[Claim], int]:
        stmt = select(Claim).options(joinedload(Claim.vehicle), joinedload(Claim.driver))
        count_stmt = select(func.count(Claim.id))

        if vehicle_id:
            stmt = stmt.where(Claim.vehicle_id == vehicle_id)
            count_stmt = count_stmt.where(Claim.vehicle_id == vehicle_id)
        if status:
            stmt = stmt.where(Claim.status == status)
            count_stmt = count_stmt.where(Claim.status == status)
        if tipo:
            stmt = stmt.where(Claim.tipo == tipo)
            count_stmt = count_stmt.where(Claim.tipo == tipo)
        if search:
            term = f"%{search.strip()}%"
            filter_clause = or_(
                Claim.descricao.ilike(term),
                Claim.local.ilike(term),
                Claim.boletim_ocorrencia.ilike(term),
            )
            stmt = stmt.where(filter_clause)
            count_stmt = count_stmt.where(filter_clause)

        stmt = stmt.order_by(Claim.data_ocorrencia.desc(), Claim.created_at.desc()).offset((page - 1) * limit).limit(limit)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        items = list((await self.db.execute(stmt)).scalars().unique().all())
        return items, total

    async def create(self, claim: Claim) -> Claim:
        self.db.add(claim)
        await self.db.flush()
        await self.db.refresh(claim)
        return claim
