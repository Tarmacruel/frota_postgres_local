"""add possession photo gallery

Revision ID: 0007_possession_photo_gallery
Revises: 0006_possession_docs
Create Date: 2026-04-10 20:15:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_possession_photo_gallery"
down_revision = "0006_possession_docs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vehicle_possession_photos",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("possession_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("photo_path", sa.String(length=255), nullable=False),
        sa.Column("photo_mime_type", sa.String(length=100), nullable=False),
        sa.Column("photo_size_bytes", sa.Integer(), nullable=False),
        sa.Column("photo_captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("capture_latitude", sa.Float(), nullable=True),
        sa.Column("capture_longitude", sa.Float(), nullable=True),
        sa.Column("capture_accuracy_meters", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.ForeignKeyConstraint(["possession_id"], ["vehicle_possession.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_possession_photo_possession", "vehicle_possession_photos", ["possession_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_possession_photo_possession", table_name="vehicle_possession_photos")
    op.drop_table("vehicle_possession_photos")
