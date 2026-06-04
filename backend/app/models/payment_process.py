from __future__ import annotations

import enum
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PaymentProcessKind(str, enum.Enum):
    FUEL = "FUEL"
    MAINTENANCE = "MAINTENANCE"


class PaymentProcessStage(str, enum.Enum):
    ASSEMBLY = "ASSEMBLY"
    REVIEW = "REVIEW"
    COMMITMENT = "COMMITMENT"
    LIQUIDATION = "LIQUIDATION"
    PAYMENT = "PAYMENT"
    PAID = "PAID"
    ARCHIVED = "ARCHIVED"
    RETURNED = "RETURNED"
    CANCELLED = "CANCELLED"


class PaymentChecklistStatus(str, enum.Enum):
    PENDING = "PENDING"
    DONE = "DONE"
    WAIVED = "WAIVED"


class PaymentContractStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    FINISHED = "FINISHED"
    CANCELLED = "CANCELLED"


class PaymentProcessReferenceType(str, enum.Enum):
    FUEL_SUPPLY = "FUEL_SUPPLY"
    FUEL_SUPPLY_ORDER = "FUEL_SUPPLY_ORDER"
    MAINTENANCE = "MAINTENANCE"
    VEHICLE = "VEHICLE"
    SERVICE_ORDER = "SERVICE_ORDER"
    INVOICE = "INVOICE"
    OTHER = "OTHER"


