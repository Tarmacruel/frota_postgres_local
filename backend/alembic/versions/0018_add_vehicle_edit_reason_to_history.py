"""add vehicle edit reason to location history

Revision ID: 0018_vehicle_history_reason
Revises: 0017_fuel_stations
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa


revision = "0018_vehicle_history_reason"
down_revision = "0017_fuel_stations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("location_history")}
    if "justification" not in columns:
        op.add_column("location_history", sa.Column("justification", sa.String(length=500), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("location_history")}
    if "justification" in columns:
        op.drop_column("location_history", "justification")
