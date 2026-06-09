from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class DigitalDocumentCreate(BaseModel):
    document_type: str = Field(max_length=60)
    source_id: UUID

    @field_validator("document_type")
    @classmethod
    def normalize_document_type(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Tipo do documento é obrigatório")
        return normalized


class DocumentSignInput(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)


class JointSignatureRequestInput(BaseModel):
    requested_signer_user_id: UUID
    message: str | None = Field(default=None, max_length=500)

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class DocumentSignatureOut(BaseModel):
    id: UUID
    signer_user_id: UUID | None
    signer_name: str
    signer_email: str | None = None
    signer_role: str | None = None
    signer_organization_name: str | None = None
    content_hash: str
    signature_fingerprint: str
    signed_at: datetime


class DocumentSignatureRequestOut(BaseModel):
    id: UUID
    requested_by_user_id: UUID | None
    requested_by_name: str | None = None
    requested_signer_user_id: UUID | None
    requested_signer_name: str | None = None
    requested_signer_email: str | None = None
    status: str
    message: str | None = None
    responded_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class DocumentSignatureSummaryOut(BaseModel):
    document_id: UUID | None = None
    document_type: str
    source_id: UUID | None = None
    status: str = "UNSIGNED"
    title: str | None = None
    content_hash: str | None = None
    content_hash_short: str | None = None
    public_validation_code: str | None = None
    public_validation_path: str | None = None
    required_signatures: int = 1
    signed_count: int = 0
    pending_count: int = 0
    declined_count: int = 0
    is_complete: bool = False
    signatures: list[DocumentSignatureOut] = Field(default_factory=list)
    requests: list[DocumentSignatureRequestOut] = Field(default_factory=list)


class DigitalDocumentOut(DocumentSignatureSummaryOut):
    evidence_hmac: str | None = None
    snapshot: dict | None = None
    created_by_user_id: UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    completed_at: datetime | None = None
    superseded_at: datetime | None = None
