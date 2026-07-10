"""require user cpf for digital signatures

Revision ID: 0038_require_user_cpf
Revises: 0037_link_fuel_orders_supplies
Create Date: 2026-07-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0038_require_user_cpf"
down_revision = "0037_link_fuel_orders_supplies"
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


def upgrade() -> None:
    if _has_table("users"):
        if not _has_column("users", "cpf"):
            op.add_column("users", sa.Column("cpf", sa.String(length=11), nullable=True))
        if not _has_index("users", "uq_users_cpf", ["cpf"]):
            op.create_index("uq_users_cpf", "users", ["cpf"], unique=True)

    if _has_table("document_signatures"):
        if not _has_column("document_signatures", "signer_cpf_masked"):
            op.add_column("document_signatures", sa.Column("signer_cpf_masked", sa.String(length=20), nullable=True))
        if not _has_column("document_signatures", "signer_cpf_hash"):
            op.add_column("document_signatures", sa.Column("signer_cpf_hash", sa.String(length=64), nullable=True))


def downgrade() -> None:
    if _has_table("document_signatures"):
        if _has_column("document_signatures", "signer_cpf_hash"):
            op.drop_column("document_signatures", "signer_cpf_hash")
        if _has_column("document_signatures", "signer_cpf_masked"):
            op.drop_column("document_signatures", "signer_cpf_masked")

    if _has_table("users"):
        if _has_index("users", "uq_users_cpf", ["cpf"]):
            op.drop_index("uq_users_cpf", table_name="users")
        if _has_column("users", "cpf"):
            op.drop_column("users", "cpf")
