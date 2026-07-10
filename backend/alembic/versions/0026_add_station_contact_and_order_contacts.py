"""add station contact and order requester contact

Revision ID: 0026_station_order_contacts
Revises: 0025_possession_term_codes
Create Date: 2026-05-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0026_station_order_contacts"
down_revision = "0025_possession_term_codes"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _has_table(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(column["name"] == column_name for column in _inspector().get_columns(table_name))


def upgrade() -> None:
    if _has_table("fuel_stations"):
        if not _has_column("fuel_stations", "phone"):
            op.add_column("fuel_stations", sa.Column("phone", sa.String(length=50), nullable=True))
        if not _has_column("fuel_stations", "latitude"):
            op.add_column("fuel_stations", sa.Column("latitude", sa.Float(), nullable=True))
        if not _has_column("fuel_stations", "longitude"):
            op.add_column("fuel_stations", sa.Column("longitude", sa.Float(), nullable=True))

    if _has_table("fuel_supply_orders") and not _has_column("fuel_supply_orders", "requester_contact"):
        op.add_column("fuel_supply_orders", sa.Column("requester_contact", sa.String(length=50), nullable=True))


def downgrade() -> None:
    if _has_table("fuel_supply_orders") and _has_column("fuel_supply_orders", "requester_contact"):
        op.drop_column("fuel_supply_orders", "requester_contact")

    if _has_table("fuel_stations"):
        for column_name in ("longitude", "latitude", "phone"):
            if _has_column("fuel_stations", column_name):
                op.drop_column("fuel_stations", column_name)
