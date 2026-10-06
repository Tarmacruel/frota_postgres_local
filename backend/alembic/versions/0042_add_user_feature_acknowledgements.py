"""add versioned user feature guide acknowledgements

Revision ID: 0042_feature_guides
Revises: 0041_claim_attachments
Create Date: 2026-08-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0042_feature_guides"
down_revision: str | None = "0041_claim_attachments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_feature_acknowledgements",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("feature_key", sa.String(length=120), nullable=False),
        sa.Column(
            "acknowledged_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_user_feature_acknowledgements_user",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_user_feature_acknowledgements"),
        sa.UniqueConstraint(
            "user_id",
            "feature_key",
            name="uq_user_feature_acknowledgements_user_feature",
        ),
    )
    op.create_index(
        "ix_user_feature_acknowledgements_user_id",
        "user_feature_acknowledgements",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_user_feature_acknowledgements_user_id",
        table_name="user_feature_acknowledgements",
    )
    op.drop_table("user_feature_acknowledgements")
