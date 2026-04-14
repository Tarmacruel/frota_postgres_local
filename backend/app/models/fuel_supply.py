from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class FuelSupply(Base):
    __tablename__ = "fuel_supplies"
    __table_args__ = (
        Index("idx_fuel_supplies_vehicle", "vehicle_id"),
        Index("idx_fuel_supplies_driver", "driver_id"),
        Index("idx_fuel_supplies_organization", "organization_id"),
        Index("idx_fuel_supplies_supplied_at", "supplied_at"),
        Index("idx_fuel_supplies_anomaly", "is_consumption_anomaly"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    vehicle_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False)
    driver_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("master_organizations.id", ondelete="SET NULL"),
        nullable=True,
    )
    supplied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    odometer_km: Mapped[float] = mapped_column(Float, nullable=False)
    liters: Mapped[float] = mapped_column(Float, nullable=False)
    total_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    fuel_station: Mapped[str | None] = mapped_column(String(180), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    consumption_km_l: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_consumption_anomaly: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    anomaly_details: Mapped[str | None] = mapped_column(Text, nullable=True)

    receipt_path: Mapped[str] = mapped_column(String(255), nullable=False)
    receipt_mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    receipt_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    receipt_uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    vehicle: Mapped["Vehicle"] = relationship(back_populates="fuel_supplies")
    driver: Mapped["Driver | None"] = relationship(back_populates="fuel_supplies")
    organization: Mapped["Organization | None"] = relationship()
