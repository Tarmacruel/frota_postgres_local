"""Contract quantities are independent of money; both ledgers share the contract lock."""
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


def pk():
    return mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text('gen_random_uuid()'))


class ContractItem(Base):
    __tablename__ = 'contract_items'
    __table_args__ = (UniqueConstraint('contract_id', 'code', name='uq_contract_item_code'),
        CheckConstraint('original_quantity > 0 AND original_unit_price > 0 AND reference_unit_price > 0', name='ck_contract_item_base_positive'))
    id: Mapped[UUID] = pk()
    contract_id: Mapped[UUID] = mapped_column(ForeignKey('payment_contracts.id', ondelete='RESTRICT'), index=True)
    code: Mapped[str] = mapped_column(String(80))
    original_number: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(30))
    unit: Mapped[str] = mapped_column(String(30))
    product_key: Mapped[str | None] = mapped_column(String(80))
    group_key: Mapped[str | None] = mapped_column(String(80))
    original_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3))
    original_unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 6))
    reference_unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 6))
    historical_added_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    opening_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text('true'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ContractQuantityControl(Base):
    __tablename__ = 'contract_quantity_controls'
    contract_id: Mapped[UUID] = mapped_column(ForeignKey('payment_contracts.id', ondelete='RESTRICT'), primary_key=True)
    adjudication: Mapped[str] = mapped_column(String(10))
    justification: Mapped[str] = mapped_column(Text)
    document_reference: Mapped[str] = mapped_column(String(255))
    request_key: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), unique=True)
    request_fingerprint: Mapped[str] = mapped_column(String(64))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    opened_by: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))


class ContractItemPrice(Base):
    __tablename__ = 'contract_item_prices'
    __table_args__ = (CheckConstraint('unit_price > 0', name='ck_item_price_positive'), Index('idx_item_price_lookup', 'item_id', 'provider_id', 'valid_from'))
    id: Mapped[UUID] = pk()
    item_id: Mapped[UUID] = mapped_column(ForeignKey('contract_items.id', ondelete='RESTRICT'))
    provider_id: Mapped[UUID] = mapped_column(ForeignKey('contract_providers.id', ondelete='RESTRICT'))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 6))
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fuel_price_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_fuel_prices.id', ondelete='RESTRICT'))
    amendment_id: Mapped[UUID | None] = mapped_column(ForeignKey('payment_contract_amendments.id', ondelete='RESTRICT'))
    created_by: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))


class ContractReservationItem(Base):
    __tablename__ = 'contract_reservation_items'
    __table_args__ = (UniqueConstraint('reservation_id', 'item_id', name='uq_reservation_item'), CheckConstraint('quantity >= 0', name='ck_reservation_quantity_nonnegative'))
    id: Mapped[UUID] = pk()
    reservation_id: Mapped[UUID] = mapped_column(ForeignKey('contract_reservations.id', ondelete='RESTRICT'), index=True)
    item_id: Mapped[UUID] = mapped_column(ForeignKey('contract_items.id', ondelete='RESTRICT'))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 6))
    price_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_item_prices.id', ondelete='RESTRICT'))


class ContractOperationItem(Base):
    __tablename__ = 'contract_operation_items'
    id: Mapped[UUID] = pk()
    operation_id: Mapped[UUID] = mapped_column(ForeignKey('contract_operations.id', ondelete='RESTRICT'), index=True)
    item_id: Mapped[UUID | None] = mapped_column(ForeignKey('contract_items.id', ondelete='RESTRICT'))
    description: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(30))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 6))
    amount: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    revision: Mapped[int] = mapped_column(Integer, default=0, server_default=text('0'))


class ContractItemMovement(Base):
    __tablename__ = 'contract_item_movements'
    __table_args__ = (UniqueConstraint('event_key', name='uq_item_movement_event'), Index('idx_item_movement_contract', 'contract_id', 'occurred_at'))
    id: Mapped[UUID] = pk()
    contract_id: Mapped[UUID] = mapped_column(ForeignKey('payment_contracts.id', ondelete='RESTRICT'))
    item_id: Mapped[UUID] = mapped_column(ForeignKey('contract_items.id', ondelete='RESTRICT'), index=True)
    event_key: Mapped[str] = mapped_column(String(200))
    movement_type: Mapped[str] = mapped_column(String(40))
    quantity_delta: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=0, server_default=text('0'))
    reserved_delta: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=0, server_default=text('0'))
    source_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    details: Mapped[dict | None] = mapped_column(JSONB)
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ContractAmendmentItem(Base):
    __tablename__ = 'contract_amendment_items'
    id: Mapped[UUID] = pk()
    amendment_id: Mapped[UUID] = mapped_column(ForeignKey('payment_contract_amendments.id', ondelete='RESTRICT'), index=True)
    item_id: Mapped[UUID] = mapped_column(ForeignKey('contract_items.id', ondelete='RESTRICT'))
    document_number: Mapped[str | None] = mapped_column(String(80))
    quantity_delta: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=0)
    value_delta: Mapped[Decimal] = mapped_column(Numeric(16, 2), default=0)
    snapshot: Mapped[dict] = mapped_column(JSONB)
