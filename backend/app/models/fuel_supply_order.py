from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal
from uuid import UUID
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class FuelSupplyOrderStatus(str, enum.Enum):
    OPEN = "OPEN"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class FuelSupplyOrder(Base):
    __tablename__ = "fuel_supply_orders"
    __table_args__ = (
        Index("idx_fuel_supply_orders_status", "status"),
        Index("idx_fuel_supply_orders_expires_at", "expires_at"),
        Index("idx_fuel_supply_orders_vehicle_id", "vehicle_id"),
        Index("idx_fuel_supply_orders_organization_id", "organization_id"),
        Index("idx_fuel_supply_orders_fuel_station_id", "fuel_station_id"),
        Index("idx_fuel_supply_orders_validation_code", "validation_code", unique=True),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    vehicle_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False)
    driver_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True)
    organization_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("master_organizations.id", ondelete="SET NULL"),
        nullable=True,
    )
    fuel_station_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("fuel_stations.id", ondelete="SET NULL"), nullable=True)
    validation_code: Mapped[str] = mapped_column(String(24), nullable=False, unique=True)

    status: Mapped[FuelSupplyOrderStatus] = mapped_column(
        Enum(FuelSupplyOrderStatus, name="fuel_supply_order_status"),
        nullable=False,
        default=FuelSupplyOrderStatus.OPEN,
        server_default=text("'OPEN'"),
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW() + INTERVAL '48 hours'"),
    )

    created_by_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    confirmed_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    requested_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    max_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    vehicle: Mapped["Vehicle"] = relationship()
    driver: Mapped["Driver | None"] = relationship()
    organization: Mapped["Organization | None"] = relationship()
    fuel_station_ref: Mapped["FuelStation | None"] = relationship()
    creator: Mapped["User"] = relationship(foreign_keys=[created_by_user_id])
    confirmer: Mapped["User | None"] = relationship(foreign_keys=[confirmed_by_user_id])
