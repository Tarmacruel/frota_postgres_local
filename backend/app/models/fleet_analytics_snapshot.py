from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID
from sqlalchemy import DateTime, Float, ForeignKey, Index, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class FleetAnalyticsSnapshot(Base):
    __tablename__ = "fleet_analytics_snapshots"
    __table_args__ = (
        Index("idx_fleet_analytics_snapshot_period", "period_start", "period_end"),
        Index("idx_fleet_analytics_snapshot_scope", "vehicle_type", "vehicle_id", "driver_id"),
        Index("idx_fleet_analytics_snapshot_created", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    vehicle_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=True)
    driver_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True)
    vehicle_type: Mapped[str] = mapped_column(String(40), nullable=False)
    scope: Mapped[str] = mapped_column(String(30), nullable=False, server_default=text("'VEHICLE'"))

    total_km: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0"))
    total_liters: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0"))
    fuel_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default=text("0"))
    maintenance_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default=text("0"))
    fines_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default=text("0"))

    consumption_l_100km: Mapped[float | None] = mapped_column(Float, nullable=True)
    tco_cost_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    driver_risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    anomalies_count: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))

    category_average_consumption: Mapped[float | None] = mapped_column(Float, nullable=True)
    category_average_tco: Mapped[float | None] = mapped_column(Float, nullable=True)
    market_benchmark_tco: Mapped[float | None] = mapped_column(Float, nullable=True)

    extra_payload = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
