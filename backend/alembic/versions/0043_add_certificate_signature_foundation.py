"""add certificate signature foundation and immutable document artifacts

Revision ID: 0043_certificate_foundation
Revises: 0042_feature_guides
Create Date: 2026-08-17
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0043_certificate_foundation"
down_revision: str | None = "0042_feature_guides"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _uuid() -> postgresql.UUID:
    return postgresql.UUID(as_uuid=True)


def _drop_document_signature_document_fk() -> None:
    inspector = sa.inspect(op.get_bind())
    for foreign_key in inspector.get_foreign_keys("document_signatures"):
        if (
            foreign_key.get("constrained_columns") == ["document_id"]
            and foreign_key.get("referred_table") == "digital_documents"
            and foreign_key.get("name")
        ):
            op.drop_constraint(
                foreign_key["name"],
                "document_signatures",
                type_="foreignkey",
            )
            return


def upgrade() -> None:
    op.create_table(
        "digital_document_artifacts",
        sa.Column("id", _uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("document_id", _uuid(), nullable=False),
        sa.Column("artifact_type", sa.String(length=40), nullable=False),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("source_content_hash", sa.String(length=64), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("media_type", sa.String(length=100), server_default=sa.text("'application/pdf'"), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("certified_from_artifact_id", _uuid(), nullable=True),
        sa.Column("artifact_metadata", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_by_user_id", _uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint("artifact_type IN ('CANONICAL_PDF', 'CERTIFIED_PDF')", name="ck_document_artifacts_type"),
        sa.CheckConstraint("version > 0", name="ck_document_artifacts_version_positive"),
        sa.CheckConstraint("size_bytes > 0", name="ck_document_artifacts_size_positive"),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["digital_documents.id"],
            name="fk_document_artifacts_document",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["certified_from_artifact_id"],
            ["digital_document_artifacts.id"],
            name="fk_document_artifacts_certified_from",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_document_artifacts_creator",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_digital_document_artifacts"),
        sa.UniqueConstraint("document_id", "artifact_type", "version", name="uq_document_artifact_version"),
        sa.UniqueConstraint("storage_path", name="uq_document_artifact_storage_path"),
    )
    op.create_index(
        "idx_document_artifacts_document_type",
        "digital_document_artifacts",
        ["document_id", "artifact_type"],
        unique=False,
    )
    op.create_index(
        "idx_document_artifacts_sha256",
        "digital_document_artifacts",
        ["content_sha256"],
        unique=False,
    )

    op.create_table(
        "signature_agent_devices",
        sa.Column("id", _uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", _uuid(), nullable=True),
        sa.Column("display_name", sa.String(length=150), nullable=False),
        sa.Column("public_key_spki_base64", sa.Text(), nullable=False),
        sa.Column("public_key_fingerprint", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=30), server_default=sa.text("'ACTIVE'"), nullable=False),
        sa.Column("paired_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint("status IN ('ACTIVE', 'REVOKED')", name="ck_signature_agent_devices_status"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_signature_agent_devices_user",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_signature_agent_devices"),
        sa.UniqueConstraint("public_key_fingerprint", name="uq_signature_agent_device_fingerprint"),
    )
    op.create_index(
        "idx_signature_agent_devices_user_status",
        "signature_agent_devices",
        ["user_id", "status"],
        unique=False,
    )

    op.create_table(
        "signature_agent_pairings",
        sa.Column("id", _uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", _uuid(), nullable=True),
        sa.Column("device_id", _uuid(), nullable=True),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=30), server_default=sa.text("'CREATED'"), nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('CREATED', 'COMPLETED', 'CANCELLED', 'EXPIRED')",
            name="ck_signature_agent_pairings_status",
        ),
        sa.CheckConstraint("attempt_count >= 0", name="ck_signature_agent_pairings_attempt_count"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_signature_agent_pairings_user",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["signature_agent_devices.id"],
            name="fk_signature_agent_pairings_device",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_signature_agent_pairings"),
        sa.UniqueConstraint("code_hash", name="uq_signature_agent_pairings_code_hash"),
    )
    op.create_index(
        "idx_signature_agent_pairings_user_status",
        "signature_agent_pairings",
        ["user_id", "status"],
        unique=False,
    )
    op.create_index(
        "idx_signature_agent_pairings_expires_at",
        "signature_agent_pairings",
        ["expires_at"],
        unique=False,
    )

    op.create_table(
        "signature_agent_request_nonces",
        sa.Column("id", _uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("device_id", _uuid(), nullable=False),
        sa.Column("nonce_hash", sa.String(length=64), nullable=False),
        sa.Column("request_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["signature_agent_devices.id"],
            name="fk_signature_agent_request_nonces_device",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_signature_agent_request_nonces"),
        sa.UniqueConstraint("device_id", "nonce_hash", name="uq_signature_agent_request_nonce"),
    )
    op.create_index(
        "idx_signature_agent_request_nonces_expires_at",
        "signature_agent_request_nonces",
        ["expires_at"],
        unique=False,
    )

    op.create_table(
        "certificate_signing_sessions",
        sa.Column("id", _uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("document_id", _uuid(), nullable=False),
        sa.Column("canonical_artifact_id", _uuid(), nullable=False),
        sa.Column("input_artifact_id", _uuid(), nullable=False),
        sa.Column("device_id", _uuid(), nullable=True),
        sa.Column("signer_user_id", _uuid(), nullable=True),
        sa.Column("status", sa.String(length=30), server_default=sa.text("'CREATED'"), nullable=False),
        sa.Column("expected_content_sha256", sa.String(length=64), nullable=False),
        sa.Column("nonce_hash", sa.String(length=64), nullable=False),
        sa.Column("one_time_token_hash", sa.String(length=64), nullable=False),
        sa.Column("state_version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("prepared_pdf_path", sa.String(length=500), nullable=True),
        sa.Column("prepared_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("prepared_state_sha256", sa.String(length=64), nullable=True),
        sa.Column("failure_code", sa.String(length=80), nullable=True),
        sa.Column("failure_detail", sa.String(length=500), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("token_consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('CREATED', 'CERTIFICATE_VALIDATED', 'AWAITING_SIGNATURE', 'FINALIZING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED')",
            name="ck_certificate_signing_sessions_status",
        ),
        sa.CheckConstraint("state_version > 0", name="ck_certificate_signing_sessions_state_version"),
        sa.CheckConstraint("attempt_count >= 0", name="ck_certificate_signing_sessions_attempt_count"),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["digital_documents.id"],
            name="fk_certificate_signing_sessions_document",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["canonical_artifact_id"],
            ["digital_document_artifacts.id"],
            name="fk_certificate_signing_sessions_artifact",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["input_artifact_id"],
            ["digital_document_artifacts.id"],
            name="fk_certificate_signing_sessions_input_artifact",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["signature_agent_devices.id"],
            name="fk_certificate_signing_sessions_device",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["signer_user_id"],
            ["users.id"],
            name="fk_certificate_signing_sessions_signer",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_certificate_signing_sessions"),
        sa.UniqueConstraint("nonce_hash", name="uq_certificate_signing_sessions_nonce_hash"),
        sa.UniqueConstraint("one_time_token_hash", name="uq_certificate_signing_sessions_token_hash"),
    )
    op.create_index(
        "idx_certificate_signing_sessions_document_status",
        "certificate_signing_sessions",
        ["document_id", "status"],
        unique=False,
    )
    op.create_index(
        "idx_certificate_signing_sessions_signer_status",
        "certificate_signing_sessions",
        ["signer_user_id", "status"],
        unique=False,
    )
    op.create_index(
        "idx_certificate_signing_sessions_expires_at",
        "certificate_signing_sessions",
        ["expires_at"],
        unique=False,
    )

    op.add_column(
        "document_signatures",
        sa.Column("signature_method", sa.String(length=40), server_default=sa.text("'INTERNAL_PASSWORD'"), nullable=True),
    )
    op.add_column("document_signatures", sa.Column("signature_format", sa.String(length=40), nullable=True))
    op.add_column("document_signatures", sa.Column("artifact_id", _uuid(), nullable=True))
    op.add_column("document_signatures", sa.Column("certificate_fingerprint", sa.String(length=128), nullable=True))
    op.add_column("document_signatures", sa.Column("certificate_cpf_hmac", sa.String(length=64), nullable=True))
    op.add_column("document_signatures", sa.Column("certificate_issuer_summary", sa.String(length=220), nullable=True))
    op.add_column("document_signatures", sa.Column("certificate_serial_masked", sa.String(length=80), nullable=True))
    op.add_column("document_signatures", sa.Column("certificate_valid_from", sa.DateTime(timezone=True), nullable=True))
    op.add_column("document_signatures", sa.Column("certificate_valid_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("document_signatures", sa.Column("signature_policy_oid", sa.String(length=100), nullable=True))
    op.add_column("document_signatures", sa.Column("timestamped_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("document_signatures", sa.Column("validation_status", sa.String(length=30), nullable=True))
    op.execute(
        "UPDATE document_signatures SET signature_method = 'INTERNAL_PASSWORD' WHERE signature_method IS NULL"
    )
    op.alter_column("document_signatures", "signature_method", nullable=False)
    op.create_check_constraint(
        "ck_document_signatures_method",
        "document_signatures",
        "signature_method IN ('INTERNAL_PASSWORD', 'ICP_BRASIL_PADES')",
    )
    op.create_foreign_key(
        "fk_document_signatures_artifact",
        "document_signatures",
        "digital_document_artifacts",
        ["artifact_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    _drop_document_signature_document_fk()
    op.create_foreign_key(
        "fk_document_signatures_document",
        "document_signatures",
        "digital_documents",
        ["document_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.create_table(
        "document_signature_validations",
        sa.Column("id", _uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("document_id", _uuid(), nullable=False),
        sa.Column("signature_id", _uuid(), nullable=True),
        sa.Column("artifact_id", _uuid(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("validator", sa.String(length=80), nullable=False),
        sa.Column("policy_oid", sa.String(length=100), nullable=True),
        sa.Column("certificate_fingerprint", sa.String(length=128), nullable=True),
        sa.Column("timestamped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("report", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('NOT_VALIDATED', 'VALID', 'INVALID', 'INDETERMINATE')",
            name="ck_document_signature_validations_status",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["digital_documents.id"],
            name="fk_document_signature_validations_document",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["signature_id"],
            ["document_signatures.id"],
            name="fk_document_signature_validations_signature",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["artifact_id"],
            ["digital_document_artifacts.id"],
            name="fk_document_signature_validations_artifact",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_document_signature_validations"),
    )
    op.create_index(
        "idx_document_signature_validations_document",
        "document_signature_validations",
        ["document_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_document_signature_validations_signature",
        "document_signature_validations",
        ["signature_id"],
        unique=False,
    )
    op.create_index(
        "idx_document_signature_validations_artifact",
        "document_signature_validations",
        ["artifact_id"],
        unique=False,
    )

    op.create_table(
        "homologation_signing_targets",
        sa.Column("id", _uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("document_type", sa.String(length=60), nullable=False),
        sa.Column("source_type", sa.String(length=60), nullable=False),
        sa.Column("source_id", _uuid(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", _uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_homologation_signing_targets_creator",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_homologation_signing_targets"),
        sa.UniqueConstraint(
            "document_type",
            "source_type",
            "source_id",
            name="uq_homologation_signing_target_source",
        ),
    )
    op.create_index(
        "idx_homologation_signing_targets_active",
        "homologation_signing_targets",
        ["is_active", "expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_homologation_signing_targets_active",
        table_name="homologation_signing_targets",
    )
    op.drop_table("homologation_signing_targets")

    for index_name in (
        "idx_document_signature_validations_artifact",
        "idx_document_signature_validations_signature",
        "idx_document_signature_validations_document",
    ):
        op.drop_index(index_name, table_name="document_signature_validations")
    op.drop_table("document_signature_validations")

    _drop_document_signature_document_fk()
    op.create_foreign_key(
        "document_signatures_document_id_fkey",
        "document_signatures",
        "digital_documents",
        ["document_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint("fk_document_signatures_artifact", "document_signatures", type_="foreignkey")
    op.drop_constraint("ck_document_signatures_method", "document_signatures", type_="check")
    for column_name in (
        "validation_status",
        "timestamped_at",
        "signature_policy_oid",
        "certificate_valid_until",
        "certificate_valid_from",
        "certificate_serial_masked",
        "certificate_issuer_summary",
        "certificate_cpf_hmac",
        "certificate_fingerprint",
        "artifact_id",
        "signature_format",
        "signature_method",
    ):
        op.drop_column("document_signatures", column_name)

    for index_name in (
        "idx_certificate_signing_sessions_expires_at",
        "idx_certificate_signing_sessions_signer_status",
        "idx_certificate_signing_sessions_document_status",
    ):
        op.drop_index(index_name, table_name="certificate_signing_sessions")
    op.drop_table("certificate_signing_sessions")

    op.drop_index(
        "idx_signature_agent_request_nonces_expires_at",
        table_name="signature_agent_request_nonces",
    )
    op.drop_table("signature_agent_request_nonces")

    op.drop_index(
        "idx_signature_agent_pairings_expires_at",
        table_name="signature_agent_pairings",
    )
    op.drop_index(
        "idx_signature_agent_pairings_user_status",
        table_name="signature_agent_pairings",
    )
    op.drop_table("signature_agent_pairings")

    op.drop_index(
        "idx_signature_agent_devices_user_status",
        table_name="signature_agent_devices",
    )
    op.drop_table("signature_agent_devices")

    op.drop_index("idx_document_artifacts_sha256", table_name="digital_document_artifacts")
    op.drop_index(
        "idx_document_artifacts_document_type",
        table_name="digital_document_artifacts",
    )
    op.drop_table("digital_document_artifacts")
