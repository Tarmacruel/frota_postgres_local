from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.models.claim import ClaimStatus, ClaimType
from app.schemas.common import PaginatedResponse


class ClaimCreate(BaseModel):
    vehicle_id: UUID
    driver_id: UUID | None = None
    data_ocorrencia: datetime
    tipo: ClaimType
    descricao: str = Field(min_length=20, max_length=4000)
    local: str = Field(min_length=5, max_length=200)
    boletim_ocorrencia: str | None = Field(default=None, max_length=50)
    valor_estimado: Decimal | None = Field(default=None, ge=0)
    status: ClaimStatus = ClaimStatus.ABERTO
    anexos: list[str] | None = None
    justificativa_encerramento: str | None = Field(default=None, max_length=1000)

    @field_validator("descricao", "local", "boletim_ocorrencia", "justificativa_encerramento")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_closed_claim(self) -> "ClaimCreate":
        if self.status == ClaimStatus.ENCERRADO and not (self.valor_estimado is not None or self.justificativa_encerramento):
            raise ValueError("Sinistro encerrado exige valor estimado ou justificativa")
        return self


class ClaimUpdate(BaseModel):
    driver_id: UUID | None = None
    data_ocorrencia: datetime | None = None
    tipo: ClaimType | None = None
    descricao: str | None = Field(default=None, min_length=20, max_length=4000)
    local: str | None = Field(default=None, min_length=5, max_length=200)
    boletim_ocorrencia: str | None = Field(default=None, max_length=50)
    valor_estimado: Decimal | None = Field(default=None, ge=0)
    status: ClaimStatus | None = None
    anexos: list[str] | None = None
    justificativa_encerramento: str | None = Field(default=None, max_length=1000)

    @field_validator("descricao", "local", "boletim_ocorrencia", "justificativa_encerramento")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class ClaimOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vehicle_id: UUID
    vehicle_plate: str
    driver_id: UUID | None
    driver_name: str | None
    data_ocorrencia: datetime
    tipo: ClaimType
    descricao: str
    local: str
    boletim_ocorrencia: str | None
    valor_estimado: Decimal | None
    status: ClaimStatus
    justificativa_encerramento: str | None
    anexos: list[str] | None
    created_by: UUID
    created_at: datetime
    updated_at: datetime


class ClaimListResponse(PaginatedResponse[ClaimOut]):
    pass
