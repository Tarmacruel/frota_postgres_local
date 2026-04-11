from __future__ import annotations

import enum
from datetime import date, datetime
from uuid import UUID
from sqlalchemy import Boolean, Date, DateTime, Enum, Index, String, text
from sqlalchemy.dialects.postgresql import CITEXT, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class DriverLicenseCategory(str, enum.Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"


class Driver(Base):
    __tablename__ = "drivers"
    __table_args__ = (
        Index("idx_drivers_documento", "documento"),
        Index("idx_drivers_nome", "nome_completo"),
        Index("idx_drivers_ativo", "ativo", postgresql_where=text("ativo = true")),
        Index("uq_drivers_documento_active", "documento", unique=True, postgresql_where=text("ativo = true")),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    nome_completo: Mapped[str] = mapped_column(String(150), nullable=False)
    documento: Mapped[str] = mapped_column(String(20), nullable=False)
    contato: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(CITEXT(), nullable=True)
    cnh_categoria: Mapped[DriverLicenseCategory] = mapped_column(
        Enum(DriverLicenseCategory, name="driver_license_category"),
        nullable=False,
    )
    cnh_validade: Mapped[date | None] = mapped_column(Date, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    possessions: Mapped[list["VehiclePossession"]] = relationship(back_populates="driver")
    claims: Mapped[list["Claim"]] = relationship(back_populates="driver")
