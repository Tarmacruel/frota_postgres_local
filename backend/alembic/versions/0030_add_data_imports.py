"""add data imports

Revision ID: 0030_data_imports
Revises: 0029_fuel_supply_details
Create Date: 2026-06-01
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0030_data_imports"
down_revision = "0029_fuel_supply_details"
branch_labels = None
depends_on = None


DRIVER_LICENSE_VALUES = ("A", "B", "C", "D", "E", "AB", "AC", "AD", "AE")


def _bind():
    return op.get_bind()


def _inspector():
    return sa.inspect(_bind())


def _has_table(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(column["name"] == column_name for column in _inspector().get_columns(table_name))


def _uuid_type():
    if _bind().dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=36)


def _uuid_default():
    if _bind().dialect.name == "postgresql":
        return sa.text("gen_random_uuid()")
    return None


def _json_type():
    if _bind().dialect.name == "postgresql":
        return postgresql.JSONB(astext_type=sa.Text())
    return sa.JSON()


def _now_default():
    return sa.text("NOW()")


def _enum_type(name: str, values: tuple[str, ...]):
    if _bind().dialect.name == "postgresql":
        return postgresql.ENUM(*values, name=name, create_type=False)
    return sa.String(length=40)


def _add_columns(table_name: str, columns: list[sa.Column]) -> None:
    if not _has_table(table_name):
        return
    for column in columns:
        if not _has_column(table_name, column.name):
            op.add_column(table_name, column)


def _add_postgresql_driver_categories() -> None:
    if _bind().dialect.name != "postgresql":
        return
    existing = {
        row[0]
        for row in _bind().execute(
            sa.text(
                "SELECT enumlabel FROM pg_enum "
                "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                "WHERE pg_type.typname = 'driver_license_category'"
            )
        )
    }
    for value in DRIVER_LICENSE_VALUES:
        if value not in existing:
            op.execute(sa.text(f"ALTER TYPE driver_license_category ADD VALUE IF NOT EXISTS '{value}'"))


def _create_postgresql_enums() -> None:
    if _bind().dialect.name != "postgresql":
        return
    enums = (
        ("data_import_entity_type", ("VEHICLE", "DRIVER")),
        ("data_import_batch_status", ("ANALYZED", "REVIEWING", "APPLIED", "CANCELLED")),
        ("data_import_row_status", ("PENDING", "APPROVED", "REJECTED", "APPLIED", "ERROR")),
        ("data_import_suggested_action", ("CREATE", "UPDATE", "REVIEW", "SKIP")),
    )
    for name, values in enums:
        postgresql.ENUM(*values, name=name).create(_bind(), checkfirst=True)


def _seed_data_import_permissions() -> None:
    if not _has_table("user_permissions") or not _has_table("users"):
        return

    existing = {
        row[0]
        for row in _bind().execute(sa.text("SELECT user_id FROM user_permissions WHERE module = 'data_imports'"))
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
                "module": "data_imports",
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
    _add_postgresql_driver_categories()
    _create_postgresql_enums()

    _add_columns(
        "vehicles",
        [
            sa.Column("renavam", sa.String(length=30), nullable=True),
            sa.Column("year", sa.String(length=20), nullable=True),
            sa.Column("prefix", sa.String(length=80), nullable=True),
            sa.Column("patrimonio_numero_frota", sa.String(length=80), nullable=True),
            sa.Column("color", sa.String(length=40), nullable=True),
            sa.Column("fuel_type", sa.String(length=120), nullable=True),
            sa.Column("tank_capacity_liters", sa.Float(), nullable=True),
            sa.Column("transmission", sa.String(length=40), nullable=True),
            sa.Column("city", sa.String(length=80), nullable=True),
            sa.Column("state", sa.String(length=2), nullable=True),
            sa.Column("registered_detran", sa.Boolean(), nullable=True),
            sa.Column("engine_spec", sa.String(length=120), nullable=True),
        ],
    )
    _add_columns(
        "drivers",
        [
            sa.Column("registro", sa.String(length=30), nullable=True),
            sa.Column("matricula", sa.String(length=30), nullable=True),
            sa.Column("cargo", sa.String(length=120), nullable=True),
            sa.Column("cnh_numero", sa.String(length=30), nullable=True),
            sa.Column("rg", sa.String(length=30), nullable=True),
            sa.Column("data_nascimento", sa.Date(), nullable=True),
            sa.Column("data_emissao_cnh", sa.Date(), nullable=True),
            sa.Column("ultimo_abastecimento", sa.DateTime(timezone=True), nullable=True),
        ],
    )

    if not _has_table("data_import_batches"):
        op.create_table(
            "data_import_batches",
            sa.Column("id", _uuid_type(), primary_key=True, nullable=False, server_default=_uuid_default()),
            sa.Column("entity_type", _enum_type("data_import_entity_type", ("VEHICLE", "DRIVER")), nullable=False),
            sa.Column("status", _enum_type("data_import_batch_status", ("ANALYZED", "REVIEWING", "APPLIED", "CANCELLED")), nullable=False),
            sa.Column("source_filename", sa.String(length=255), nullable=False),
            sa.Column("stored_path", sa.String(length=255), nullable=True),
            sa.Column("header_row_index", sa.Integer(), nullable=True),
            sa.Column("detected_columns", _json_type(), nullable=False),
            sa.Column("importable_fields", _json_type(), nullable=False),
            sa.Column("official_extra_fields", _json_type(), nullable=False),
            sa.Column("triage_extra_fields", _json_type(), nullable=False),
            sa.Column("summary", _json_type(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_by_id", _uuid_type(), nullable=True),
            sa.Column("applied_by_id", _uuid_type(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["applied_by_id"], ["users.id"], ondelete="SET NULL"),
        )

    if not _has_table("data_import_rows"):
        op.create_table(
            "data_import_rows",
            sa.Column("id", _uuid_type(), primary_key=True, nullable=False, server_default=_uuid_default()),
            sa.Column("batch_id", _uuid_type(), nullable=False),
            sa.Column("row_number", sa.Integer(), nullable=False),
            sa.Column("status", _enum_type("data_import_row_status", ("PENDING", "APPROVED", "REJECTED", "APPLIED", "ERROR")), nullable=False),
            sa.Column("suggested_action", _enum_type("data_import_suggested_action", ("CREATE", "UPDATE", "REVIEW", "SKIP")), nullable=False),
            sa.Column("matched_entity_id", _uuid_type(), nullable=True),
            sa.Column("matched_by", sa.String(length=40), nullable=True),
            sa.Column("raw_data", _json_type(), nullable=False),
            sa.Column("mapped_data", _json_type(), nullable=False),
            sa.Column("official_extra_data", _json_type(), nullable=False),
            sa.Column("triage_extra_data", _json_type(), nullable=False),
            sa.Column("conflicts", _json_type(), nullable=False),
            sa.Column("validation_errors", _json_type(), nullable=False),
            sa.Column("manager_notes", sa.Text(), nullable=True),
            sa.Column("applied_result", _json_type(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["batch_id"], ["data_import_batches.id"], ondelete="CASCADE"),
        )
        op.create_index("idx_data_import_rows_batch_id", "data_import_rows", ["batch_id"], unique=False)
        op.create_index("idx_data_import_rows_status", "data_import_rows", ["status"], unique=False)
        op.create_index("idx_data_import_rows_matched_entity_id", "data_import_rows", ["matched_entity_id"], unique=False)

    _seed_data_import_permissions()


def downgrade() -> None:
    if _has_table("data_import_rows"):
        op.drop_index("idx_data_import_rows_matched_entity_id", table_name="data_import_rows")
        op.drop_index("idx_data_import_rows_status", table_name="data_import_rows")
        op.drop_index("idx_data_import_rows_batch_id", table_name="data_import_rows")
        op.drop_table("data_import_rows")
    if _has_table("data_import_batches"):
        op.drop_table("data_import_batches")

    if _bind().dialect.name == "postgresql":
        for name in (
            "data_import_suggested_action",
            "data_import_row_status",
            "data_import_batch_status",
            "data_import_entity_type",
        ):
            postgresql.ENUM(name=name).drop(_bind(), checkfirst=True)

    if _has_table("user_permissions"):
        _bind().execute(sa.text("DELETE FROM user_permissions WHERE module = 'data_imports'"))
