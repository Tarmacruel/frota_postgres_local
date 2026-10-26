from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from typing import Annotated
from pydantic import BaseModel, Field, field_validator


class Justified(BaseModel):
    justification: str = Field(min_length=10, max_length=4000)

    @field_validator('justification')
    @classmethod
    def meaningful_reason(cls, value):
        value = value.strip()
        if len(value) < 10:
            raise ValueError('Informe uma justificativa com pelo menos 10 caracteres')
        return value


class ContractOpening(Justified):
    balance: Decimal = Field(ge=0, max_digits=16, decimal_places=2)
    opening_date: date


class ProviderCreate(BaseModel):
    supplier_id: UUID
    fuel_station_id: UUID | None = None


class PriceCreate(BaseModel):
    provider_id: UUID
    fuel_type: str = Field(min_length=1, max_length=80)
    unit_price: Decimal = Field(gt=0, max_digits=14, decimal_places=6)
    valid_from: datetime | None = None


class PriceUpdate(BaseModel):
    unit_price: Decimal = Field(gt=0, max_digits=14, decimal_places=6)
    valid_from: datetime | None = None


class ContractQuote(BaseModel):
    provider_id: UUID
    fuel_type: str
    liters: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    item_liters: list[Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=3)]] | None = Field(default=None, min_length=1, max_length=500)


class FuelOrderFunding(BaseModel):
    contract_id: UUID
    contract_provider_id: UUID
    requested_fuel_type: str = Field(min_length=1, max_length=80)
    requested_liters: Decimal = Field(gt=0, max_digits=10, decimal_places=3)
    expected_price_id: UUID
    expires_at: datetime | None = None
    justification: str | None = Field(default=None, min_length=10, max_length=1000)


class BalanceAdjustment(Justified):
    amount: Decimal = Field(max_digits=16, decimal_places=2)
    request_key: UUID
    document_reference: str = Field(min_length=2, max_length=255)


class BalanceCorrection(Justified):
    target_available_balance: Decimal = Field(ge=0, max_digits=16, decimal_places=2)
    expected_available_balance: Decimal = Field(max_digits=16, decimal_places=2)
    request_key: UUID


class ReconcileProcess(BaseModel):
    operation_ids: list[UUID] = Field(min_length=1, max_length=1000)
    justification: str | None = Field(default=None, max_length=4000)


class MaintenanceOrderCreate(BaseModel):
    vehicle_id: UUID
    contract_id: UUID
    provider_id: UUID
    service_description: str = Field(min_length=10, max_length=2000)
    estimated_cost: Decimal = Field(gt=0, max_digits=16, decimal_places=2)
    request_key: UUID


class MaintenanceOrderStart(BaseModel):
    start_date: datetime | None = None


class MaintenanceOrderComplete(BaseModel):
    start_date: datetime | None = None
    end_date: datetime | None = None
    total_cost: Decimal = Field(ge=0, max_digits=16, decimal_places=2)
    parts_replaced: str | None = Field(default=None, max_length=1000)


class MaintenanceOrderCancel(Justified):
    pass


class FundingFields(BaseModel):
    contract_id: UUID | None = None
    contract_provider_id: UUID | None = None
    contract_reservation_id: UUID | None = None
    requested_fuel_type: str | None = None
    contract_funding: dict | None = None
