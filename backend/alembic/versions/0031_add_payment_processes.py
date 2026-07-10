"""add payment processes

Revision ID: 0031_payment_processes
Revises: 0030_data_imports
Create Date: 2026-06-02
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0031_payment_processes"
down_revision = "0030_data_imports"
branch_labels = None
depends_on = None


PAYMENT_PROCESS_KIND_VALUES = ("FUEL", "MAINTENANCE")


def _bind():
    return op.get_bind()


def _inspector():
    return sa.inspect(_bind())


def _has_table(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _uuid_type():
    if _bind().dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=36)


def _uuid_default():
    if _bind().dialect.name == "postgresql":
        return sa.text("gen_random_uuid()")
    return None


def _now_default():
    return sa.text("NOW()")


def _enum_type(name: str, values: tuple[str, ...]):
    if _bind().dialect.name == "postgresql":
        return postgresql.ENUM(*values, name=name, create_type=False)
    return sa.String(length=40)


def _create_postgresql_enums() -> None:
    if _bind().dialect.name != "postgresql":
        return
    postgresql.ENUM(*PAYMENT_PROCESS_KIND_VALUES, name="payment_process_kind").create(_bind(), checkfirst=True)


def _seed_payment_process_permissions() -> None:
    if not _has_table("user_permissions") or not _has_table("users"):
        return

    existing = {
        row[0]
        for row in _bind().execute(sa.text("SELECT user_id FROM user_permissions WHERE module = 'payment_processes'"))
    }
    users = _bind().execute(sa.text("SELECT id, role FROM users")).mappings().all()
    now = datetime.now(timezone.utc)
    rows = []
    for user in users:
        if user["id"] in existing:
            continue
        role = str(user["role"])
        can_all = role == "ADMIN"
        can_manage = role == "PRODUCAO"
        rows.append(
            {
                "id": str(uuid4()),
                "user_id": user["id"],
                "module": "payment_processes",
                "can_view": can_all or can_manage,
                "can_create": can_all or can_manage,
                "can_edit": can_all or can_manage,
                "can_delete": can_all,
                "created_at": now,
                "updated_at": now,
            }
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


def upgrade() -> None:
    _create_postgresql_enums()

    if not _has_table("payment_processes"):
        op.create_table(
            "payment_processes",
            sa.Column("id", _uuid_type(), primary_key=True, nullable=False, server_default=_uuid_default()),
            sa.Column("import_key", sa.String(length=320), nullable=False),
            sa.Column("process_number", sa.String(length=80), nullable=False),
            sa.Column("kind", _enum_type("payment_process_kind", PAYMENT_PROCESS_KIND_VALUES), nullable=False, server_default=sa.text("'FUEL'")),
            sa.Column("system", sa.String(length=80), nullable=True),
            sa.Column("status", sa.String(length=80), nullable=True),
            sa.Column("billing_number", sa.String(length=80), nullable=True),
            sa.Column("invoice_number", sa.String(length=80), nullable=True),
            sa.Column("invoice_type", sa.String(length=120), nullable=True),
            sa.Column("unit_name", sa.String(length=255), nullable=True),
            sa.Column("organization_id", _uuid_type(), nullable=True),
            sa.Column("issue_date", sa.Date(), nullable=True),
            sa.Column("process_type", sa.String(length=120), nullable=True),
            sa.Column("amount", sa.Numeric(14, 2), nullable=True),
            sa.Column("supplier_name", sa.String(length=255), nullable=True),
            sa.Column("contract_number", sa.String(length=80), nullable=True),
            sa.Column("contract_balance", sa.Numeric(14, 2), nullable=True),
            sa.Column("location", sa.String(length=255), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("source_filename", sa.String(length=255), nullable=True),
            sa.Column("source_sheet", sa.String(length=160), nullable=True),
            sa.Column("created_by_user_id", _uuid_type(), nullable=True),
            sa.Column("updated_by_user_id", _uuid_type(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.ForeignKeyConstraint(["organization_id"], ["master_organizations.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        )
        op.create_index("idx_payment_processes_kind", "payment_processes", ["kind"], unique=False)
        op.create_index("idx_payment_processes_status", "payment_processes", ["status"], unique=False)
        op.create_index("idx_payment_processes_process_number", "payment_processes", ["process_number"], unique=False)
        op.create_index("idx_payment_processes_organization_id", "payment_processes", ["organization_id"], unique=False)
        op.create_index("uq_payment_processes_import_key", "payment_processes", ["import_key"], unique=True)

    _seed_payment_process_permissions()


def downgrade() -> None:
    if _has_table("payment_processes"):
        op.drop_index("uq_payment_processes_import_key", table_name="payment_processes")
        op.drop_index("idx_payment_processes_organization_id", table_name="payment_processes")
        op.drop_index("idx_payment_processes_process_number", table_name="payment_processes")
        op.drop_index("idx_payment_processes_status", table_name="payment_processes")
        op.drop_index("idx_payment_processes_kind", table_name="payment_processes")
        op.drop_table("payment_processes")

    if _has_table("user_permissions"):
        _bind().execute(sa.text("DELETE FROM user_permissions WHERE module = 'payment_processes'"))

    if _bind().dialect.name == "postgresql":
        postgresql.ENUM(name="payment_process_kind").drop(_bind(), checkfirst=True)
