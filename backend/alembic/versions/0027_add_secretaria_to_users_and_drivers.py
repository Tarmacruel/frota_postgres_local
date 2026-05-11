"""add secretaria to users and drivers

Revision ID: 0027_user_driver_secretaria
Revises: 0026_station_order_contacts
Create Date: 2026-05-11
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0027_user_driver_secretaria"
down_revision = "0026_station_order_contacts"
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


def _has_fk(table_name: str, constraint_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(fk["name"] == constraint_name for fk in _inspector().get_foreign_keys(table_name))


def _uuid_type():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=36)


def _add_secretaria_column(table_name: str, index_name: str, fk_name: str) -> None:
    if not _has_table(table_name):
        return

    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table(table_name) as batch:
            if not _has_column(table_name, "organization_id"):
                batch.add_column(sa.Column("organization_id", _uuid_type(), nullable=True))
            if _has_table("master_organizations") and not _has_fk(table_name, fk_name):
                batch.create_foreign_key(
                    fk_name,
                    "master_organizations",
                    ["organization_id"],
                    ["id"],
                    ondelete="RESTRICT",
                    onupdate="CASCADE",
                )
    else:
        if not _has_column(table_name, "organization_id"):
            op.add_column(table_name, sa.Column("organization_id", _uuid_type(), nullable=True))

        if _has_table("master_organizations") and not _has_fk(table_name, fk_name):
            op.create_foreign_key(
                fk_name,
                table_name,
                "master_organizations",
                ["organization_id"],
                ["id"],
                ondelete="RESTRICT",
                onupdate="CASCADE",
            )

    if not _has_index(table_name, index_name):
        op.create_index(index_name, table_name, ["organization_id"], unique=False)


def upgrade() -> None:
    _add_secretaria_column("users", "ix_users_organization_id", "fk_users_organization_id_master_organizations")
    _add_secretaria_column("drivers", "idx_drivers_organization_id", "fk_drivers_organization_id_master_organizations")


def downgrade() -> None:
    for table_name, index_name, fk_name in (
        ("drivers", "idx_drivers_organization_id", "fk_drivers_organization_id_master_organizations"),
        ("users", "ix_users_organization_id", "fk_users_organization_id_master_organizations"),
    ):
        if not _has_table(table_name):
            continue
        if _has_index(table_name, index_name):
            op.drop_index(index_name, table_name=table_name)
        if op.get_bind().dialect.name == "sqlite" and (_has_fk(table_name, fk_name) or _has_column(table_name, "organization_id")):
            with op.batch_alter_table(table_name) as batch:
                if _has_fk(table_name, fk_name):
                    batch.drop_constraint(fk_name, type_="foreignkey")
                if _has_column(table_name, "organization_id"):
                    batch.drop_column("organization_id")
            continue
        if _has_fk(table_name, fk_name):
            op.drop_constraint(fk_name, table_name, type_="foreignkey")
        if _has_column(table_name, "organization_id"):
            op.drop_column(table_name, "organization_id")
