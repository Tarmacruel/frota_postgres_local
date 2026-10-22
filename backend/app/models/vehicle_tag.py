"""Personal definitions and shared, independently removable vehicle markings."""
from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import DateTime, ForeignKey, Index, String, Boolean, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class VehicleTag(Base):
    __tablename__ = 'vehicle_tags'
    __table_args__ = (Index('uq_vehicle_tag_owner_name', 'owner_user_id', 'normalized_name', unique=True,
                           postgresql_where=text('deleted_at IS NULL'), sqlite_where=text('deleted_at IS NULL')),)
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text('gen_random_uuid()'))
    owner_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), index=True)
    owner_name: Mapped[str] = mapped_column(String(150), nullable=False)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(80), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text('true'))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text('NOW()'))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text('NOW()'))


class VehicleTagAssignment(Base):
    __tablename__ = 'vehicle_tag_assignments'
    __table_args__ = (
        Index('uq_vehicle_tag_active', 'vehicle_id', 'tag_id', unique=True,
              postgresql_where=text('removed_at IS NULL'), sqlite_where=text('removed_at IS NULL')),
        Index('idx_vehicle_tag_assignment_tag', 'tag_id', 'removed_at'),
    )
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text('gen_random_uuid()'))
    vehicle_id: Mapped[UUID] = mapped_column(ForeignKey('vehicles.id', ondelete='CASCADE'), nullable=False, index=True)
    tag_id: Mapped[UUID] = mapped_column(ForeignKey('vehicle_tags.id', ondelete='RESTRICT'), nullable=False)
    applied_by_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'))
    applied_by_name: Mapped[str] = mapped_column(String(150), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text('NOW()'))
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    removed_by_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'))
    removal_reason: Mapped[str | None] = mapped_column(String(500))
