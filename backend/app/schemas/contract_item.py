from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, model_validator

Quantity = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=3)]
Price = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=6)]


class ContractItemCreate(BaseModel):
    code: str = Field(min_length=1, max_length=80)
    original_number: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=2, max_length=500)
    category: Literal['FUEL', 'ADDITIVE', 'SERVICE', 'PART']
    unit: str = Field(min_length=1, max_length=30)
    product_key: str | None = Field(default=None, max_length=80)
    group_key: str | None = Field(default=None, max_length=80)
    original_quantity: Quantity = Field(gt=0)
    original_unit_price: Price
    reference_unit_price: Price

    @field_validator('code','original_number','description','unit','product_key','group_key',mode='before')
    @classmethod
    def clean_text(cls,value):
        return (' '.join(value.split()) or None) if isinstance(value,str) else value


class ItemPriceCreate(BaseModel):
    item_id: UUID
    provider_id: UUID
    unit_price: Price
    valid_from: datetime | None = None
    fuel_price_id: UUID | None = None


class ItemOrderLine(BaseModel):
    item_id: UUID | None = None
    quantity: Quantity = Field(gt=0)
    unit_price: Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=6)] | None = None
    expected_price_id: UUID | None = None
    description: str | None = Field(default=None, max_length=500)
    category: Literal['FUEL', 'ADDITIVE', 'SERVICE', 'PART'] | None = None
    amount: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)


class OpeningItem(BaseModel):
    item_id: UUID
    remaining_quantity: Quantity
    historical_added_quantity: Quantity


class ItemQuote(BaseModel):
    provider_id: UUID
    lines: list[ItemOrderLine] = Field(min_length=1, max_length=100)


class OpeningReservation(BaseModel):
    reservation_id: UUID
    lines: list[ItemOrderLine] = Field(min_length=1, max_length=100)


class QuantityOpening(BaseModel):
    adjudication: Literal['ITEM', 'GROUP', 'GLOBAL']
    justification: str = Field(min_length=10, max_length=4000)
    document_reference: str = Field(min_length=2, max_length=255)
    history_confirmed: bool
    request_key: UUID
    items: list[OpeningItem] = Field(min_length=1, max_length=500)
    reservations: list[OpeningReservation] = Field(default_factory=list, max_length=1000)

    @field_validator('document_reference','justification',mode='before')
    @classmethod
    def clean_text(cls,value):
        return ' '.join(value.split()) if isinstance(value,str) else value


class AmendmentPrice(BaseModel):
    provider_id: UUID
    unit_price: Price


class AmendmentLine(BaseModel):
    item_id: UUID
    document_number: str | None = Field(default=None, max_length=80)
    new_reference_price: Price | None = None
    prices: list[AmendmentPrice] = Field(default_factory=list, max_length=500)
    added_quantity: Annotated[Decimal, Field(max_digits=18, decimal_places=3)] = Decimal('0')


class ItemAmendmentCreate(BaseModel):
    number: str = Field(min_length=1, max_length=80)
    instrument_type: Literal['ADDITIVE_TERM', 'APOSTILLE'] = 'ADDITIVE_TERM'
    change_types: list[Literal['TERM', 'PRICE', 'QUANTITY']] = Field(min_length=1, max_length=3)
    price_reason: Literal['INDEX', 'REBALANCE', 'REVISION'] | None = None
    signed_at: date
    effective_date: date
    valid_until: date | None = None
    document_reference: str = Field(min_length=2, max_length=255)
    notes: str = Field(min_length=10, max_length=4000)
    price_financial_effect: Literal['NONE', 'DECLARED'] | None = None
    price_financial_delta: Decimal = Field(default=Decimal('0'), max_digits=16, decimal_places=2)
    declared_quantity_amount: Decimal = Field(default=Decimal('0'), max_digits=16, decimal_places=2)
    lines: list[AmendmentLine] = Field(default_factory=list, max_length=500)
    request_key: UUID
    preview_token: str | None = Field(default=None, max_length=64)
    corrects_amendment_id: UUID | None = None
    attachment_token: UUID | None = None

    @field_validator('number','document_reference','notes',mode='before')
    @classmethod
    def clean_text(cls,value):
        return ' '.join(value.split()) if isinstance(value,str) else value

    @model_validator(mode='after')
    def effects_match(self):
        if len(set(self.change_types)) != len(self.change_types):
            raise ValueError('Selecione cada alteração apenas uma vez')
        if 'TERM' in self.change_types and not self.valid_until:
            raise ValueError('Informe o novo fim da vigência')
        if 'PRICE' in self.change_types:
            if not self.price_reason or not self.price_financial_effect:
                raise ValueError('Confira a natureza e o efeito financeiro do reajuste')
            if self.price_financial_effect == 'NONE' and self.price_financial_delta != 0:
                raise ValueError('Sem alteração global exige efeito financeiro zero')
            if self.price_financial_effect == 'DECLARED' and 'price_financial_delta' not in self.model_fields_set:
                raise ValueError('Informe explicitamente o efeito financeiro autorizado no instrumento')
        elif self.price_financial_delta != 0:
            raise ValueError('Efeito de preços exige alteração de preços')
        if 'QUANTITY' not in self.change_types and any(x.added_quantity for x in self.lines):
            raise ValueError('Quantidades adicionais exigem alteração quantitativa')
        if self.instrument_type == 'APOSTILLE' and any(t != 'PRICE' for t in self.change_types):
            raise ValueError('Utilize termo aditivo para prazo ou acréscimo quantitativo')
        return self
