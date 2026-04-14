from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID
from sqlalchemy import DateTime, Enum, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class VehicleStatus(str, enum.Enum):
    ATIVO = "ATIVO"
    MANUTENCAO = "MANUTENCAO"
    INATIVO = "INATIVO"


class VehicleOwnershipType(str, enum.Enum):
    PROPRIO = "PROPRIO"
    LOCADO = "LOCADO"
    CEDIDO = "CEDIDO"


class VehicleType(str, enum.Enum):
    SEDAN = "SEDAN"
    HATCH = "HATCH"
    PICAPE = "PICAPE"
    SUV = "SUV"
    PERUA_SW = "PERUA_SW"
    VAN = "VAN"
    MICRO_ONIBUS = "MICRO_ONIBUS"
    ONIBUS = "ONIBUS"
    CAMINHAO = "CAMINHAO"
    MOTOCICLETA = "MOTOCICLETA"
    MAQUINA = "MAQUINA"


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    plate: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    chassis_number: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True, index=True)
    brand: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[str] = mapped_column(String(50), nullable=False)
    vehicle_type: Mapped[VehicleType] = mapped_column(
        Enum(VehicleType, name="vehicle_type"),
        nullable=False,
        default=VehicleType.SEDAN,
    )
    ownership_type: Mapped[VehicleOwnershipType] = mapped_column(
        Enum(VehicleOwnershipType, name="vehicle_ownership_type"),
        nullable=False,
        default=VehicleOwnershipType.PROPRIO,
    )
    status: Mapped[VehicleStatus] = mapped_column(Enum(VehicleStatus, name="vehicle_status"), nullable=False, default=VehicleStatus.ATIVO)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    history: Mapped[list["LocationHistory"]] = relationship(back_populates="vehicle", passive_deletes=True)
    maintenances: Mapped[list["MaintenanceRecord"]] = relationship(back_populates="vehicle", passive_deletes=True)
    possessions: Mapped[list["VehiclePossession"]] = relationship(back_populates="vehicle", passive_deletes=True)
    claims: Mapped[list["Claim"]] = relationship(back_populates="vehicle", passive_deletes=True)
    fines: Mapped[list["Fine"]] = relationship(back_populates="vehicle", passive_deletes=True)
    fuel_supplies: Mapped[list["FuelSupply"]] = relationship(back_populates="vehicle", passive_deletes=True)
