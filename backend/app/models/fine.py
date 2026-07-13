from __future__ import annotations

import enum
from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional
from uuid import UUID
from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, Text, Time, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class FineStatus(str, enum.Enum):
    PENDENTE = "PENDENTE"
    PAGA = "PAGA"
    RECURSO = "RECURSO"
    DEFERIDA = "DEFERIDA"


class FineInfraction(Base):
    __tablename__ = "fine_infractions"
    __table_args__ = (
        UniqueConstraint("code", "desdobramento", name="uq_fine_infractions_code_desdobramento"),
        Index("idx_fine_infractions_code", "code"),
        Index("idx_fine_infractions_active", "is_active"),
        Index("idx_fine_infractions_normalized_description", "normalized_description"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    desdobramento: Mapped[str] = mapped_column(String(10), nullable=False, server_default=text("'0'"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ctb_article: Mapped[str | None] = mapped_column(String(120), nullable=True)
    offender: Mapped[str | None] = mapped_column(String(80), nullable=True)
    severity: Mapped[str | None] = mapped_column(String(80), nullable=True)
    competent_body: Mapped[str | None] = mapped_column(String(120), nullable=True)
    default_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_official: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_provisional: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    fines: Mapped[list["Fine"]] = relationship(back_populates="infraction_type")


class Fine(Base):
    __tablename__ = "fines"
    __table_args__ = (
        Index("idx_fines_vehicle", "vehicle_id"),
        Index("idx_fines_driver", "driver_id"),
        Index("idx_fines_due_date", "due_date"),
        Index("idx_fines_status", "status"),
        Index("idx_fines_infraction_type_id", "infraction_type_id"),
        Index("idx_fines_source_import_row_id", "source_import_row_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    vehicle_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False)
    driver_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True)
    infraction_type_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("fine_infractions.id", ondelete="SET NULL"), nullable=True)
    ticket_number: Mapped[str] = mapped_column(String(50), nullable=False)
    infraction_date: Mapped[date] = mapped_column(Date, nullable=False)
    infraction_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    due_date = mapped_column(Date, nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    location = mapped_column(String(200), nullable=True)
    status: Mapped[FineStatus] = mapped_column(Enum(FineStatus, name="fine_status"), nullable=False, server_default=text("'PENDENTE'"))
    communication_number = mapped_column(String(50), nullable=True)
    sent_date = mapped_column(Date, nullable=True)
    process_number = mapped_column(String(80), nullable=True)
    source_status = mapped_column(String(80), nullable=True)
    imported_driver_name = mapped_column(String(150), nullable=True)
    notes = mapped_column(Text, nullable=True)
    source_import_row_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("data_import_rows.id", ondelete="SET NULL"), nullable=True)
    created_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    vehicle: Mapped["Vehicle"] = relationship(back_populates="fines")
    driver: Mapped["Driver | None"] = relationship(back_populates="fines")
    infraction_type: Mapped["FineInfraction | None"] = relationship(back_populates="fines")
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
