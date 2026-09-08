from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, event, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class DigitalDocumentStatus:
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    SUPERSEDED = "SUPERSEDED"
    CANCELLED = "CANCELLED"


class DocumentSignatureRequestStatus:
    PENDING = "PENDING"
    SIGNED = "SIGNED"
    DECLINED = "DECLINED"
    CANCELLED = "CANCELLED"
    SUPERSEDED = "SUPERSEDED"


class DigitalDocumentType:
    POSSESSION_RESPONSIBILITY_TERM = "POSSESSION_RESPONSIBILITY_TERM"
    POSSESSION_LOAN_TERM = "POSSESSION_LOAN_TERM"
    POSSESSION_RETURN_TERM = "POSSESSION_RETURN_TERM"
    FUEL_SUPPLY_ORDER = "FUEL_SUPPLY_ORDER"


class DocumentSignatureMethod:
    INTERNAL_PASSWORD = "INTERNAL_PASSWORD"
    ICP_BRASIL_PADES = "ICP_BRASIL_PADES"


class DigitalDocumentArtifactType:
    CANONICAL_PDF = "CANONICAL_PDF"
    CERTIFIED_PDF = "CERTIFIED_PDF"


class CertificateSigningSessionStatus:
    CREATED = "CREATED"
    CERTIFICATE_VALIDATED = "CERTIFICATE_VALIDATED"
    AWAITING_SIGNATURE = "AWAITING_SIGNATURE"
    FINALIZING = "FINALIZING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class SignatureAgentDeviceStatus:
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"


class SignatureAgentPairingStatus:
    CREATED = "CREATED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class DocumentSignatureValidationStatus:
    NOT_VALIDATED = "NOT_VALIDATED"
    VALID = "VALID"
    INVALID = "INVALID"
    INDETERMINATE = "INDETERMINATE"


