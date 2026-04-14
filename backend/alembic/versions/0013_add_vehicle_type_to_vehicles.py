"""add vehicle type enum and required column

Revision ID: 0013_vehicle_type
Revises: 0012_admin_notifications
Create Date: 2026-04-14 10:15:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0013_vehicle_type"
down_revision = "0012_admin_notifications"
branch_labels = None
depends_on = None

vehicle_type = postgresql.ENUM(
    "SEDAN",
    "HATCH",
    "PICAPE",
    "SUV",
    "PERUA_SW",
    "VAN",
    "MICRO_ONIBUS",
    "ONIBUS",
    "CAMINHAO",
    "MOTOCICLETA",
    "MAQUINA",
    name="vehicle_type",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    vehicle_type.create(bind, checkfirst=True)

    op.add_column(
        "vehicles",
        sa.Column("vehicle_type", vehicle_type, nullable=False, server_default="SEDAN"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_column("vehicles", "vehicle_type")
    vehicle_type.drop(bind, checkfirst=True)
