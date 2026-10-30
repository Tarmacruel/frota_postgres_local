from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class SystemSettings(Base):
    __tablename__ = 'system_settings'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    values: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    updated_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text('NOW()'), nullable=False)


class RecordControl(Base):
    __tablename__ = 'record_controls'
    module: Mapped[str] = mapped_column(String(40), primary_key=True)
    record_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    inactive: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text('false'), nullable=False, index=True)
    custom_fields: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    lifecycle_effects: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default=text('1'), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(1000))
    updated_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text('NOW()'), nullable=False)
