from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class FuelStation(Base):
    __tablename__ = "fuel_stations"
    __table_args__ = (
        Index("idx_fuel_stations_name", "name"),
        Index("idx_fuel_stations_active", "active"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name: Mapped[str] = mapped_column(String(180), nullable=False, unique=True)
    cnpj: Mapped[str | None] = mapped_column(String(18), nullable=True)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    users: Mapped[list["FuelStationUser"]] = relationship(back_populates="fuel_station", cascade="all, delete-orphan")


class FuelStationUser(Base):
    __tablename__ = "fuel_station_users"
    __table_args__ = (
        UniqueConstraint("user_id", "fuel_station_id", name="uq_fuel_station_users_user_station"),
        Index("idx_fuel_station_users_user", "user_id"),
        Index("idx_fuel_station_users_station", "fuel_station_id"),
        Index("idx_fuel_station_users_active", "active"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    fuel_station_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("fuel_stations.id", ondelete="CASCADE"),
        nullable=False,
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    fuel_station: Mapped["FuelStation"] = relationship(back_populates="users")
    user: Mapped["User"] = relationship(back_populates="fuel_station_links")
