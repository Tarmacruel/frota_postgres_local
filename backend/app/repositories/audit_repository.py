from __future__ import annotations

from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog


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
