from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_admin
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.admin_notification import AdminNotificationCountOut, AdminNotificationOut
from app.services.admin_notification_service import AdminNotificationService

router = APIRouter(prefix="/api/admin-notifications", tags=["AdminNotifications"])


@router.get("", response_model=list[AdminNotificationOut])
async def list_admin_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_admin),
):
    return await AdminNotificationService(db).list_recent(limit=limit)


@router.get("/unread-count", response_model=AdminNotificationCountOut)
async def unread_count(
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_admin),
):
    return {"unread": await AdminNotificationService(db).unread_count()}


@router.post("/{notification_id}/read", response_model=AdminNotificationCountOut)
async def mark_notification_as_read(
    notification_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_admin),
):
    service = AdminNotificationService(db)
    await service.mark_as_read(notification_id)
    await db.commit()
    return {"unread": await service.unread_count()}
