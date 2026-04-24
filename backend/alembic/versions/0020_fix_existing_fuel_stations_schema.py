"""fix existing fuel stations schema

Revision ID: 0020_fix_fuel_stations_schema
Revises: 0019_merge_posto_vehicle_history
Create Date: 2026-04-24
"""

from alembic import op
import sqlalchemy as sa


revision = "0020_fix_fuel_stations_schema"
down_revision = "0019_merge_posto_vehicle_history"
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
    if not _has_table("fuel_stations"):
        return

    if not _has_column("fuel_stations", "cnpj"):
        op.add_column("fuel_stations", sa.Column("cnpj", sa.String(length=18), nullable=True))

    if not _has_column("fuel_stations", "address"):
        op.add_column("fuel_stations", sa.Column("address", sa.String(length=255), nullable=True))
        op.execute("UPDATE fuel_stations SET address = COALESCE(address, 'Endereco nao informado') WHERE address IS NULL")
        op.alter_column("fuel_stations", "address", existing_type=sa.String(length=255), nullable=False)


def downgrade() -> None:
    if not _has_table("fuel_stations"):
        return

    if _has_column("fuel_stations", "address"):
        op.drop_column("fuel_stations", "address")
    if _has_column("fuel_stations", "cnpj"):
        op.drop_column("fuel_stations", "cnpj")
