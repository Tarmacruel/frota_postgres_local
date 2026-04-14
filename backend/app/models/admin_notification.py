from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import DateTime, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class AdminNotification(Base):
    __tablename__ = "admin_notifications"
    __table_args__ = (
        Index("idx_admin_notifications_created_at", "created_at"),
        Index("idx_admin_notifications_read_at", "read_at"),
        Index("idx_admin_notifications_event_type", "event_type"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'INFO'"))
    payload = mapped_column(JSONB, nullable=True)
    read_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
