"""add admin notifications center

Revision ID: 0012_admin_notifications
Revises: 0011_possession_odometer
Create Date: 2026-04-13 13:20:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0012_admin_notifications"
down_revision = "0011_possession_odometer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default=sa.text("'INFO'")),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("idx_admin_notifications_created_at", "admin_notifications", ["created_at"], unique=False)
    op.create_index("idx_admin_notifications_read_at", "admin_notifications", ["read_at"], unique=False)
    op.create_index("idx_admin_notifications_event_type", "admin_notifications", ["event_type"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_admin_notifications_event_type", table_name="admin_notifications")
    op.drop_index("idx_admin_notifications_read_at", table_name="admin_notifications")
    op.drop_index("idx_admin_notifications_created_at", table_name="admin_notifications")
    op.drop_table("admin_notifications")
