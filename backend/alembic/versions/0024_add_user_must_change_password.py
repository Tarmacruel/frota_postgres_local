"""add user must change password flag

Revision ID: 0024_user_must_change_password
Revises: 0023_possession_return_document
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa


revision = "0024_user_must_change_password"
down_revision = "0023_possession_return_document"
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
    table_name = "users"
    if not _has_table(table_name) or _has_column(table_name, "must_change_password"):
        return

    op.add_column(
        table_name,
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    table_name = "users"
    if _has_column(table_name, "must_change_password"):
        op.drop_column(table_name, "must_change_password")