class PaymentSupplier(Base):
    __tablename__ = "payment_suppliers"
    __table_args__ = (
        Index("idx_payment_suppliers_name", "name"),
        Index("idx_payment_suppliers_active", "active"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    cnpj: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"), default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    contracts: Mapped[list["PaymentContract"]] = relationship(back_populates="supplier")
    processes: Mapped[list["PaymentProcess"]] = relationship(back_populates="supplier")


class PaymentContract(Base):
    __tablename__ = "payment_contracts"
    __table_args__ = (
        UniqueConstraint("supplier_id", "number", name="uq_payment_contract_supplier_number"),
        Index("idx_payment_contracts_supplier", "supplier_id"),
        Index("idx_payment_contracts_number", "number"),
        Index("idx_payment_contracts_status", "status"),
        Index("idx_payment_contracts_valid_until", "valid_until"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    supplier_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("payment_suppliers.id", ondelete="RESTRICT"), nullable=False)
    number: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[PaymentProcessKind | None] = mapped_column(Enum(PaymentProcessKind, name="payment_process_kind"), nullable=True)
    contract_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    object_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    valid_from: Mapped[date | None] = mapped_column(Date(), nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date(), nullable=True)
    value_initial: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    value_updated: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    imported_balance: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    status: Mapped[PaymentContractStatus] = mapped_column(
        Enum(PaymentContractStatus, name="payment_contract_status"),
        nullable=False,
        default=PaymentContractStatus.ACTIVE,
        server_default=text("'ACTIVE'"),
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    supplier: Mapped["PaymentSupplier"] = relationship(back_populates="contracts")
    amendments: Mapped[list["PaymentContractAmendment"]] = relationship(back_populates="contract", cascade="all, delete-orphan")
    processes: Mapped[list["PaymentProcess"]] = relationship(back_populates="contract")


class PaymentContractAmendment(Base):
    __tablename__ = "payment_contract_amendments"
    __table_args__ = (
        Index("idx_payment_contract_amendments_contract", "contract_id"),
        Index("idx_payment_contract_amendments_number", "number"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    contract_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("payment_contracts.id", ondelete="CASCADE"), nullable=False)
    amendment_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    signed_at: Mapped[date | None] = mapped_column(Date(), nullable=True)
    value_delta: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date(), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    contract: Mapped["PaymentContract"] = relationship(back_populates="amendments")


class PaymentProcess(Base):
    __tablename__ = "payment_processes"
    __table_args__ = (
        Index("idx_payment_processes_kind", "kind"),
        Index("idx_payment_processes_stage", "stage"),
        Index("idx_payment_processes_status", "status"),
        Index("idx_payment_processes_process_number", "process_number"),
        Index("idx_payment_processes_organization_id", "organization_id"),
        Index("idx_payment_processes_supplier_id", "supplier_id"),
        Index("idx_payment_processes_contract_id", "contract_id"),
        Index("idx_payment_processes_competence_month", "competence_month"),
        Index("idx_payment_processes_due_date", "due_date"),
        Index("uq_payment_processes_import_key", "import_key", unique=True),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    import_key: Mapped[str] = mapped_column(String(320), nullable=False)
    process_number: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[PaymentProcessKind] = mapped_column(
        Enum(PaymentProcessKind, name="payment_process_kind"),
        nullable=False,
        default=PaymentProcessKind.FUEL,
    )
    system: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    stage: Mapped[PaymentProcessStage] = mapped_column(
        Enum(PaymentProcessStage, name="payment_process_stage"),
        nullable=False,
        default=PaymentProcessStage.ASSEMBLY,
        server_default=text("'ASSEMBLY'"),
    )
    billing_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    invoice_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    unit_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    organization_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("master_organizations.id", ondelete="SET NULL"),
        nullable=True,
    )
    supplier_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("payment_suppliers.id", ondelete="SET NULL"), nullable=True)
    contract_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("payment_contracts.id", ondelete="SET NULL"), nullable=True)
    issue_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    competence_month: Mapped[date | None] = mapped_column(Date(), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    paid_at: Mapped[date | None] = mapped_column(Date(), nullable=True)
    process_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    supplier_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contract_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    contract_balance: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_to_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    stage_owner: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    commitment_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    commitment_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    liquidation_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    liquidation_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    payment_order_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payment_order_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    source_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_sheet: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    organization: Mapped["Organization | None"] = relationship()
    supplier: Mapped["PaymentSupplier | None"] = relationship(back_populates="processes")
    contract: Mapped["PaymentContract | None"] = relationship(back_populates="processes")
    assigned_to: Mapped["User | None"] = relationship(foreign_keys=[assigned_to_user_id])
    creator: Mapped["User | None"] = relationship(foreign_keys=[created_by_user_id])
    updater: Mapped["User | None"] = relationship(foreign_keys=[updated_by_user_id])
    references: Mapped[list["PaymentProcessReference"]] = relationship(back_populates="process", cascade="all, delete-orphan")
    checklist_items: Mapped[list["PaymentProcessChecklistItem"]] = relationship(back_populates="process", cascade="all, delete-orphan")
    stage_events: Mapped[list["PaymentProcessStageEvent"]] = relationship(back_populates="process", cascade="all, delete-orphan")


class PaymentProcessReference(Base):
    __tablename__ = "payment_process_references"
    __table_args__ = (
        Index("idx_payment_process_references_process", "process_id"),
        Index("idx_payment_process_references_type", "reference_type"),
        Index("idx_payment_process_references_external", "external_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    process_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("payment_processes.id", ondelete="CASCADE"), nullable=False)
    reference_type: Mapped[PaymentProcessReferenceType] = mapped_column(
        Enum(PaymentProcessReferenceType, name="payment_process_reference_type"),
        nullable=False,
        default=PaymentProcessReferenceType.OTHER,
        server_default=text("'OTHER'"),
    )
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    label: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    process: Mapped["PaymentProcess"] = relationship(back_populates="references")


class PaymentProcessChecklistItem(Base):
    __tablename__ = "payment_process_checklist_items"
    __table_args__ = (
        Index("idx_payment_process_checklist_process", "process_id"),
        Index("idx_payment_process_checklist_stage", "stage"),
        Index("idx_payment_process_checklist_status", "status"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    process_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("payment_processes.id", ondelete="CASCADE"), nullable=False)
    stage: Mapped[PaymentProcessStage] = mapped_column(Enum(PaymentProcessStage, name="payment_process_stage"), nullable=False)
    item_label: Mapped[str] = mapped_column(String(180), nullable=False)
    status: Mapped[PaymentChecklistStatus] = mapped_column(
        Enum(PaymentChecklistStatus, name="payment_checklist_status"),
        nullable=False,
        default=PaymentChecklistStatus.PENDING,
        server_default=text("'PENDING'"),
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    process: Mapped["PaymentProcess"] = relationship(back_populates="checklist_items")
    updater: Mapped["User | None"] = relationship(foreign_keys=[updated_by_user_id])


class PaymentProcessStageEvent(Base):
    __tablename__ = "payment_process_stage_events"
    __table_args__ = (
        Index("idx_payment_process_stage_events_process", "process_id"),
        Index("idx_payment_process_stage_events_created_at", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    process_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("payment_processes.id", ondelete="CASCADE"), nullable=False)
    from_stage: Mapped[PaymentProcessStage | None] = mapped_column(Enum(PaymentProcessStage, name="payment_process_stage"), nullable=True)
    to_stage: Mapped[PaymentProcessStage] = mapped_column(Enum(PaymentProcessStage, name="payment_process_stage"), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    alerts_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    process: Mapped["PaymentProcess"] = relationship(back_populates="stage_events")
    creator: Mapped["User | None"] = relationship(foreign_keys=[created_by_user_id])
