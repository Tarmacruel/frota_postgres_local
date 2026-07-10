"""add fuel supply details

Revision ID: 0029_fuel_supply_details
Revises: 0028_user_permissions
Create Date: 2026-05-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0029_fuel_supply_details"
down_revision = "0028_user_permissions"
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
    if not _has_table("fuel_supplies"):
        return

    if not _has_column("fuel_supplies", "fuel_type"):
        op.add_column("fuel_supplies", sa.Column("fuel_type", sa.String(length=80), nullable=True))
    if not _has_column("fuel_supplies", "additive_type"):
        op.add_column("fuel_supplies", sa.Column("additive_type", sa.String(length=80), nullable=True))
    if not _has_column("fuel_supplies", "additive_quantity_liters"):
        op.add_column("fuel_supplies", sa.Column("additive_quantity_liters", sa.Float(), nullable=True))


def downgrade() -> None:
    if not _has_table("fuel_supplies"):
        return

    columns = ("additive_quantity_liters", "additive_type", "fuel_type")
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("fuel_supplies") as batch:
            for column in columns:
                if _has_column("fuel_supplies", column):
                    batch.drop_column(column)
        return

    for column in columns:
        if _has_column("fuel_supplies", column):
            op.drop_column("fuel_supplies", column)
