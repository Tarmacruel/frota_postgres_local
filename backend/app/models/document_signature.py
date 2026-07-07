from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, text
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
    POSSESSION_LOAN_TERM = "POSSESSION_LOAN_TERM"
    POSSESSION_RETURN_TERM = "POSSESSION_RETURN_TERM"
    FUEL_SUPPLY_ORDER = "FUEL_SUPPLY_ORDER"


class DigitalDocument(Base):
    __tablename__ = "digital_documents"
    __table_args__ = (
        Index("idx_digital_documents_source", "source_type", "source_id", "document_type"),
        Index("idx_digital_documents_status", "status"),
        Index("idx_digital_documents_content_hash", "content_hash"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    document_type: Mapped[str] = mapped_column(String(60), nullable=False)
    source_type: Mapped[str] = mapped_column(String(60), nullable=False)
    source_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    organization_id = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("master_organizations.id", ondelete="SET NULL", onupdate="CASCADE"),
        nullable=True,
        index=True,
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
        cascade="all, delete-orphan",
        order_by="DocumentSignature.signed_at.asc()",
    )
    signature_requests: Mapped[list["DocumentSignatureRequest"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentSignatureRequest.created_at.asc()",
    )


class DocumentSignature(Base):
    __tablename__ = "document_signatures"
    __table_args__ = (
        Index("idx_document_signatures_document", "document_id"),
        Index("idx_document_signatures_signer", "signer_user_id"),
        Index("uq_document_signatures_signer_document", "document_id", "signer_user_id", unique=True),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    document_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("digital_documents.id", ondelete="CASCADE"), nullable=False)
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
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    document: Mapped[DigitalDocument] = relationship(back_populates="signatures")
    signer = relationship("User", foreign_keys=[signer_user_id])


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
