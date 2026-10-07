from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

LoanStatus = Literal['DRAFT', 'AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED', 'REJECTED', 'CANCELLED']


class LoanActorInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    acting_organization_id: UUID
    justification: str | None = Field(default=None, min_length=8, max_length=1000)


class LoanProposalInput(LoanActorInput):
    destination_allocation_id: UUID
    reason: str = Field(min_length=8, max_length=2000)
    expected_return_at: AwareDatetime | None = None
    delivery_odometer_km: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=1)
    delivery_condition: str | None = Field(default=None, min_length=3, max_length=2000)


class LoanCreate(LoanProposalInput):
    vehicle_id: UUID


class LoanUpdate(LoanProposalInput):
    expected_version: int = Field(ge=1)


class LoanAction(LoanActorInput):
    expected_version: int = Field(ge=1)


class LoanReturnRequest(LoanAction):
    return_allocation_id: UUID
    return_odometer_km: Decimal = Field(ge=0, max_digits=12, decimal_places=1)
    return_condition: str = Field(min_length=3, max_length=2000)


class LoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    vehicle_id: UUID
    origin_organization_id: UUID
    recipient_organization_id: UUID
    origin_allocation_id: UUID | None
    destination_allocation_id: UUID | None
    return_allocation_id: UUID | None
    status: LoanStatus
    version: int
    reason: str
    regularized_at: datetime | None = None
    regularization_reference: str | None = None
    origin_representative_id: UUID | None
    recipient_representative_id: UUID | None
    submitted_by_user_id: UUID | None
    return_submitted_by_user_id: UUID | None
    started_at: datetime | None
    expected_return_at: datetime | None
    returned_at: datetime | None
    delivery_odometer_km: Decimal | None
    return_odometer_km: Decimal | None
    delivery_condition: str | None
    return_condition: str | None
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime


class LoanEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    loan_id: UUID
    event_type: str
    actor_user_id: UUID
    represented_organization_id: UUID
    effective_at: datetime | None
    justification: str | None
    details: dict
    created_at: datetime


class LoanView(LoanOut):
    vehicle_plate: str
    vehicle_type: str | None = None
    origin_organization_name: str | None = None
    recipient_organization_name: str | None = None
    origin_allocation_name: str | None = None
    destination_allocation_name: str | None = None
    return_allocation_name: str | None = None


class LoanEventView(LoanEventOut):
    actor_name: str | None = None


class LoanPrintedTermOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    loan_id: UUID
    original_filename: str
    mime_type: str
    size_bytes: int
    uploaded_by_user_id: UUID
    created_at: datetime


class LoanRegularization(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    vehicle_id: UUID
    origin_allocation_id: UUID
    destination_allocation_id: UUID
    return_allocation_id: UUID | None = None
    started_at: AwareDatetime
    returned_at: AwareDatetime | None = None
    expected_return_at: AwareDatetime | None = None
    delivery_odometer_km: Decimal = Field(ge=0, max_digits=12, decimal_places=1)
    return_odometer_km: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=1)
    delivery_condition: str = Field(min_length=3, max_length=2000)
    return_condition: str | None = Field(default=None, min_length=3, max_length=2000)
    reason: str = Field(min_length=8, max_length=2000)
    justification: str = Field(min_length=15, max_length=1000)
    document_reference: str = Field(min_length=8, max_length=1000)
    correct_owner: bool = False

    @model_validator(mode='after')
    def validate_period(self):
        if self.returned_at:
            if self.returned_at <= self.started_at:
                raise ValueError('A devolução deve ser posterior à entrega')
            if self.return_allocation_id is None or self.return_odometer_km is None or not self.return_condition:
                raise ValueError('Informe lotação, odômetro e condições da devolução')
            if self.return_odometer_km < self.delivery_odometer_km:
                raise ValueError('Odômetro da devolução inferior ao da entrega')
        elif any(value is not None for value in (self.return_allocation_id, self.return_odometer_km, self.return_condition)):
            raise ValueError('Dados de devolução exigem data de devolução')
        if self.expected_return_at and self.expected_return_at < self.started_at:
            raise ValueError('Previsão anterior à entrega')
        return self


class LoanRegularizationConfirm(LoanRegularization):
    preview_token: str = Field(pattern=r'^[a-f0-9]{64}$')
