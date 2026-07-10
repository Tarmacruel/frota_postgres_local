"""add user permissions

Revision ID: 0028_user_permissions
Revises: 0027_user_driver_secretaria
Create Date: 2026-05-11
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0028_user_permissions"
down_revision = "0027_user_driver_secretaria"
branch_labels = None
depends_on = None


PERMISSION_MODULES = (
    "vehicles",
    "possession",
    "drivers",
    "maintenance",
    "claims",
    "fines",
    "master_data",
    "fuel_supplies",
    "fuel_supply_orders",
    "fuel_stations",
    "analytics",
)


def _uuid_type():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=36)


def _bool_default(value: bool = False):
    return sa.text("true" if value else "false")


def _uuid_default():
    if op.get_bind().dialect.name == "postgresql":
        return sa.text("gen_random_uuid()")
    return None


def _blank_permissions() -> dict[str, dict[str, bool]]:
    return {
        module: {
            "can_view": False,
            "can_create": False,
            "can_edit": False,
            "can_delete": False,
        }
        for module in PERMISSION_MODULES
    }


def _defaults_for_role(role: str) -> dict[str, dict[str, bool]]:
    permissions = _blank_permissions()

    if role == "ADMIN":
        for module in permissions:
            permissions[module] = {
                "can_view": True,
                "can_create": True,
                "can_edit": True,
                "can_delete": True,
            }
        return permissions

    if role == "PRODUCAO":
        for module in (
            "vehicles",
            "possession",
            "drivers",
            "maintenance",
            "claims",
            "fines",
            "master_data",
            "fuel_supplies",
            "fuel_supply_orders",
        ):
            permissions[module].update(can_view=True, can_create=True, can_edit=True)
        permissions["fuel_stations"]["can_view"] = True
        return permissions

    if role == "POSTO":
        permissions["fuel_supply_orders"].update(can_view=True, can_edit=True)
        return permissions

    return permissions


def upgrade() -> None:
    op.create_table(
        "user_permissions",
        sa.Column("id", _uuid_type(), primary_key=True, nullable=False, server_default=_uuid_default()),
        sa.Column("user_id", _uuid_type(), nullable=False),
        sa.Column("module", sa.String(length=50), nullable=False),
        sa.Column("can_view", sa.Boolean(), nullable=False, server_default=_bool_default(False)),
        sa.Column("can_create", sa.Boolean(), nullable=False, server_default=_bool_default(False)),
        sa.Column("can_edit", sa.Boolean(), nullable=False, server_default=_bool_default(False)),
        sa.Column("can_delete", sa.Boolean(), nullable=False, server_default=_bool_default(False)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_permissions_user_id_users", ondelete="CASCADE", onupdate="CASCADE"),
        sa.UniqueConstraint("user_id", "module", name="uq_user_permissions_user_module"),
    )
    op.create_index("idx_user_permissions_user_id", "user_permissions", ["user_id"], unique=False)
    op.create_index("idx_user_permissions_module", "user_permissions", ["module"], unique=False)

    bind = op.get_bind()
    users = bind.execute(sa.text("SELECT id, role FROM users")).mappings().all()
    now = datetime.now(timezone.utc)
    rows = []
    for user in users:
        for module, flags in _defaults_for_role(str(user["role"])).items():
            rows.append(
                {
                    "id": str(uuid4()),
                    "user_id": user["id"],
                    "module": module,
                    "can_view": flags["can_view"],
                    "can_create": flags["can_create"],
                    "can_edit": flags["can_edit"],
                    "can_delete": flags["can_delete"],
                    "created_at": now,
                    "updated_at": now,
                }
            )

    if rows:
        permissions_table = sa.table(
            "user_permissions",
            sa.column("id", _uuid_type()),
            sa.column("user_id", _uuid_type()),
            sa.column("module", sa.String()),
            sa.column("can_view", sa.Boolean()),
            sa.column("can_create", sa.Boolean()),
            sa.column("can_edit", sa.Boolean()),
            sa.column("can_delete", sa.Boolean()),
            sa.column("created_at", sa.DateTime(timezone=True)),
            sa.column("updated_at", sa.DateTime(timezone=True)),
        )
        op.bulk_insert(permissions_table, rows)


def downgrade() -> None:
    op.drop_index("idx_user_permissions_module", table_name="user_permissions")
    op.drop_index("idx_user_permissions_user_id", table_name="user_permissions")
    op.drop_table("user_permissions")
