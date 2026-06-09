"""add internal document signatures

Revision ID: 0036_document_signatures
Revises: 0035_fine_infractions_import
Create Date: 2026-06-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0036_document_signatures"
down_revision = "0035_fine_infractions_import"
branch_labels = None
depends_on = None


def _bind():
    return op.get_bind()


def _inspector():
    return sa.inspect(_bind())


def _has_table(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _has_index(table_name: str, index_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _uuid_type():
    if _bind().dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=36)


def _uuid_default():
    if _bind().dialect.name == "postgresql":
        return sa.text("gen_random_uuid()")
    return None


def _now_default():
    return sa.text("NOW()") if _bind().dialect.name == "postgresql" else sa.text("CURRENT_TIMESTAMP")


def _json_type():
    if _bind().dialect.name == "postgresql":
        return postgresql.JSONB()
    return sa.JSON()


def _create_index(index_name: str, table_name: str, columns: list[str], *, unique: bool = False) -> None:
    if _has_table(table_name) and not _has_index(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    uuid_type = _uuid_type()

    if not _has_table("digital_documents"):
        op.create_table(
            "digital_documents",
            sa.Column("id", uuid_type, primary_key=True, server_default=_uuid_default()),
            sa.Column("document_type", sa.String(length=60), nullable=False),
            sa.Column("source_type", sa.String(length=60), nullable=False),
            sa.Column("source_id", uuid_type, nullable=False),
            sa.Column("organization_id", uuid_type, sa.ForeignKey("master_organizations.id", ondelete="SET NULL", onupdate="CASCADE"), nullable=True),
            sa.Column("title", sa.String(length=220), nullable=False),
            sa.Column("public_validation_code", sa.String(length=32), nullable=True),
            sa.Column("public_validation_path", sa.String(length=255), nullable=True),
            sa.Column("content_hash", sa.String(length=64), nullable=False),
            sa.Column("evidence_hmac", sa.String(length=64), nullable=False),
            sa.Column("snapshot", _json_type(), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False, server_default=sa.text("'PENDING'")),
            sa.Column("required_signatures", sa.Integer(), nullable=False, server_default=sa.text("1")),
            sa.Column("created_by_user_id", uuid_type, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
        )

    if not _has_table("document_signatures"):
        op.create_table(
            "document_signatures",
            sa.Column("id", uuid_type, primary_key=True, server_default=_uuid_default()),
            sa.Column("document_id", uuid_type, sa.ForeignKey("digital_documents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("signer_user_id", uuid_type, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("signer_name", sa.String(length=150), nullable=False),
            sa.Column("signer_email", sa.String(length=255), nullable=True),
            sa.Column("signer_role", sa.String(length=30), nullable=True),
            sa.Column("signer_organization_id", uuid_type, nullable=True),
            sa.Column("signer_organization_name", sa.String(length=180), nullable=True),
            sa.Column("content_hash", sa.String(length=64), nullable=False),
            sa.Column("signature_fingerprint", sa.String(length=64), nullable=False),
            sa.Column("signed_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
        )

    if not _has_table("document_signature_requests"):
        op.create_table(
            "document_signature_requests",
            sa.Column("id", uuid_type, primary_key=True, server_default=_uuid_default()),
            sa.Column("document_id", uuid_type, sa.ForeignKey("digital_documents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("requested_by_user_id", uuid_type, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("requested_signer_user_id", uuid_type, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("status", sa.String(length=30), nullable=False, server_default=sa.text("'PENDING'")),
            sa.Column("message", sa.Text(), nullable=True),
            sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
        )

    _create_index("idx_digital_documents_source", "digital_documents", ["source_type", "source_id", "document_type"])
    _create_index("idx_digital_documents_status", "digital_documents", ["status"])
    _create_index("idx_digital_documents_content_hash", "digital_documents", ["content_hash"])
    _create_index("idx_digital_documents_organization_id", "digital_documents", ["organization_id"])
    _create_index("idx_document_signatures_document", "document_signatures", ["document_id"])
    _create_index("idx_document_signatures_signer", "document_signatures", ["signer_user_id"])
    _create_index("uq_document_signatures_signer_document", "document_signatures", ["document_id", "signer_user_id"], unique=True)
    _create_index("idx_document_signature_requests_document", "document_signature_requests", ["document_id"])
    _create_index("idx_document_signature_requests_signer", "document_signature_requests", ["requested_signer_user_id", "status"])


def downgrade() -> None:
    for index_name, table_name in (
        ("idx_document_signature_requests_signer", "document_signature_requests"),
        ("idx_document_signature_requests_document", "document_signature_requests"),
        ("uq_document_signatures_signer_document", "document_signatures"),
        ("idx_document_signatures_signer", "document_signatures"),
        ("idx_document_signatures_document", "document_signatures"),
        ("idx_digital_documents_organization_id", "digital_documents"),
        ("idx_digital_documents_content_hash", "digital_documents"),
        ("idx_digital_documents_status", "digital_documents"),
        ("idx_digital_documents_source", "digital_documents"),
    ):
        if _has_index(table_name, index_name):
            op.drop_index(index_name, table_name=table_name)

    for table_name in ("document_signature_requests", "document_signatures", "digital_documents"):
        if _has_table(table_name):
            op.drop_table(table_name)
