"""add organization index to fuel supply orders

Revision ID: 0016_fso_org_index
Revises: 0015_fuel_supply_orders
Create Date: 2026-04-20 18:30:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0016_fso_org_index"
down_revision = "0015_fuel_supply_orders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {idx["name"] for idx in inspector.get_indexes("fuel_supply_orders")}
    if "idx_fuel_supply_orders_organization_id" not in indexes:
        op.create_index("idx_fuel_supply_orders_organization_id", "fuel_supply_orders", ["organization_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {idx["name"] for idx in inspector.get_indexes("fuel_supply_orders")}
    if "idx_fuel_supply_orders_organization_id" in indexes:
        op.drop_index("idx_fuel_supply_orders_organization_id", table_name="fuel_supply_orders")
