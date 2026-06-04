from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.payment_process import (
    PaymentChecklistStatus,
    PaymentContractStatus,
    PaymentProcessKind,
    PaymentProcessReferenceType,
    PaymentProcessStage,
)
from app.schemas.common import PaginatedResponse


class TextNormalizeMixin(BaseModel):
    @field_validator("*", mode="before")
    @classmethod
    def normalize_blank_strings(cls, value):
        if isinstance(value, str):
            normalized = " ".join(value.split()).strip()
            return normalized or None
        return value


class PaymentSupplierCreate(TextNormalizeMixin):
    name: str = Field(min_length=2, max_length=255)
    cnpj: str | None = Field(default=None, max_length=20)
    active: bool = True
    notes: str | None = Field(default=None, max_length=4000)


class PaymentSupplierUpdate(TextNormalizeMixin):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    cnpj: str | None = Field(default=None, max_length=20)
    active: bool | None = None
    notes: str | None = Field(default=None, max_length=4000)


class PaymentSupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    cnpj: str | None
    active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


class PaymentContractAmendmentCreate(TextNormalizeMixin):
    amendment_type: str | None = Field(default=None, max_length=120)
    number: str | None = Field(default=None, max_length=80)
    signed_at: date | None = None
    value_delta: Decimal | None = None
    valid_until: date | None = None
    notes: str | None = Field(default=None, max_length=4000)


class PaymentContractAmendmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    contract_id: UUID
    amendment_type: str | None
    number: str | None
    signed_at: date | None
    value_delta: Decimal | None
    valid_until: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class PaymentContractCreate(TextNormalizeMixin):
    supplier_id: UUID
    number: str = Field(min_length=1, max_length=80)
    kind: PaymentProcessKind | None = None
    contract_type: str | None = Field(default=None, max_length=120)
    object_description: str | None = Field(default=None, max_length=4000)
    valid_from: date | None = None
    valid_until: date | None = None
    value_initial: Decimal | None = Field(default=None, ge=0)
    value_updated: Decimal | None = Field(default=None, ge=0)
    imported_balance: Decimal | None = Field(default=None, ge=0)
    status: PaymentContractStatus = PaymentContractStatus.ACTIVE
    notes: str | None = Field(default=None, max_length=4000)


class PaymentContractUpdate(TextNormalizeMixin):
    supplier_id: UUID | None = None
    number: str | None = Field(default=None, min_length=1, max_length=80)
    kind: PaymentProcessKind | None = None
    contract_type: str | None = Field(default=None, max_length=120)
    object_description: str | None = Field(default=None, max_length=4000)
    valid_from: date | None = None
    valid_until: date | None = None
    value_initial: Decimal | None = Field(default=None, ge=0)
    value_updated: Decimal | None = Field(default=None, ge=0)
    imported_balance: Decimal | None = Field(default=None, ge=0)
    status: PaymentContractStatus | None = None
    notes: str | None = Field(default=None, max_length=4000)


class PaymentContractOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    supplier_id: UUID
    supplier_name: str | None = None
    number: str
    kind: PaymentProcessKind | None
    contract_type: str | None
    object_description: str | None
    valid_from: date | None
    valid_until: date | None
    value_initial: Decimal | None
    value_updated: Decimal | None
    imported_balance: Decimal | None
    effective_value: Decimal | None = None
    consumed_amount: Decimal = Decimal("0")
    paid_amount: Decimal = Decimal("0")
    pending_amount: Decimal = Decimal("0")
    available_balance: Decimal | None = None
    status: PaymentContractStatus
    notes: str | None
    alerts: list[str] = Field(default_factory=list)
    amendments: list[PaymentContractAmendmentOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PaymentContractManagementKpi(BaseModel):
    key: str
    label: str
    value: Decimal | int | str | None
    formatted: str | None = None
    tone: str = "neutral"
    formula: str | None = None
    source: str | None = None
    detail_type: str = "processes"


class PaymentContractManagementMonth(BaseModel):
    month: date
    label: str
    process_amount: Decimal = Decimal("0")
    operational_amount: Decimal = Decimal("0")
    maintenance_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    paid_amount: Decimal = Decimal("0")
    pending_amount: Decimal = Decimal("0")
    liters: Decimal = Decimal("0")
    records_count: int = 0
    projected_amount: Decimal | None = None
    projected_balance: Decimal | None = None


class PaymentContractManagementRelatedItem(BaseModel):
    id: UUID | str
    kind: str
    label: str
    date: date | datetime | None = None
    amount: Decimal | None = None
    status: str | None = None
    detail: str | None = None


class PaymentContractManagementOut(BaseModel):
    contract: PaymentContractOut
    horizon_months: int
    generated_at: datetime
    source_quality: str
    average_monthly_consumption: Decimal
    monthly_variation_percentage: Decimal | None = None
    projected_depletion_date: date | None = None
    projected_depletion_label: str
    kpis: list[PaymentContractManagementKpi]
    monthly_history: list[PaymentContractManagementMonth]
    monthly_projection: list[PaymentContractManagementMonth]
    related_processes: list[PaymentContractManagementRelatedItem]
    related_operations: list[PaymentContractManagementRelatedItem]
    alerts: list[str] = Field(default_factory=list)


class PaymentContractManagementSummaryItem(BaseModel):
    contract_id: UUID
    contract_number: str
    supplier_name: str | None = None
    kind: PaymentProcessKind | None = None
    effective_value: Decimal | None = None
    consumed_amount: Decimal = Decimal("0")
    paid_amount: Decimal = Decimal("0")
    pending_amount: Decimal = Decimal("0")
    available_balance: Decimal | None = None
    average_monthly_consumption: Decimal = Decimal("0")
    projected_depletion_date: date | None = None
    alerts_count: int = 0
    status: PaymentContractStatus


class PaymentContractManagementSummaryOut(BaseModel):
    total_contracts: int
    active_contracts: int
    critical_contracts: int
    total_available_balance: Decimal
    total_consumed_amount: Decimal
    average_monthly_consumption: Decimal
    ranking: list[PaymentContractManagementSummaryItem]


class PaymentProcessReferenceIn(TextNormalizeMixin):
    reference_type: PaymentProcessReferenceType = PaymentProcessReferenceType.OTHER
    external_id: str | None = Field(default=None, max_length=120)
    label: str = Field(min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=4000)


class PaymentProcessReferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    process_id: UUID
    reference_type: PaymentProcessReferenceType
    external_id: str | None
    label: str
    description: str | None
    created_at: datetime


class PaymentProcessChecklistItemIn(TextNormalizeMixin):
    stage: PaymentProcessStage
    item_label: str = Field(min_length=1, max_length=180)
    status: PaymentChecklistStatus = PaymentChecklistStatus.PENDING
    notes: str | None = Field(default=None, max_length=4000)


class PaymentProcessChecklistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    process_id: UUID
    stage: PaymentProcessStage
    item_label: str
    status: PaymentChecklistStatus
    notes: str | None
    updated_by_user_id: UUID | None
    updated_by_name: str | None = None
    updated_at: datetime
    created_at: datetime


class PaymentProcessStageEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    process_id: UUID
    from_stage: PaymentProcessStage | None
    to_stage: PaymentProcessStage
    comment: str | None
    alerts: list[str] = []
    created_by_user_id: UUID | None
    created_by_name: str | None = None
    created_at: datetime


class PaymentProcessCreate(TextNormalizeMixin):
    process_number: str = Field(min_length=1, max_length=80)
    kind: PaymentProcessKind = PaymentProcessKind.FUEL
    system: str | None = Field(default=None, max_length=80)
    status: str | None = Field(default=None, max_length=80)
    stage: PaymentProcessStage = PaymentProcessStage.ASSEMBLY
    billing_number: str | None = Field(default=None, max_length=80)
    invoice_number: str | None = Field(default=None, max_length=80)
    invoice_type: str | None = Field(default=None, max_length=120)
    unit_name: str | None = Field(default=None, max_length=255)
    organization_id: UUID | None = None
    supplier_id: UUID | None = None
    contract_id: UUID | None = None
    issue_date: date | None = None
    competence_month: date | None = None
    due_date: date | None = None
    paid_at: date | None = None
    process_type: str | None = Field(default=None, max_length=120)
    amount: Decimal | None = Field(default=None, ge=0)
    supplier_name: str | None = Field(default=None, max_length=255)
    contract_number: str | None = Field(default=None, max_length=80)
    contract_balance: Decimal | None = Field(default=None, ge=0)
    location: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    assigned_to_user_id: UUID | None = None
    stage_owner: str | None = Field(default=None, max_length=120)
    status_note: str | None = Field(default=None, max_length=4000)
    commitment_number: str | None = Field(default=None, max_length=80)
    commitment_date: date | None = None
    liquidation_number: str | None = Field(default=None, max_length=80)
    liquidation_date: date | None = None
    payment_order_number: str | None = Field(default=None, max_length=80)
    payment_order_date: date | None = None
    references: list[PaymentProcessReferenceIn] = Field(default_factory=list)


class PaymentProcessUpdate(TextNormalizeMixin):
    process_number: str | None = Field(default=None, min_length=1, max_length=80)
    kind: PaymentProcessKind | None = None
    system: str | None = Field(default=None, max_length=80)
    status: str | None = Field(default=None, max_length=80)
    stage: PaymentProcessStage | None = None
    billing_number: str | None = Field(default=None, max_length=80)
    invoice_number: str | None = Field(default=None, max_length=80)
    invoice_type: str | None = Field(default=None, max_length=120)
    unit_name: str | None = Field(default=None, max_length=255)
    organization_id: UUID | None = None
    supplier_id: UUID | None = None
    contract_id: UUID | None = None
    issue_date: date | None = None
    competence_month: date | None = None
    due_date: date | None = None
    paid_at: date | None = None
    process_type: str | None = Field(default=None, max_length=120)
    amount: Decimal | None = Field(default=None, ge=0)
    supplier_name: str | None = Field(default=None, max_length=255)
    contract_number: str | None = Field(default=None, max_length=80)
    contract_balance: Decimal | None = Field(default=None, ge=0)
    location: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    assigned_to_user_id: UUID | None = None
    stage_owner: str | None = Field(default=None, max_length=120)
    status_note: str | None = Field(default=None, max_length=4000)
    commitment_number: str | None = Field(default=None, max_length=80)
    commitment_date: date | None = None
    liquidation_number: str | None = Field(default=None, max_length=80)
    liquidation_date: date | None = None
    payment_order_number: str | None = Field(default=None, max_length=80)
    payment_order_date: date | None = None
    references: list[PaymentProcessReferenceIn] | None = None


class PaymentProcessStageUpdate(TextNormalizeMixin):
    stage: PaymentProcessStage
    comment: str | None = Field(default=None, max_length=4000)


class PaymentProcessChecklistUpdate(BaseModel):
    items: list[PaymentProcessChecklistItemIn] = Field(default_factory=list)


class PaymentProcessDelete(TextNormalizeMixin):
    reason: str = Field(min_length=8, max_length=500)


class PaymentProcessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    import_key: str
    process_number: str
    kind: PaymentProcessKind
    system: str | None
    status: str | None
    stage: PaymentProcessStage
    stage_label: str | None = None
    billing_number: str | None
    invoice_number: str | None
    invoice_type: str | None
    unit_name: str | None
    organization_id: UUID | None
    organization_name: str | None = None
    supplier_id: UUID | None
    supplier_name: str | None
    contract_id: UUID | None
    contract_number: str | None
    contract_supplier_name: str | None = None
    issue_date: date | None
    competence_month: date | None
    due_date: date | None
    paid_at: date | None
    process_type: str | None
    amount: Decimal | None
    contract_balance: Decimal | None
    location: str | None
    notes: str | None
    assigned_to_user_id: UUID | None
    assigned_to_name: str | None = None
    stage_owner: str | None
    status_note: str | None
    commitment_number: str | None
    commitment_date: date | None
    liquidation_number: str | None
    liquidation_date: date | None
    payment_order_number: str | None
    payment_order_date: date | None
    source_filename: str | None
    source_sheet: str | None
    alerts: list[str] = Field(default_factory=list)
    checklist: list[PaymentProcessChecklistItemOut] = Field(default_factory=list)
    references: list[PaymentProcessReferenceOut] = Field(default_factory=list)
    stage_events: list[PaymentProcessStageEventOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PaymentProcessListResponse(PaginatedResponse[PaymentProcessOut]):
    pass


class PaymentProcessImportRowOut(BaseModel):
    row_number: int
    sheet: str
    process_number: str | None = None
    action: str
    detail: str | None = None


class PaymentProcessImportOut(BaseModel):
    total_rows: int
    created: int
    updated: int
    skipped: int
    errors: int
    rows: list[PaymentProcessImportRowOut]


class PaymentDashboardStageItem(BaseModel):
    stage: PaymentProcessStage
    label: str
    count: int
    amount: Decimal


class PaymentDashboardOut(BaseModel):
    total_processes: int
    open_processes: int
    overdue_processes: int
    due_soon_processes: int
    total_amount: Decimal
    paid_amount: Decimal
    pending_amount: Decimal
    alerts_count: int
    stages: list[PaymentDashboardStageItem]
    contracts: list[PaymentContractOut]
