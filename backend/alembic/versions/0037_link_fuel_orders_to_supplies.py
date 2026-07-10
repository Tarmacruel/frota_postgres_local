"""link fuel supply orders to confirmed supplies

Revision ID: 0037_link_fuel_orders_supplies
Revises: 0036_document_signatures
Create Date: 2026-06-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0037_link_fuel_orders_supplies"
down_revision = "0036_document_signatures"
branch_labels = None
depends_on = None


def _bind():
    return op.get_bind()


def _inspector():
    return sa.inspect(_bind())


def _offline() -> bool:
    return bool(op.get_context().as_sql)


def _has_table(table_name: str) -> bool:
    if _offline():
        return True
    return table_name in _inspector().get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    if _offline():
        return False
    if not _has_table(table_name):
        return False
    return any(column["name"] == column_name for column in _inspector().get_columns(table_name))


def _has_index(table_name: str, index_name: str, columns: list[str] | None = None) -> bool:
    if _offline():
        return False
    if not _has_table(table_name):
        return False
    for index in _inspector().get_indexes(table_name):
        if index["name"] == index_name:
            return True
        if columns and index.get("column_names") == columns:
            return True
    return False


def _has_foreign_key(table_name: str, *, constrained_columns: list[str], referred_table: str) -> bool:
    if _offline():
        return False
    if not _has_table(table_name):
        return False
    for foreign_key in _inspector().get_foreign_keys(table_name):
        if foreign_key.get("constrained_columns") == constrained_columns and foreign_key.get("referred_table") == referred_table:
            return True
    return False


def _uuid_type():
    if _bind().dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=36)


def _add_link_column() -> None:
    column = sa.Column("fuel_supply_order_id", _uuid_type(), nullable=True)
    if _bind().dialect.name == "sqlite":
        with op.batch_alter_table("fuel_supplies") as batch:
            if not _has_column("fuel_supplies", "fuel_supply_order_id"):
                batch.add_column(column)
            if not _has_foreign_key("fuel_supplies", constrained_columns=["fuel_supply_order_id"], referred_table="fuel_supply_orders"):
                batch.create_foreign_key(
                    "fk_fuel_supplies_fuel_supply_order_id",
                    "fuel_supply_orders",
                    ["fuel_supply_order_id"],
                    ["id"],
                    ondelete="SET NULL",
                )
        return

    if not _has_column("fuel_supplies", "fuel_supply_order_id"):
        op.add_column("fuel_supplies", column)
    if not _has_foreign_key("fuel_supplies", constrained_columns=["fuel_supply_order_id"], referred_table="fuel_supply_orders"):
        op.create_foreign_key(
            "fk_fuel_supplies_fuel_supply_order_id",
            "fuel_supplies",
            "fuel_supply_orders",
            ["fuel_supply_order_id"],
            ["id"],
            ondelete="SET NULL",
        )


def _create_unique_index() -> None:
    if _has_index("fuel_supplies", "uq_fuel_supplies_order_id", ["fuel_supply_order_id"]):
        return
    op.create_index("uq_fuel_supplies_order_id", "fuel_supplies", ["fuel_supply_order_id"], unique=True)


def _backfill_from_audit_logs() -> None:
    if not _has_table("audit_logs"):
        return

    if _bind().dialect.name == "postgresql":
        op.execute(
            sa.text(
                """
                UPDATE fuel_supplies AS supply
                   SET fuel_supply_order_id = audit.entity_id
                  FROM audit_logs AS audit
                 WHERE audit.entity_type = 'FUEL_SUPPLY_ORDER'
                   AND audit.action = 'ORDER_CONFIRMED'
                   AND audit.details ? 'supply_id'
                   AND audit.details ->> 'supply_id' = supply.id::text
                   AND supply.fuel_supply_order_id IS NULL
                   AND NOT EXISTS (
                       SELECT 1
                         FROM fuel_supplies AS existing
                        WHERE existing.fuel_supply_order_id = audit.entity_id
                          AND existing.id <> supply.id
                   )
                """
            )
        )
        return

    op.execute(
        sa.text(
            """
            UPDATE fuel_supplies
               SET fuel_supply_order_id = (
                   SELECT audit_logs.entity_id
                     FROM audit_logs
                    WHERE audit_logs.entity_type = 'FUEL_SUPPLY_ORDER'
                      AND audit_logs.action = 'ORDER_CONFIRMED'
                      AND json_extract(audit_logs.details, '$.supply_id') = fuel_supplies.id
                    LIMIT 1
               )
             WHERE fuel_supply_order_id IS NULL
               AND EXISTS (
                   SELECT 1
                     FROM audit_logs
                    WHERE audit_logs.entity_type = 'FUEL_SUPPLY_ORDER'
                      AND audit_logs.action = 'ORDER_CONFIRMED'
                      AND json_extract(audit_logs.details, '$.supply_id') = fuel_supplies.id
               )
            """
        )
    )


def upgrade() -> None:
    if not _has_table("fuel_supplies") or not _has_table("fuel_supply_orders"):
        return

    _add_link_column()
    _backfill_from_audit_logs()
    _create_unique_index()


def downgrade() -> None:
    if not _has_table("fuel_supplies") or not _has_column("fuel_supplies", "fuel_supply_order_id"):
        return

    if _has_index("fuel_supplies", "uq_fuel_supplies_order_id", ["fuel_supply_order_id"]):
        op.drop_index("uq_fuel_supplies_order_id", table_name="fuel_supplies")

    if _bind().dialect.name == "sqlite":
        with op.batch_alter_table("fuel_supplies") as batch:
            batch.drop_column("fuel_supply_order_id")
        return

    if _has_foreign_key("fuel_supplies", constrained_columns=["fuel_supply_order_id"], referred_table="fuel_supply_orders"):
        matching = next(
            (
                foreign_key
                for foreign_key in _inspector().get_foreign_keys("fuel_supplies")
                if foreign_key.get("constrained_columns") == ["fuel_supply_order_id"]
                and foreign_key.get("referred_table") == "fuel_supply_orders"
            ),
            None,
        )
        if matching and matching.get("name"):
            op.drop_constraint(matching["name"], "fuel_supplies", type_="foreignkey")

    op.drop_column("fuel_supplies", "fuel_supply_order_id")
