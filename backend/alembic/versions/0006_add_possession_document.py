"""add possession signed document fields

Revision ID: 0006_possession_docs
Revises: 0005_master_vehicle_meta
Create Date: 2026-04-10 15:30:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_possession_docs"
down_revision = "0005_master_vehicle_meta"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicle_possession", sa.Column("document_path", sa.String(length=255), nullable=True))
    op.add_column("vehicle_possession", sa.Column("document_name", sa.String(length=255), nullable=True))
    op.add_column("vehicle_possession", sa.Column("document_mime_type", sa.String(length=120), nullable=True))
    op.add_column("vehicle_possession", sa.Column("document_size_bytes", sa.Integer(), nullable=True))
    op.add_column("vehicle_possession", sa.Column("document_uploaded_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("vehicle_possession", "document_uploaded_at")
    op.drop_column("vehicle_possession", "document_size_bytes")
    op.drop_column("vehicle_possession", "document_mime_type")
    op.drop_column("vehicle_possession", "document_name")
    op.drop_column("vehicle_possession", "document_path")
