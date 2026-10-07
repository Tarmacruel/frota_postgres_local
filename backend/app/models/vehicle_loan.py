"""Inter-secretariat loans are independent from driver possessions."""
from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

LOAN_STATUSES = ('DRAFT', 'AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED', 'REJECTED', 'CANCELLED')
LOAN_IN_PROGRESS = "status IN ('AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT')"


class VehicleLoan(Base):
    __tablename__ = 'vehicle_loans'
    __table_args__ = (
        CheckConstraint("status IN ('DRAFT', 'AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED', 'REJECTED', 'CANCELLED')", name='ck_vehicle_loans_status'),
        CheckConstraint('origin_organization_id <> recipient_organization_id', name='ck_vehicle_loans_distinct_organizations'),
        CheckConstraint('returned_at IS NULL OR (started_at IS NOT NULL AND returned_at >= started_at)', name='ck_vehicle_loans_dates'),
        CheckConstraint('expected_return_at IS NULL OR started_at IS NULL OR expected_return_at >= started_at', name='ck_vehicle_loans_expected_return'),
        CheckConstraint('delivery_odometer_km IS NULL OR delivery_odometer_km >= 0', name='ck_vehicle_loans_delivery_km'),
        CheckConstraint('return_odometer_km IS NULL OR (delivery_odometer_km IS NOT NULL AND return_odometer_km >= delivery_odometer_km)', name='ck_vehicle_loans_return_km'),
        CheckConstraint("status NOT IN ('ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED') OR (started_at IS NOT NULL AND delivery_odometer_km IS NOT NULL)", name='ck_vehicle_loans_effective_delivery'),
        CheckConstraint("(status = 'RETURNED') = (returned_at IS NOT NULL)", name='ck_vehicle_loans_effective_return'),
        Index('uq_vehicle_loans_in_progress', 'vehicle_id', unique=True, postgresql_where=text(LOAN_IN_PROGRESS), sqlite_where=text(LOAN_IN_PROGRESS)),
        Index('idx_vehicle_loans_origin', 'origin_organization_id'),
        Index('idx_vehicle_loans_recipient', 'recipient_organization_id'),
        Index('idx_vehicle_loans_vehicle_dates', 'vehicle_id', 'started_at', 'returned_at'),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()'))
    vehicle_id: Mapped[UUID] = mapped_column(ForeignKey('vehicles.id', ondelete='RESTRICT'), nullable=False)
    origin_organization_id: Mapped[UUID] = mapped_column(ForeignKey('master_organizations.id', ondelete='RESTRICT'), nullable=False)
    recipient_organization_id: Mapped[UUID] = mapped_column(ForeignKey('master_organizations.id', ondelete='RESTRICT'), nullable=False)
    origin_allocation_id: Mapped[UUID | None] = mapped_column(ForeignKey('master_allocations.id', ondelete='RESTRICT'))
    destination_allocation_id: Mapped[UUID | None] = mapped_column(ForeignKey('master_allocations.id', ondelete='RESTRICT'))
    return_allocation_id: Mapped[UUID | None] = mapped_column(ForeignKey('master_allocations.id', ondelete='RESTRICT'))
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default=text("'DRAFT'"))
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    regularized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    regularization_reference: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    submitted_by_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    return_submitted_by_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    origin_representative_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    recipient_representative_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expected_return_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivery_odometer_km = mapped_column(Numeric(12, 1), nullable=True)
    return_odometer_km = mapped_column(Numeric(12, 1), nullable=True)
    delivery_condition: Mapped[str | None] = mapped_column(Text)
    return_condition: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))


class VehicleLoanEvent(Base):
    __tablename__ = 'vehicle_loan_events'
    __table_args__ = (
        CheckConstraint("event_type IN ('CREATED', 'SUBMITTED', 'RECEIPT_ACCEPTED', 'REJECTED', 'CANCELLED', 'RETURN_SUBMITTED', 'RETURN_ACCEPTED', 'RETURN_REJECTED', 'RETURN_CANCELLED', 'RECTIFIED', 'REGULARIZED')", name='ck_vehicle_loan_events_type'),
        Index('idx_vehicle_loan_events_loan_date', 'loan_id', 'created_at'),
    )
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()'))
    loan_id: Mapped[UUID] = mapped_column(ForeignKey('vehicle_loans.id', ondelete='RESTRICT'), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    represented_organization_id: Mapped[UUID] = mapped_column(ForeignKey('master_organizations.id', ondelete='RESTRICT'), nullable=False)
    effective_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    justification: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))


class VehicleLoanPrintedTerm(Base):
    __tablename__ = 'vehicle_loan_printed_terms'
    __table_args__ = (
        CheckConstraint('size_bytes > 0', name='ck_vehicle_loan_printed_terms_size'),
        Index('idx_vehicle_loan_printed_terms_loan', 'loan_id'),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()'))
    loan_id: Mapped[UUID] = mapped_column(ForeignKey('vehicle_loans.id', ondelete='RESTRICT'), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_by_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))
