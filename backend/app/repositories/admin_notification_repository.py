from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.admin_notification import AdminNotification


class AdminNotificationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, notification: AdminNotification) -> AdminNotification:
        self.db.add(notification)
        await self.db.flush()
        return notification

    async def list_recent(self, limit: int = 50) -> list[AdminNotification]:
        result = await self.db.execute(
            select(AdminNotification)
            .order_by(AdminNotification.read_at.is_not(None), AdminNotification.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def mark_as_read(self, notification_id: UUID, read_at: datetime) -> bool:
        notification = await self.db.get(AdminNotification, notification_id)
        if not notification:
            return False
        notification.read_at = read_at
        await self.db.flush()
        return True

    async def count_unread(self) -> int:
        result = await self.db.execute(
            select(func.count(AdminNotification.id)).where(AdminNotification.read_at.is_(None))
        )
        return int(result.scalar_one() or 0)
