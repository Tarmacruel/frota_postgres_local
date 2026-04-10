"""add possession evidence fields

Revision ID: 0004_possession_evidence
Revises: 0003_role_audit
Create Date: 2026-04-10 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_possession_evidence"
down_revision = "0003_role_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicle_possession", sa.Column("photo_path", sa.String(length=255), nullable=True))
    op.add_column("vehicle_possession", sa.Column("photo_mime_type", sa.String(length=100), nullable=True))
    op.add_column("vehicle_possession", sa.Column("photo_size_bytes", sa.Integer(), nullable=True))
    op.add_column("vehicle_possession", sa.Column("photo_captured_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("vehicle_possession", sa.Column("capture_latitude", sa.Float(), nullable=True))
    op.add_column("vehicle_possession", sa.Column("capture_longitude", sa.Float(), nullable=True))
    op.add_column("vehicle_possession", sa.Column("capture_accuracy_meters", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("vehicle_possession", "capture_accuracy_meters")
    op.drop_column("vehicle_possession", "capture_longitude")
    op.drop_column("vehicle_possession", "capture_latitude")
    op.drop_column("vehicle_possession", "photo_captured_at")
    op.drop_column("vehicle_possession", "photo_size_bytes")
    op.drop_column("vehicle_possession", "photo_mime_type")
    op.drop_column("vehicle_possession", "photo_path")
