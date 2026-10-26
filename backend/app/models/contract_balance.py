"""Contract commitments and append-only financial history; no inferred legacy links."""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.operational_responsibility import OperationalResponsibilityMixin


def now():
    return datetime.now(timezone.utc)


def pk():
    return mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text('gen_random_uuid()'))


class ContractFundingMixin:
    contract_id: Mapped[UUID | None] = mapped_column(ForeignKey('payment_contracts.id', ondelete='RESTRICT'), nullable=True, index=True)
    contract_provider_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_providers.id', ondelete='RESTRICT'), nullable=True)
    contract_reservation_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_reservations.id', ondelete='RESTRICT'), nullable=True)


class ContractControl(Base):
    __tablename__ = 'contract_controls'
    contract_id: Mapped[UUID] = mapped_column(ForeignKey('payment_contracts.id', ondelete='RESTRICT'), primary_key=True)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    opening_date: Mapped[date] = mapped_column(Date)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    opened_by: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    justification: Mapped[str] = mapped_column(Text)
    divergence_open: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text('false'))
    divergence_note: Mapped[str | None] = mapped_column(Text)


class ContractProvider(Base):
    __tablename__ = 'contract_providers'
    __table_args__ = (
        Index('uq_contract_provider_station', 'contract_id', 'fuel_station_id', unique=True,
              postgresql_where=text('fuel_station_id IS NOT NULL'), sqlite_where=text('fuel_station_id IS NOT NULL')),
        Index('uq_contract_provider_workshop', 'contract_id', 'supplier_id', unique=True,
              postgresql_where=text('fuel_station_id IS NULL'), sqlite_where=text('fuel_station_id IS NULL')),
    )
    id: Mapped[UUID] = pk()
    contract_id: Mapped[UUID] = mapped_column(ForeignKey('payment_contracts.id', ondelete='RESTRICT'), index=True)
    supplier_id: Mapped[UUID] = mapped_column(ForeignKey('payment_suppliers.id', ondelete='RESTRICT'))
    fuel_station_id: Mapped[UUID | None] = mapped_column(ForeignKey('fuel_stations.id', ondelete='RESTRICT'))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text('true'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ContractFuelPrice(Base):
    __tablename__ = 'contract_fuel_prices'
    __table_args__ = (CheckConstraint('unit_price > 0', name='ck_contract_price_positive'),
                     Index('idx_contract_price_lookup', 'provider_id', 'fuel_type', 'valid_from'))
    id: Mapped[UUID] = pk()
    provider_id: Mapped[UUID] = mapped_column(ForeignKey('contract_providers.id', ondelete='RESTRICT'))
    fuel_type: Mapped[str] = mapped_column(String(80))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 6))
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ContractReservation(Base):
    __tablename__ = 'contract_reservations'
    __table_args__ = (UniqueConstraint('source_type', 'source_id', name='uq_contract_reservation_source'),
                     CheckConstraint('amount > 0', name='ck_contract_reservation_positive'))
    id: Mapped[UUID] = pk()
    contract_id: Mapped[UUID] = mapped_column(ForeignKey('payment_contracts.id', ondelete='RESTRICT'), index=True)
    provider_id: Mapped[UUID] = mapped_column(ForeignKey('contract_providers.id', ondelete='RESTRICT'))
    source_type: Mapped[str] = mapped_column(String(30))
    source_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), default='HELD', index=True)
    generation: Mapped[int] = mapped_column(Integer, default=1)
    amount: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    price_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_fuel_prices.id', ondelete='RESTRICT'))
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 6))
    fuel_type: Mapped[str | None] = mapped_column(String(80))
    liters: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    vehicle_id: Mapped[UUID] = mapped_column(ForeignKey('vehicles.id', ondelete='RESTRICT'))
    organization_id: Mapped[UUID | None] = mapped_column(ForeignKey('master_organizations.id', ondelete='RESTRICT'), index=True)
    created_by: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ContractOperation(Base):
    __tablename__ = 'contract_operations'
    __table_args__ = (UniqueConstraint('source_type', 'source_id', name='uq_contract_operation_source'),
                     CheckConstraint('amount >= 0', name='ck_contract_operation_nonnegative'))
    id: Mapped[UUID] = pk()
    contract_id: Mapped[UUID] = mapped_column(ForeignKey('payment_contracts.id', ondelete='RESTRICT'), index=True)
    provider_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_providers.id', ondelete='RESTRICT'))
    reservation_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_reservations.id', ondelete='RESTRICT'), unique=True)
    source_type: Mapped[str] = mapped_column(String(30))
    source_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    amount: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    vehicle_id: Mapped[UUID | None] = mapped_column(ForeignKey('vehicles.id', ondelete='RESTRICT'))
    organization_id: Mapped[UUID | None] = mapped_column(ForeignKey('master_organizations.id', ondelete='RESTRICT'), index=True)
    invoice_process_id: Mapped[UUID | None] = mapped_column(ForeignKey('payment_processes.id', ondelete='RESTRICT'), index=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class ContractMovement(Base):
    __tablename__ = 'contract_movements'
    __table_args__ = (Index('idx_contract_movement_contract_date', 'contract_id', 'created_at'),)
    id: Mapped[UUID] = pk()
    contract_id: Mapped[UUID] = mapped_column(ForeignKey('payment_contracts.id', ondelete='RESTRICT'))
    event_key: Mapped[str] = mapped_column(String(220), unique=True)
    movement_type: Mapped[str] = mapped_column(String(35))
    balance_delta: Mapped[Decimal] = mapped_column(Numeric(16, 2), default=Decimal('0'))
    reserved_delta: Mapped[Decimal] = mapped_column(Numeric(16, 2), default=Decimal('0'))
    consumed_delta: Mapped[Decimal] = mapped_column(Numeric(16, 2), default=Decimal('0'))
    reservation_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_reservations.id', ondelete='RESTRICT'))
    operation_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_operations.id', ondelete='RESTRICT'))
    source_type: Mapped[str] = mapped_column(String(30))
    source_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    vehicle_id: Mapped[UUID | None] = mapped_column(ForeignKey('vehicles.id', ondelete='RESTRICT'))
    organization_id: Mapped[UUID | None] = mapped_column(ForeignKey('master_organizations.id', ondelete='RESTRICT'), index=True)
    provider_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_providers.id', ondelete='RESTRICT'))
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    justification: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ContractReconciliation(Base):
    __tablename__ = 'contract_reconciliations'
    process_id: Mapped[UUID] = mapped_column(ForeignKey('payment_processes.id', ondelete='RESTRICT'), primary_key=True)
    contract_id: Mapped[UUID] = mapped_column(ForeignKey('payment_contracts.id', ondelete='RESTRICT'))
    invoice_amount: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    operation_amount: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    difference: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    justification: Mapped[str | None] = mapped_column(Text)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    reconciled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MaintenanceOrder(OperationalResponsibilityMixin, Base):
    __tablename__ = 'maintenance_orders'
    __table_args__ = (CheckConstraint('estimated_cost > 0', name='ck_maintenance_order_estimate'),)
    id: Mapped[UUID] = pk()
    contract_id: Mapped[UUID] = mapped_column(ForeignKey('payment_contracts.id', ondelete='RESTRICT'), index=True)
    provider_id: Mapped[UUID] = mapped_column(ForeignKey('contract_providers.id', ondelete='RESTRICT'))
    reservation_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_reservations.id', ondelete='RESTRICT'), unique=True)
    vehicle_id: Mapped[UUID] = mapped_column(ForeignKey('vehicles.id', ondelete='RESTRICT'), index=True)
    status: Mapped[str] = mapped_column(String(20), default='AUTHORIZED', index=True)
    service_description: Mapped[str] = mapped_column(Text)
    estimated_cost: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    request_key: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), unique=True)
    maintenance_record_id: Mapped[UUID | None] = mapped_column(ForeignKey('maintenance_records.id', ondelete='RESTRICT'), unique=True)
    created_by: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
