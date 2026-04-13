from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.admin_notification import AdminNotification
from app.repositories.admin_notification_repository import AdminNotificationRepository


class AdminNotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.notifications = AdminNotificationRepository(db)

    async def notify(
        self,
        *,
        title: str,
        message: str,
        event_type: str,
        severity: str = "WARNING",
        payload: dict | None = None,
    ) -> None:
        notification = AdminNotification(
            title=title,
            message=message,
            event_type=event_type,
            severity=severity,
            payload=payload,
        )
        await self.notifications.create(notification)

    async def list_recent(self, limit: int = 50) -> list[AdminNotification]:
        return await self.notifications.list_recent(limit=limit)

    async def mark_as_read(self, notification_id: UUID) -> None:
        updated = await self.notifications.mark_as_read(notification_id, datetime.now(timezone.utc))
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificacao nao encontrada")

    async def unread_count(self) -> int:
        return await self.notifications.count_unread()
