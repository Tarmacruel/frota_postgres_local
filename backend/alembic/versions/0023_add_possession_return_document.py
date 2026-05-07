"""add possession return document

Revision ID: 0023_possession_return_document
Revises: 0022_fuel_order_public_code
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa


revision = "0023_possession_return_document"
down_revision = "0022_fuel_order_public_code"
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
    table_name = "vehicle_possession"
    if not _has_table(table_name):
        return

    columns = [
        ("return_document_path", sa.Column("return_document_path", sa.String(length=255), nullable=True)),
        ("return_document_name", sa.Column("return_document_name", sa.String(length=255), nullable=True)),
        ("return_document_mime_type", sa.Column("return_document_mime_type", sa.String(length=120), nullable=True)),
        ("return_document_size_bytes", sa.Column("return_document_size_bytes", sa.Integer(), nullable=True)),
        ("return_document_uploaded_at", sa.Column("return_document_uploaded_at", sa.DateTime(timezone=True), nullable=True)),
    ]
    for column_name, column in columns:
        if not _has_column(table_name, column_name):
            op.add_column(table_name, column)


def downgrade() -> None:
    table_name = "vehicle_possession"
    if not _has_table(table_name):
        return

    for column_name in [
        "return_document_uploaded_at",
        "return_document_size_bytes",
        "return_document_mime_type",
        "return_document_name",
        "return_document_path",
    ]:
        if _has_column(table_name, column_name):
            op.drop_column(table_name, column_name)
