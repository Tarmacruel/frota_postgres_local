from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.document_signature import DocumentSignatureMethod


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
    signer_cpf_masked: str | None = None
    content_hash: str
    signature_fingerprint: str
    signature_method: str = DocumentSignatureMethod.INTERNAL_PASSWORD
    signature_format: str | None = None
    artifact_id: UUID | None = None
    certificate_fingerprint: str | None = None
    certificate_issuer_summary: str | None = None
    certificate_serial_masked: str | None = None
    certificate_valid_from: datetime | None = None
    certificate_valid_until: datetime | None = None
    signature_policy_oid: str | None = None
    timestamped_at: datetime | None = None
    validation_status: str | None = None
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
    signature_counts_by_method: dict[str, int] = Field(default_factory=dict)
    canonical_artifact_available: bool = False
    certified_artifact_available: bool = False
    certificate_signing_enabled: bool = False
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


class DigitalDocumentArtifactOut(BaseModel):
    id: UUID
    artifact_type: str
    version: int
    source_content_hash: str
    content_sha256: str
    media_type: str
    size_bytes: int
    created_at: datetime
    download_path: str


class DocumentSignatureValidationOut(BaseModel):
    id: UUID
    signature_id: UUID | None = None
    artifact_id: UUID | None = None
    status: str
    validator: str
    policy_oid: str | None = None
    certificate_fingerprint: str | None = None
    timestamped_at: datetime | None = None
    validated_at: datetime


class DocumentValidationSummaryOut(BaseModel):
    document_id: UUID
    document_type: str
    document_status: str
    content_hash: str
    signature_counts_by_method: dict[str, int] = Field(default_factory=dict)
    artifacts: list[DigitalDocumentArtifactOut] = Field(default_factory=list)
    validations: list[DocumentSignatureValidationOut] = Field(default_factory=list)
    certificate_signing_enabled: bool = False


class SignatureAgentDeviceOut(BaseModel):
    id: UUID
    device_id: str
    display_name: str
    public_key_fingerprint: str
    status: str
    paired_at: datetime
    last_seen_at: datetime | None = None
    revoked_at: datetime | None = None


class CertificateSigningSessionOut(BaseModel):
    id: UUID
    document_id: UUID
    canonical_artifact_id: UUID
    input_artifact_id: UUID
    device_id: str | None = None
    signer_user_id: UUID | None = None
    status: str
    expected_content_sha256: str
    failure_code: str | None = None
    expires_at: datetime
    claimed_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CertificateSigningSessionCreateOut(CertificateSigningSessionOut):
    one_time_token: str
    agent_request: dict


class CertificateSigningSessionCreateInput(BaseModel):
    device_id: str | None = Field(
        default=None,
        min_length=64,
        max_length=64,
        pattern=r"^[0-9a-fA-F]{64}$",
    )


class CertificateClaimInput(BaseModel):
    certificate_der: str = Field(min_length=128, max_length=65536)
    certificate_chain: list[str] = Field(default_factory=list, max_length=12)
    supported_algorithms: list[str] = Field(min_length=1, max_length=8)
    device_id: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")


class CertificateClaimOut(BaseModel):
    to_be_signed: str
    signature_algorithm: str
    completion_token: str
    document_title: str
    document_type: str
    content_hash: str
    environment: str
    expires_at: datetime


class CompleteCertificateSignatureInput(BaseModel):
    raw_signature: str = Field(min_length=64, max_length=8192)
    signature_algorithm: str = Field(min_length=3, max_length=20)
    device_id: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")


class CompleteCertificateSignatureOut(BaseModel):
    status: str
    artifact_sha256: str


class SignatureAgentPairingCreateOut(BaseModel):
    id: UUID
    pairing_id: UUID
    status: str
    expires_at: datetime
    pairing_code: str
    backend_base_url: str
    agent_request: dict


class SignatureAgentPairingCompleteInput(BaseModel):
    pairing_code: str = Field(min_length=6, max_length=12, pattern=r"^[0-9]+$")
    device_id: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")
    device_public_key: str = Field(min_length=128, max_length=16384)
    environment: str = Field(min_length=3, max_length=40)


class SignatureAgentPairingOut(BaseModel):
    id: UUID
    status: str
    expires_at: datetime
    completed_at: datetime | None = None
    device_id: str | None = None
