"""add fine infractions catalog and fine imports

Revision ID: 0035_fine_infractions_import
Revises: 0034_production_default_permissions
Create Date: 2026-06-08
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0035_fine_infractions_import"
down_revision = "0034_production_default_permissions"
branch_labels = None
depends_on = None


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


def _now_default():
    return sa.text("NOW()") if _bind().dialect.name == "postgresql" else sa.text("CURRENT_TIMESTAMP")


def _bool_default(value: bool):
    if _bind().dialect.name == "postgresql":
        return sa.text("true" if value else "false")
    return sa.text("1" if value else "0")


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


def _add_enum_value(type_name: str, value: str) -> None:
    if _bind().dialect.name != "postgresql":
        return
    op.execute(sa.text(f"ALTER TYPE {type_name} ADD VALUE IF NOT EXISTS '{value}'"))


def _seed_infractions() -> None:
    if not _has_table("fine_infractions"):
        return
    existing = {
        (row["code"], row["desdobramento"])
        for row in _bind().execute(sa.text("SELECT code, desdobramento FROM fine_infractions")).mappings().all()
    }
    seed_path = Path(__file__).resolve().parents[2] / "app" / "data" / "fine_infractions_seed.json"
    if not seed_path.is_file():
        return
    now = datetime.now(timezone.utc)
    rows = []
    for item in json.loads(seed_path.read_text(encoding="utf-8")):
        key = (item["code"], item.get("desdobramento") or "0")
        if key in existing:
            continue
        existing.add(key)
        rows.append(
            {
                "id": str(uuid4()),
                "code": key[0],
                "desdobramento": key[1],
                "description": item["description"],
                "normalized_description": item.get("normalized_description"),
                "ctb_article": item.get("ctb_article"),
                "offender": item.get("offender"),
                "severity": item.get("severity"),
                "competent_body": item.get("competent_body"),
                "default_amount": item.get("default_amount"),
                "points": item.get("points"),
                "is_active": True,
                "is_official": bool(item.get("is_official", True)),
                "is_provisional": False,
                "source": item.get("source"),
                "created_at": now,
                "updated_at": now,
            }
        )
    if rows:
        op.bulk_insert(
            sa.table(
                "fine_infractions",
                sa.column("id", _uuid_type()),
                sa.column("code", sa.String()),
                sa.column("desdobramento", sa.String()),
                sa.column("description", sa.Text()),
                sa.column("normalized_description", sa.Text()),
                sa.column("ctb_article", sa.String()),
                sa.column("offender", sa.String()),
                sa.column("severity", sa.String()),
                sa.column("competent_body", sa.String()),
                sa.column("default_amount", sa.Numeric(12, 2)),
                sa.column("points", sa.Integer()),
                sa.column("is_active", sa.Boolean()),
                sa.column("is_official", sa.Boolean()),
                sa.column("is_provisional", sa.Boolean()),
                sa.column("source", sa.String()),
                sa.column("created_at", sa.DateTime(timezone=True)),
                sa.column("updated_at", sa.DateTime(timezone=True)),
            ),
            rows,
        )


def upgrade() -> None:
    _add_enum_value("fine_status", "DEFERIDA")
    _add_enum_value("data_import_entity_type", "FINE")

    if not _has_table("fine_infractions"):
        op.create_table(
            "fine_infractions",
            sa.Column("id", _uuid_type(), primary_key=True, nullable=False, server_default=_uuid_default()),
            sa.Column("code", sa.String(length=40), nullable=False),
            sa.Column("desdobramento", sa.String(length=10), nullable=False, server_default="0"),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("normalized_description", sa.Text(), nullable=True),
            sa.Column("ctb_article", sa.String(length=120), nullable=True),
            sa.Column("offender", sa.String(length=80), nullable=True),
            sa.Column("severity", sa.String(length=80), nullable=True),
            sa.Column("competent_body", sa.String(length=120), nullable=True),
            sa.Column("default_amount", sa.Numeric(12, 2), nullable=True),
            sa.Column("points", sa.Integer(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=_bool_default(True)),
            sa.Column("is_official", sa.Boolean(), nullable=False, server_default=_bool_default(True)),
            sa.Column("is_provisional", sa.Boolean(), nullable=False, server_default=_bool_default(False)),
            sa.Column("source", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.UniqueConstraint("code", "desdobramento", name="uq_fine_infractions_code_desdobramento"),
        )
        op.create_index("idx_fine_infractions_code", "fine_infractions", ["code"], unique=False)
        op.create_index("idx_fine_infractions_active", "fine_infractions", ["is_active"], unique=False)
        op.create_index("idx_fine_infractions_normalized_description", "fine_infractions", ["normalized_description"], unique=False)
        if _bind().dialect.name == "postgresql":
            op.execute(
                "CREATE TRIGGER trg_fine_infractions_updated_at BEFORE UPDATE ON fine_infractions "
                "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
            )

    _add_columns(
        "vehicles",
        [
            sa.Column("is_provisional", sa.Boolean(), nullable=False, server_default=_bool_default(False)),
            sa.Column("provisional_source", sa.String(length=255), nullable=True),
        ],
    )

    _add_columns(
        "fines",
        [
            sa.Column("infraction_type_id", _uuid_type(), nullable=True),
            sa.Column("infraction_time", sa.Time(), nullable=True),
            sa.Column("communication_number", sa.String(length=50), nullable=True),
            sa.Column("sent_date", sa.Date(), nullable=True),
            sa.Column("process_number", sa.String(length=80), nullable=True),
            sa.Column("source_status", sa.String(length=80), nullable=True),
            sa.Column("imported_driver_name", sa.String(length=150), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("source_import_row_id", _uuid_type(), nullable=True),
        ],
    )
    if _has_table("fines"):
        try:
            op.create_foreign_key("fk_fines_infraction_type_id", "fines", "fine_infractions", ["infraction_type_id"], ["id"], ondelete="SET NULL")
        except Exception:
            pass
        if _has_table("data_import_rows"):
            try:
                op.create_foreign_key("fk_fines_source_import_row_id", "fines", "data_import_rows", ["source_import_row_id"], ["id"], ondelete="SET NULL")
            except Exception:
                pass
        try:
            op.create_index("idx_fines_infraction_type_id", "fines", ["infraction_type_id"], unique=False)
        except Exception:
            pass
        try:
            op.create_index("idx_fines_source_import_row_id", "fines", ["source_import_row_id"], unique=False)
        except Exception:
            pass

    _seed_infractions()


def downgrade() -> None:
    if _has_table("fines"):
        for index_name in ("idx_fines_source_import_row_id", "idx_fines_infraction_type_id"):
            try:
                op.drop_index(index_name, table_name="fines")
            except Exception:
                pass
        for constraint_name in ("fk_fines_source_import_row_id", "fk_fines_infraction_type_id"):
            try:
                op.drop_constraint(constraint_name, "fines", type_="foreignkey")
            except Exception:
                pass
        for column_name in (
            "source_import_row_id",
            "notes",
            "imported_driver_name",
            "source_status",
            "process_number",
            "sent_date",
            "communication_number",
            "infraction_time",
            "infraction_type_id",
        ):
            if _has_column("fines", column_name):
                op.drop_column("fines", column_name)

    for column_name in ("provisional_source", "is_provisional"):
        if _has_column("vehicles", column_name):
            op.drop_column("vehicles", column_name)

    if _has_table("fine_infractions"):
        if _bind().dialect.name == "postgresql":
            op.execute("DROP TRIGGER IF EXISTS trg_fine_infractions_updated_at ON fine_infractions")
        op.drop_index("idx_fine_infractions_normalized_description", table_name="fine_infractions")
        op.drop_index("idx_fine_infractions_active", table_name="fine_infractions")
        op.drop_index("idx_fine_infractions_code", table_name="fine_infractions")
        op.drop_table("fine_infractions")
