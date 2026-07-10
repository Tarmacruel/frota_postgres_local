"""fix production default permissions

Revision ID: 0034_production_default_permissions
Revises: 0033_payment_contract_auto_balance
Create Date: 2026-06-04
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0034_production_default_permissions"
down_revision = "0033_payment_contract_auto_balance"
branch_labels = None
depends_on = None


PRODUCTION_MANAGED_MODULES = (
    "vehicles",
    "possession",
    "drivers",
    "maintenance",
    "claims",
    "fines",
    "master_data",
    "fuel_supplies",
    "fuel_supply_orders",
    "payment_processes",
    "data_imports",
)

PRODUCTION_VIEW_ONLY_MODULES = ("fuel_stations",)


def _bind():
    return op.get_bind()


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(_bind()).get_table_names()


def _uuid_type():
    if _bind().dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=36)


def _permission_defaults() -> dict[str, dict[str, bool]]:
    defaults = {
        module: {"can_view": True, "can_create": True, "can_edit": True, "can_delete": False}
        for module in PRODUCTION_MANAGED_MODULES
    }
    for module in PRODUCTION_VIEW_ONLY_MODULES:
        defaults[module] = {"can_view": True, "can_create": False, "can_edit": False, "can_delete": False}
    return defaults


def upgrade() -> None:
    if not _has_table("users") or not _has_table("user_permissions"):
        return

    bind = _bind()
    users = bind.execute(sa.text("SELECT id FROM users WHERE role = 'PRODUCAO'")).mappings().all()
    if not users:
        return

    now = datetime.now(timezone.utc)
    rows = []
    for user in users:
        for module, flags in _permission_defaults().items():
            existing = bind.execute(
                sa.text(
                    "SELECT id, can_view, can_create, can_edit, can_delete "
                    "FROM user_permissions WHERE user_id = :user_id AND module = :module"
                ),
                {"user_id": user["id"], "module": module},
            ).mappings().first()

            if not existing:
                rows.append(
                    {
                        "id": str(uuid4()),
                        "user_id": user["id"],
                        "module": module,
                        **flags,
                        "created_at": now,
                        "updated_at": now,
                    }
                )
                continue

            if not any((existing["can_view"], existing["can_create"], existing["can_edit"], existing["can_delete"])):
                bind.execute(
                    sa.text(
                        "UPDATE user_permissions "
                        "SET can_view = :can_view, can_create = :can_create, can_edit = :can_edit, "
                        "can_delete = :can_delete, updated_at = :updated_at "
                        "WHERE id = :id"
                    ),
                    {**flags, "updated_at": now, "id": existing["id"]},
                )

    if rows:
        op.bulk_insert(
            sa.table(
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
            ),
            rows,
        )


def downgrade() -> None:
    pass
