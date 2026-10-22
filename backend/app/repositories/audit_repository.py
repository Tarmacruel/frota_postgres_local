from __future__ import annotations

from app.repositories.interactive_kpis import populate_indicators

from uuid import UUID
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.master_data import Organization


class AuditRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, audit_log: AuditLog) -> AuditLog:
        self.db.add(audit_log)
        await self.db.flush()
        await self.db.refresh(audit_log)
        return audit_log

    async def list(
        self,
        limit: int = 100,
        entity_type: str | None = None,
        action: str | None = None,
        actor_user_id: UUID | None = None,
    ) -> list[AuditLog]:
        stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)

        if entity_type:
            stmt = stmt.where(AuditLog.entity_type == entity_type.upper())
        if action:
            stmt = stmt.where(AuditLog.action == action.upper())
        if actor_user_id:
            stmt = stmt.where(AuditLog.actor_user_id == actor_user_id)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_paginated(self, *, page: int, limit: int, search: str | None = None,
                             action: str | None = None, entity_type: str | None = None,
                             organization_id: UUID | None = None,
                             without_organization: bool = False) -> tuple[list[dict], int, int]:
        base = select(AuditLog, Organization.name.label("organization_name"),
                      Organization.id.label("organization_id"))
        base = base.outerjoin(User, User.id == AuditLog.actor_user_id).outerjoin(
            Organization, Organization.id == User.organization_id)
        if action:
            base = base.where(AuditLog.action == action.upper())
        if entity_type:
            base = base.where(AuditLog.entity_type == entity_type.upper())
        if organization_id:
            base = base.where(Organization.id == organization_id)
        if without_organization:
            base = base.where(Organization.id.is_(None))
        if search and search.strip():
            term = f"%{search.strip()}%"
            base = base.where(or_(AuditLog.actor_name.ilike(term), AuditLog.actor_email.ilike(term),
                                  AuditLog.entity_label.ilike(term), AuditLog.entity_type.ilike(term),
                                  AuditLog.action.ilike(term), Organization.name.ilike(term),
                                  cast(AuditLog.details, String).ilike(term)))
        base = await populate_indicators(self.db, 'audit', base)
        count_base = base.order_by(None).subquery()
        total = (await self.db.execute(select(func.count()).select_from(count_base))).scalar_one()
        deleted = (await self.db.execute(select(func.count()).select_from(count_base).where(count_base.c.action == "DELETE"))).scalar_one()
        result = await self.db.execute(base.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                                       .offset((page - 1) * limit).limit(limit))
        return [{**log.__dict__, "organization_name": name or "Sem secretaria",
                 "organization_id": org_id} for log, name, org_id in result.all()], total, deleted
