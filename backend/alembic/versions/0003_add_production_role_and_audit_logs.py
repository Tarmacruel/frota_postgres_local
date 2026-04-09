"""add production role and audit logs

Revision ID: 0003_role_audit
Revises: 0002_maint_possession
Create Date: 2026-04-09 00:00:01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_role_audit"
down_revision = "0002_maint_possession"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PRODUCAO'")

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_name", sa.String(length=150), nullable=False),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("actor_role", sa.String(length=30), nullable=True),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_label", sa.String(length=255), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_audit_logs_created_at", "audit_logs", ["created_at"], unique=False)
    op.create_index("idx_audit_logs_actor_user", "audit_logs", ["actor_user_id"], unique=False)
    op.create_index("idx_audit_logs_entity_type", "audit_logs", ["entity_type"], unique=False)
    op.create_index("idx_audit_logs_action", "audit_logs", ["action"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_audit_logs_action", table_name="audit_logs")
    op.drop_index("idx_audit_logs_entity_type", table_name="audit_logs")
    op.drop_index("idx_audit_logs_actor_user", table_name="audit_logs")
    op.drop_index("idx_audit_logs_created_at", table_name="audit_logs")
    op.drop_table("audit_logs")
