"""add possession term validation codes

Revision ID: 0025_possession_term_codes
Revises: 0024_user_must_change_password
Create Date: 2026-05-08
"""

from __future__ import annotations

from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "0025_possession_term_codes"
down_revision = "0024_user_must_change_password"
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


def _has_index(table_name: str, index_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _generate_validation_code(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12].upper()}"


def _backfill_column(column_name: str, prefix: str) -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(f"SELECT id FROM vehicle_possession WHERE {column_name} IS NULL")
    ).fetchall()

    for row in rows:
        code = _generate_validation_code(prefix)
        while connection.execute(
            sa.text(
                "SELECT 1 FROM vehicle_possession "
                "WHERE loan_term_validation_code = :code OR return_term_validation_code = :code"
            ),
            {"code": code},
        ).scalar():
            code = _generate_validation_code(prefix)

        connection.execute(
            sa.text(f"UPDATE vehicle_possession SET {column_name} = :code WHERE id = :possession_id"),
            {"code": code, "possession_id": row.id},
        )


def upgrade() -> None:
    table_name = "vehicle_possession"
    if not _has_table(table_name):
        return

    if not _has_column(table_name, "loan_term_validation_code"):
        op.add_column(table_name, sa.Column("loan_term_validation_code", sa.String(length=24), nullable=True))
    if not _has_column(table_name, "return_term_validation_code"):
        op.add_column(table_name, sa.Column("return_term_validation_code", sa.String(length=24), nullable=True))

    _backfill_column("loan_term_validation_code", "TE")
    _backfill_column("return_term_validation_code", "TD")

    if not _has_index(table_name, "idx_possession_loan_term_validation_code"):
        op.create_index(
            "idx_possession_loan_term_validation_code",
            table_name,
            ["loan_term_validation_code"],
            unique=True,
        )
    if not _has_index(table_name, "idx_possession_return_term_validation_code"):
        op.create_index(
            "idx_possession_return_term_validation_code",
            table_name,
            ["return_term_validation_code"],
            unique=True,
        )


def downgrade() -> None:
    table_name = "vehicle_possession"
    if not _has_table(table_name):
        return

    if _has_index(table_name, "idx_possession_return_term_validation_code"):
        op.drop_index("idx_possession_return_term_validation_code", table_name=table_name)
    if _has_index(table_name, "idx_possession_loan_term_validation_code"):
        op.drop_index("idx_possession_loan_term_validation_code", table_name=table_name)

    if _has_column(table_name, "return_term_validation_code"):
        op.drop_column(table_name, "return_term_validation_code")
    if _has_column(table_name, "loan_term_validation_code"):
        op.drop_column(table_name, "loan_term_validation_code")
