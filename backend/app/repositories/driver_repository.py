from __future__ import annotations

from uuid import UUID
from datetime import date, datetime, timedelta
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.claim import Claim
from app.models.driver import Driver
from app.models.master_data import Organization
from app.models.possession import VehiclePossession
from app.core.official_identity import INSTITUTIONAL_TIMEZONE
from app.schemas.driver import DriverCnhStatus


def driver_reference_date() -> date:
    return datetime.now(INSTITUTIONAL_TIMEZONE).date()


def cnh_predicates(today: date):
    return {
        DriverCnhStatus.EXPIRED: Driver.cnh_validade < today,
        DriverCnhStatus.EXPIRING_30: Driver.cnh_validade.between(today, today + timedelta(days=30)),
        DriverCnhStatus.EXPIRING_60: Driver.cnh_validade.between(today, today + timedelta(days=60)),
        DriverCnhStatus.MISSING: or_(func.trim(func.coalesce(Driver.cnh_numero, "")) == "", Driver.cnh_validade.is_(None)),
    }


class DriverRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, driver_id: UUID) -> Driver | None:
        result = await self.db.execute(select(Driver).options(joinedload(Driver.organization)).where(Driver.id == driver_id))
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
        organization_id: UUID | None = None,
        cnh_status: DriverCnhStatus | None = None,
        with_summary: bool = False,
        reference_date: date | None = None,
    ):
        stmt = select(Driver).options(joinedload(Driver.organization)).outerjoin(Organization, Organization.id == Driver.organization_id)
        filters = []
        if active_only is not None:
            filters.append(Driver.ativo.is_(active_only))
        if organization_id:
            filters.append(Driver.organization_id == organization_id)
        if search:
            term = f"%{search.strip()}%"
            filters.append(or_(Driver.nome_completo.ilike(term), Driver.documento.ilike(term), Driver.matricula.ilike(term), Organization.name.ilike(term)))
        today = reference_date or driver_reference_date()
        predicates = cnh_predicates(today)
        summary = None
        if with_summary:
            summary_stmt = select(func.count(Driver.id).label("total"), *[
                func.count(Driver.id).filter(predicate).label(key.value) for key, predicate in predicates.items()
            ]).outerjoin(Organization, Organization.id == Driver.organization_id).where(*filters)
            summary = dict((await self.db.execute(summary_stmt)).mappings().one())
            summary["reference_date"] = today
        if cnh_status is not None:
            filters.append(predicates[DriverCnhStatus(cnh_status)])
        count_stmt = select(func.count(Driver.id)).outerjoin(Organization, Organization.id == Driver.organization_id).where(*filters)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        stmt = stmt.where(*filters).order_by(Driver.ativo.desc(), Driver.nome_completo.asc(), Driver.created_at.desc(), Driver.id.asc()).offset((page - 1) * limit).limit(limit)
        items = list((await self.db.execute(stmt)).scalars().all())
        return (items, total, summary) if with_summary else (items, total)

    async def list_active(self, *, search: str | None = None, limit: int = 1000, organization_id: UUID | None = None) -> list[Driver]:
        stmt = (
            select(Driver)
            .options(joinedload(Driver.organization))
            .outerjoin(Organization, Organization.id == Driver.organization_id)
            .where(Driver.ativo.is_(True))
        )
        if organization_id:
            stmt = stmt.where(Driver.organization_id == organization_id)
        if search:
            term = f"%{search.strip()}%"
            stmt = stmt.where(or_(Driver.nome_completo.ilike(term), Driver.documento.ilike(term), Driver.matricula.ilike(term), Organization.name.ilike(term)))
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
