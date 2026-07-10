"""add public validation code to fuel orders

Revision ID: 0022_fuel_order_public_code
Revises: 0021_fix_claim_type_avaria
Create Date: 2026-04-24 11:30:00.000000
"""

from __future__ import annotations

from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "0022_fuel_order_public_code"
down_revision = "0021_fix_claim_type_avaria"
branch_labels = None
depends_on = None


def _generate_validation_code() -> str:
    return f"OA-{uuid4().hex[:12].upper()}"


def upgrade() -> None:
    op.add_column(
        "fuel_supply_orders",
        sa.Column("validation_code", sa.String(length=24), nullable=True),
    )

    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id FROM fuel_supply_orders")).fetchall()

    for row in rows:
        code = _generate_validation_code()
        while connection.execute(
            sa.text("SELECT 1 FROM fuel_supply_orders WHERE validation_code = :code"),
            {"code": code},
        ).scalar():
            code = _generate_validation_code()

        connection.execute(
            sa.text("UPDATE fuel_supply_orders SET validation_code = :code WHERE id = :order_id"),
            {"code": code, "order_id": row.id},
        )

    op.alter_column("fuel_supply_orders", "validation_code", nullable=False)
    op.create_index(
        "idx_fuel_supply_orders_validation_code",
        "fuel_supply_orders",
        ["validation_code"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("idx_fuel_supply_orders_validation_code", table_name="fuel_supply_orders")
    op.drop_column("fuel_supply_orders", "validation_code")
