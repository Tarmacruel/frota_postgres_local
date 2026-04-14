from __future__ import annotations

import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from sqlalchemy import Date, DateTime, Enum, ForeignKey, Index, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class FineStatus(str, enum.Enum):
    PENDENTE = "PENDENTE"
    PAGA = "PAGA"
    RECURSO = "RECURSO"


class Fine(Base):
    __tablename__ = "fines"
    __table_args__ = (
        Index("idx_fines_vehicle", "vehicle_id"),
        Index("idx_fines_driver", "driver_id"),
        Index("idx_fines_due_date", "due_date"),
        Index("idx_fines_status", "status"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    vehicle_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False)
    driver_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True)
    ticket_number: Mapped[str] = mapped_column(String(50), nullable=False)
    infraction_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date = mapped_column(Date, nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    location = mapped_column(String(200), nullable=True)
    status: Mapped[FineStatus] = mapped_column(Enum(FineStatus, name="fine_status"), nullable=False, server_default=text("'PENDENTE'"))
    created_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    vehicle: Mapped["Vehicle"] = relationship(back_populates="fines")
    driver: Mapped["Driver | None"] = relationship(back_populates="fines")
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
