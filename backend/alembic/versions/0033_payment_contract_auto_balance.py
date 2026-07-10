"""payment contract automatic balance

Revision ID: 0033_payment_contract_auto_balance
Revises: 0032_payment_workflow
Create Date: 2026-06-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0033_payment_contract_auto_balance"
down_revision = "0032_payment_workflow"
branch_labels = None
depends_on = None


ACTIVE_CONSUMPTION_STAGES = (
    "ASSEMBLY",
    "REVIEW",
    "COMMITMENT",
    "LIQUIDATION",
    "PAYMENT",
    "PAID",
    "ARCHIVED",
)


def _bind():
    return op.get_bind()


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(column["name"] == column_name for column in sa.inspect(_bind()).get_columns(table_name))


def _ensure_alembic_version_length() -> None:
    bind = _bind()
    if bind.dialect.name == "postgresql" and _has_table("alembic_version"):
        bind.execute(sa.text("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)"))


def upgrade() -> None:
    _ensure_alembic_version_length()

    if not _has_table("payment_contracts") or not _has_table("payment_processes"):
        return
    required_contract_columns = {"id", "value_initial", "value_updated", "imported_balance", "updated_at"}
    required_process_columns = {"contract_id", "amount", "stage"}
    if not all(_has_column("payment_contracts", column) for column in required_contract_columns):
        return
    if not all(_has_column("payment_processes", column) for column in required_process_columns):
        return

    bind = _bind()
    stages = ", ".join(f"'{stage}'" for stage in ACTIVE_CONSUMPTION_STAGES)
    if bind.dialect.name == "postgresql":
        bind.execute(
            sa.text(
                f"""
                UPDATE payment_contracts AS contract
                SET
                    value_updated = contract.imported_balance + COALESCE((
                        SELECT SUM(process.amount)
                        FROM payment_processes AS process
                        WHERE process.contract_id = contract.id
                          AND process.stage IN ({stages})
                    ), 0),
                    updated_at = NOW()
                WHERE contract.value_initial IS NULL
                  AND contract.value_updated IS NULL
                  AND contract.imported_balance IS NOT NULL
                """
            )
        )
        return

    bind.execute(
        sa.text(
            f"""
            UPDATE payment_contracts
            SET value_updated = imported_balance + COALESCE((
                    SELECT SUM(payment_processes.amount)
                    FROM payment_processes
                    WHERE payment_processes.contract_id = payment_contracts.id
                      AND payment_processes.stage IN ({stages})
                ), 0),
                updated_at = CURRENT_TIMESTAMP
            WHERE value_initial IS NULL
              AND value_updated IS NULL
              AND imported_balance IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    # Backfill is intentionally irreversible: value_updated may have been edited after upgrade.
    pass
