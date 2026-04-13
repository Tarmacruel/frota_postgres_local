"""add odometer fields to possession

Revision ID: 0011_possession_odometer
Revises: 0010_fuel_supplies
Create Date: 2026-04-13 12:10:00
"""
from alembic import op
import sqlalchemy as sa


revision = "0011_possession_odometer"
down_revision = "0010_fuel_supplies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicle_possession", sa.Column("start_odometer_km", sa.Float(), nullable=True))
    op.add_column("vehicle_possession", sa.Column("end_odometer_km", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("vehicle_possession", "end_odometer_km")
    op.drop_column("vehicle_possession", "start_odometer_km")
