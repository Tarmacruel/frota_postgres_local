"""add posto role to user enum

Revision ID: 0015_add_posto_role
Revises: 0014_fleet_analytics
Create Date: 2026-04-16 00:00:00
"""

from alembic import op


revision = "0015_add_posto_role"
down_revision = "0014_fleet_analytics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'POSTO'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely in-place.
    pass
