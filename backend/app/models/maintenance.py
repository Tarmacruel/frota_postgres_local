from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"
    __table_args__ = (
        CheckConstraint("total_cost >= 0", name="check_total_cost_non_negative"),
        Index("idx_maintenance_vehicle", "vehicle_id"),
        Index("idx_maintenance_dates", "start_date", "end_date"),
        Index("idx_maintenance_created_by", "created_by"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    vehicle_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
    )
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    service_description: Mapped[str] = mapped_column(Text, nullable=False)
    parts_replaced: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    vehicle: Mapped["Vehicle"] = relationship(back_populates="maintenances")
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
