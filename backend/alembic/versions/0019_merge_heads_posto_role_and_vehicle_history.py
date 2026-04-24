"""merge posto role and vehicle history heads

Revision ID: 0019_merge_posto_vehicle_history
Revises: 0015_add_posto_role, 0018_vehicle_history_reason
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa


revision = "0019_merge_posto_vehicle_history"
down_revision = ("0015_add_posto_role", "0018_vehicle_history_reason")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