class DigitalDocument(Base):
    __tablename__ = "digital_documents"
    __table_args__ = (
        Index("idx_digital_documents_source", "source_type", "source_id", "document_type"),
        Index("idx_digital_documents_status", "status"),
        Index("idx_digital_documents_content_hash", "content_hash"),
        Index("idx_digital_documents_organization_id", "organization_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    document_type: Mapped[str] = mapped_column(String(60), nullable=False)
    source_type: Mapped[str] = mapped_column(String(60), nullable=False)
    source_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    organization_id = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("master_organizations.id", ondelete="SET NULL", onupdate="CASCADE"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    public_validation_code = mapped_column(String(32), nullable=True)
    public_validation_path = mapped_column(String(255), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    evidence_hmac: Mapped[str] = mapped_column(String(64), nullable=False)
    snapshot = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=DigitalDocumentStatus.PENDING, server_default=text("'PENDING'"))
    required_signatures: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    created_by_user_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    completed_at = mapped_column(DateTime(timezone=True), nullable=True)
    superseded_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    creator = relationship("User", foreign_keys=[created_by_user_id])
    organization = relationship("Organization")
    signatures: Mapped[list["DocumentSignature"]] = relationship(
        back_populates="document",
        passive_deletes=True,
        order_by="DocumentSignature.signed_at.asc()",
    )
    signature_requests: Mapped[list["DocumentSignatureRequest"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentSignatureRequest.created_at.asc()",
    )
    artifacts: Mapped[list["DigitalDocumentArtifact"]] = relationship(
        back_populates="document",
        passive_deletes=True,
        order_by="DigitalDocumentArtifact.created_at.asc()",
    )
    certificate_signing_sessions: Mapped[list["CertificateSigningSession"]] = relationship(
        back_populates="document",
        passive_deletes=True,
        order_by="CertificateSigningSession.created_at.asc()",
    )
    signature_validations: Mapped[list["DocumentSignatureValidation"]] = relationship(
        back_populates="document",
        passive_deletes=True,
        order_by="DocumentSignatureValidation.created_at.asc()",
    )


class DocumentSignature(Base):
    __tablename__ = "document_signatures"
    __table_args__ = (
        Index("idx_document_signatures_document", "document_id"),
        Index("idx_document_signatures_signer", "signer_user_id"),
        Index("uq_document_signatures_signer_document", "document_id", "signer_user_id", unique=True),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    document_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("digital_documents.id", ondelete="RESTRICT"), nullable=False)
    signer_user_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    signer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    signer_email = mapped_column(String(255), nullable=True)
    signer_role = mapped_column(String(30), nullable=True)
    signer_organization_id = mapped_column(PGUUID(as_uuid=True), nullable=True)
    signer_organization_name = mapped_column(String(180), nullable=True)
    signer_cpf_masked = mapped_column(String(20), nullable=True)
    signer_cpf_hash = mapped_column(String(64), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    signature_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    signature_method: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default=DocumentSignatureMethod.INTERNAL_PASSWORD,
        server_default=text("'INTERNAL_PASSWORD'"),
    )
    signature_format = mapped_column(String(40), nullable=True)
    artifact_id = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("digital_document_artifacts.id", ondelete="RESTRICT"),
        nullable=True,
    )
    certificate_fingerprint = mapped_column(String(128), nullable=True)
    certificate_cpf_hmac = mapped_column(String(64), nullable=True)
    certificate_issuer_summary = mapped_column(String(220), nullable=True)
    certificate_serial_masked = mapped_column(String(80), nullable=True)
    certificate_valid_from = mapped_column(DateTime(timezone=True), nullable=True)
    certificate_valid_until = mapped_column(DateTime(timezone=True), nullable=True)
    signature_policy_oid = mapped_column(String(100), nullable=True)
    timestamped_at = mapped_column(DateTime(timezone=True), nullable=True)
    validation_status = mapped_column(String(30), nullable=True)
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    document: Mapped[DigitalDocument] = relationship(back_populates="signatures")
    signer = relationship("User", foreign_keys=[signer_user_id])
    artifact: Mapped["DigitalDocumentArtifact | None"] = relationship(foreign_keys=[artifact_id])
    validations: Mapped[list["DocumentSignatureValidation"]] = relationship(
        back_populates="signature",
        passive_deletes=True,
    )


class DocumentSignatureRequest(Base):
    __tablename__ = "document_signature_requests"
    __table_args__ = (
        Index("idx_document_signature_requests_document", "document_id"),
        Index("idx_document_signature_requests_signer", "requested_signer_user_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    document_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("digital_documents.id", ondelete="CASCADE"), nullable=False)
    requested_by_user_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requested_signer_user_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=DocumentSignatureRequestStatus.PENDING,
        server_default=text("'PENDING'"),
    )
    message = mapped_column(Text, nullable=True)
    responded_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    document: Mapped[DigitalDocument] = relationship(back_populates="signature_requests")
    requester = relationship("User", foreign_keys=[requested_by_user_id])
    requested_signer = relationship("User", foreign_keys=[requested_signer_user_id])


class DigitalDocumentArtifact(Base):
    __tablename__ = "digital_document_artifacts"
    __table_args__ = (
        UniqueConstraint("document_id", "artifact_type", "version", name="uq_document_artifact_version"),
        UniqueConstraint("storage_path", name="uq_document_artifact_storage_path"),
        Index("idx_document_artifacts_document_type", "document_id", "artifact_type"),
        Index("idx_document_artifacts_sha256", "content_sha256"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    document_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("digital_documents.id", ondelete="RESTRICT"),
        nullable=False,
    )
    artifact_type: Mapped[str] = mapped_column(String(40), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    source_content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    media_type: Mapped[str] = mapped_column(String(100), nullable=False, default="application/pdf", server_default=text("'application/pdf'"))
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    certified_from_artifact_id = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("digital_document_artifacts.id", ondelete="RESTRICT"),
        nullable=True,
    )
    artifact_metadata = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_by_user_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    document: Mapped[DigitalDocument] = relationship(back_populates="artifacts")
    creator = relationship("User", foreign_keys=[created_by_user_id])
    certified_from: Mapped["DigitalDocumentArtifact | None"] = relationship(
        remote_side="DigitalDocumentArtifact.id",
        foreign_keys=[certified_from_artifact_id],
    )


class SignatureAgentDevice(Base):
    __tablename__ = "signature_agent_devices"
    __table_args__ = (
        UniqueConstraint("public_key_fingerprint", name="uq_signature_agent_device_fingerprint"),
        Index("idx_signature_agent_devices_user_status", "user_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    display_name: Mapped[str] = mapped_column(String(150), nullable=False)
    public_key_spki_base64: Mapped[str] = mapped_column(Text, nullable=False)
    public_key_fingerprint: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=SignatureAgentDeviceStatus.ACTIVE,
        server_default=text("'ACTIVE'"),
    )
    paired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    last_seen_at = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    user = relationship("User", foreign_keys=[user_id])
    signing_sessions: Mapped[list["CertificateSigningSession"]] = relationship(back_populates="device")
    pairings: Mapped[list["SignatureAgentPairing"]] = relationship(back_populates="device")
    request_nonces: Mapped[list["SignatureAgentRequestNonce"]] = relationship(back_populates="device")


class SignatureAgentPairing(Base):
    __tablename__ = "signature_agent_pairings"
    __table_args__ = (
        UniqueConstraint("code_hash", name="uq_signature_agent_pairings_code_hash"),
        Index("idx_signature_agent_pairings_user_status", "user_id", "status"),
        Index("idx_signature_agent_pairings_expires_at", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    device_id = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("signature_agent_devices.id", ondelete="RESTRICT"),
        nullable=True,
    )
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=SignatureAgentPairingStatus.CREATED,
        server_default=text("'CREATED'"),
    )
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    user = relationship("User", foreign_keys=[user_id])
    device: Mapped[SignatureAgentDevice | None] = relationship(back_populates="pairings")


class SignatureAgentRequestNonce(Base):
    __tablename__ = "signature_agent_request_nonces"
    __table_args__ = (
        UniqueConstraint("device_id", "nonce_hash", name="uq_signature_agent_request_nonce"),
        Index("idx_signature_agent_request_nonces_expires_at", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    device_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("signature_agent_devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    nonce_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    request_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    device: Mapped[SignatureAgentDevice] = relationship(back_populates="request_nonces")


class CertificateSigningSession(Base):
    __tablename__ = "certificate_signing_sessions"
    __table_args__ = (
        UniqueConstraint("nonce_hash", name="uq_certificate_signing_sessions_nonce_hash"),
        UniqueConstraint("one_time_token_hash", name="uq_certificate_signing_sessions_token_hash"),
        Index("idx_certificate_signing_sessions_document_status", "document_id", "status"),
        Index("idx_certificate_signing_sessions_signer_status", "signer_user_id", "status"),
        Index("idx_certificate_signing_sessions_expires_at", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    document_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("digital_documents.id", ondelete="RESTRICT"),
        nullable=False,
    )
    canonical_artifact_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("digital_document_artifacts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    input_artifact_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("digital_document_artifacts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    device_id = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("signature_agent_devices.id", ondelete="RESTRICT"),
        nullable=True,
    )
    signer_user_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=CertificateSigningSessionStatus.CREATED,
        server_default=text("'CREATED'"),
    )
    expected_content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    nonce_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    one_time_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    state_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    prepared_pdf_path = mapped_column(String(500), nullable=True)
    prepared_state = mapped_column(JSONB, nullable=True)
    prepared_state_sha256 = mapped_column(String(64), nullable=True)
    failure_code = mapped_column(String(80), nullable=True)
    failure_detail = mapped_column(String(500), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    claimed_at = mapped_column(DateTime(timezone=True), nullable=True)
    token_consumed_at = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    document: Mapped[DigitalDocument] = relationship(back_populates="certificate_signing_sessions")
    canonical_artifact: Mapped[DigitalDocumentArtifact] = relationship(foreign_keys=[canonical_artifact_id])
    input_artifact: Mapped[DigitalDocumentArtifact] = relationship(foreign_keys=[input_artifact_id])
    device: Mapped[SignatureAgentDevice | None] = relationship(back_populates="signing_sessions")
    signer = relationship("User", foreign_keys=[signer_user_id])


class DocumentSignatureValidation(Base):
    __tablename__ = "document_signature_validations"
    __table_args__ = (
        Index("idx_document_signature_validations_document", "document_id", "created_at"),
        Index("idx_document_signature_validations_signature", "signature_id"),
        Index("idx_document_signature_validations_artifact", "artifact_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    document_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("digital_documents.id", ondelete="RESTRICT"),
        nullable=False,
    )
    signature_id = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("document_signatures.id", ondelete="RESTRICT"),
        nullable=True,
    )
    artifact_id = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("digital_document_artifacts.id", ondelete="RESTRICT"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    validator: Mapped[str] = mapped_column(String(80), nullable=False)
    policy_oid = mapped_column(String(100), nullable=True)
    certificate_fingerprint = mapped_column(String(128), nullable=True)
    timestamped_at = mapped_column(DateTime(timezone=True), nullable=True)
    validated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    report = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    document: Mapped[DigitalDocument] = relationship(back_populates="signature_validations")
    signature: Mapped[DocumentSignature | None] = relationship(back_populates="validations")
    artifact: Mapped[DigitalDocumentArtifact | None] = relationship(foreign_keys=[artifact_id])


class HomologationSigningTarget(Base):
    __tablename__ = "homologation_signing_targets"
    __table_args__ = (
        UniqueConstraint("document_type", "source_type", "source_id", name="uq_homologation_signing_target_source"),
        Index("idx_homologation_signing_targets_active", "is_active", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    document_type: Mapped[str] = mapped_column(String(60), nullable=False)
    source_type: Mapped[str] = mapped_column(String(60), nullable=False)
    source_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    expires_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    creator = relationship("User", foreign_keys=[created_by_user_id])


@event.listens_for(DigitalDocumentArtifact, "before_update")
def _prevent_artifact_update(*_args) -> None:
    raise ValueError("Artefatos documentais sao imutaveis")


@event.listens_for(DigitalDocumentArtifact, "before_delete")
def _prevent_artifact_delete(*_args) -> None:
    raise ValueError("Artefatos documentais nao podem ser excluidos")
