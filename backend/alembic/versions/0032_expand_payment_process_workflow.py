"""expand payment process workflow

Revision ID: 0032_payment_workflow
Revises: 0031_payment_processes
Create Date: 2026-06-03
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0032_payment_workflow"
down_revision = "0031_payment_processes"
branch_labels = None
depends_on = None


PAYMENT_PROCESS_STAGE_VALUES = (
    "ASSEMBLY",
    "REVIEW",
    "COMMITMENT",
    "LIQUIDATION",
    "PAYMENT",
    "PAID",
    "ARCHIVED",
    "RETURNED",
    "CANCELLED",
)
PAYMENT_CHECKLIST_STATUS_VALUES = ("PENDING", "DONE", "WAIVED")
PAYMENT_CONTRACT_STATUS_VALUES = ("ACTIVE", "SUSPENDED", "FINISHED", "CANCELLED")
PAYMENT_REFERENCE_TYPE_VALUES = (
    "FUEL_SUPPLY",
    "FUEL_SUPPLY_ORDER",
    "MAINTENANCE",
    "VEHICLE",
    "SERVICE_ORDER",
    "INVOICE",
    "OTHER",
)


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


def _has_index(table_name: str, index_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _has_fk(table_name: str, constraint_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(fk["name"] == constraint_name for fk in _inspector().get_foreign_keys(table_name))


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


def _bool_default(value: bool):
    if _bind().dialect.name == "postgresql":
        return sa.text("true" if value else "false")
    return sa.text("1" if value else "0")


def _enum_type(name: str, values: tuple[str, ...]):
    if _bind().dialect.name == "postgresql":
        return postgresql.ENUM(*values, name=name, create_type=False)
    return sa.String(length=40)


def _create_postgresql_enums() -> None:
    if _bind().dialect.name != "postgresql":
        return
    postgresql.ENUM(*PAYMENT_PROCESS_STAGE_VALUES, name="payment_process_stage").create(_bind(), checkfirst=True)
    postgresql.ENUM(*PAYMENT_CHECKLIST_STATUS_VALUES, name="payment_checklist_status").create(_bind(), checkfirst=True)
    postgresql.ENUM(*PAYMENT_CONTRACT_STATUS_VALUES, name="payment_contract_status").create(_bind(), checkfirst=True)
    postgresql.ENUM(*PAYMENT_REFERENCE_TYPE_VALUES, name="payment_process_reference_type").create(_bind(), checkfirst=True)


def _drop_postgresql_enums() -> None:
    if _bind().dialect.name != "postgresql":
        return
    postgresql.ENUM(name="payment_process_reference_type").drop(_bind(), checkfirst=True)
    postgresql.ENUM(name="payment_contract_status").drop(_bind(), checkfirst=True)
    postgresql.ENUM(name="payment_checklist_status").drop(_bind(), checkfirst=True)
    postgresql.ENUM(name="payment_process_stage").drop(_bind(), checkfirst=True)


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if _has_table(table_name) and not _has_column(table_name, column.name):
        op.add_column(table_name, column)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str], *, unique: bool = False) -> None:
    if _has_table(table_name) and not _has_index(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def _create_fk_if_missing(name: str, source: str, referent: str, local_cols: list[str], remote_cols: list[str], *, ondelete: str | None = None) -> None:
    if _bind().dialect.name == "sqlite":
        return
    if _has_table(source) and _has_table(referent) and not _has_fk(source, name):
        op.create_foreign_key(name, source, referent, local_cols, remote_cols, ondelete=ondelete)


def _stage_from_status(status: str | None) -> str:
    text = (status or "").strip().upper()
    if not text:
        return "ASSEMBLY"
    if "CANCEL" in text or "REPROV" in text:
        return "CANCELLED"
    if "DEVOL" in text:
        return "RETURNED"
    if "PAGO" in text or "CONCL" in text:
        return "PAID"
    if "LIQUID" in text:
        return "LIQUIDATION"
    if "EMPENH" in text:
        return "COMMITMENT"
    if "PAGAMENTO" in text or "FINAN" in text or "TESOUR" in text:
        return "PAYMENT"
    if "ANAL" in text or "CONFER" in text:
        return "REVIEW"
    return "ASSEMBLY"


def _normalize_name(value: str | None) -> str | None:
    text = " ".join(str(value or "").split()).strip()
    return text.upper() if text else None


def _first_day(value) -> date | None:
    if not value:
        return None
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return date(value.year, value.month, 1)
    return None


def _create_supplier_table() -> None:
    if _has_table("payment_suppliers"):
        return
    op.create_table(
        "payment_suppliers",
        sa.Column("id", _uuid_type(), primary_key=True, nullable=False, server_default=_uuid_default()),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("cnpj", sa.String(length=20), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=_bool_default(True)),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
        sa.UniqueConstraint("name", name="uq_payment_suppliers_name"),
        sa.UniqueConstraint("cnpj", name="uq_payment_suppliers_cnpj"),
    )
    op.create_index("idx_payment_suppliers_name", "payment_suppliers", ["name"], unique=False)
    op.create_index("idx_payment_suppliers_active", "payment_suppliers", ["active"], unique=False)


def _create_contract_tables() -> None:
    if not _has_table("payment_contracts"):
        op.create_table(
            "payment_contracts",
            sa.Column("id", _uuid_type(), primary_key=True, nullable=False, server_default=_uuid_default()),
            sa.Column("supplier_id", _uuid_type(), nullable=False),
            sa.Column("number", sa.String(length=80), nullable=False),
            sa.Column("kind", _enum_type("payment_process_kind", ("FUEL", "MAINTENANCE")), nullable=True),
            sa.Column("contract_type", sa.String(length=120), nullable=True),
            sa.Column("object_description", sa.Text(), nullable=True),
            sa.Column("valid_from", sa.Date(), nullable=True),
            sa.Column("valid_until", sa.Date(), nullable=True),
            sa.Column("value_initial", sa.Numeric(14, 2), nullable=True),
            sa.Column("value_updated", sa.Numeric(14, 2), nullable=True),
            sa.Column("imported_balance", sa.Numeric(14, 2), nullable=True),
            sa.Column("status", _enum_type("payment_contract_status", PAYMENT_CONTRACT_STATUS_VALUES), nullable=False, server_default=sa.text("'ACTIVE'")),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.ForeignKeyConstraint(["supplier_id"], ["payment_suppliers.id"], ondelete="RESTRICT"),
            sa.UniqueConstraint("supplier_id", "number", name="uq_payment_contract_supplier_number"),
        )
        op.create_index("idx_payment_contracts_supplier", "payment_contracts", ["supplier_id"], unique=False)
        op.create_index("idx_payment_contracts_number", "payment_contracts", ["number"], unique=False)
        op.create_index("idx_payment_contracts_status", "payment_contracts", ["status"], unique=False)
        op.create_index("idx_payment_contracts_valid_until", "payment_contracts", ["valid_until"], unique=False)

    if not _has_table("payment_contract_amendments"):
        op.create_table(
            "payment_contract_amendments",
            sa.Column("id", _uuid_type(), primary_key=True, nullable=False, server_default=_uuid_default()),
            sa.Column("contract_id", _uuid_type(), nullable=False),
            sa.Column("amendment_type", sa.String(length=120), nullable=True),
            sa.Column("number", sa.String(length=80), nullable=True),
            sa.Column("signed_at", sa.Date(), nullable=True),
            sa.Column("value_delta", sa.Numeric(14, 2), nullable=True),
            sa.Column("valid_until", sa.Date(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.ForeignKeyConstraint(["contract_id"], ["payment_contracts.id"], ondelete="CASCADE"),
        )
        op.create_index("idx_payment_contract_amendments_contract", "payment_contract_amendments", ["contract_id"], unique=False)
        op.create_index("idx_payment_contract_amendments_number", "payment_contract_amendments", ["number"], unique=False)


def _create_process_child_tables() -> None:
    if not _has_table("payment_process_references"):
        op.create_table(
            "payment_process_references",
            sa.Column("id", _uuid_type(), primary_key=True, nullable=False, server_default=_uuid_default()),
            sa.Column("process_id", _uuid_type(), nullable=False),
            sa.Column("reference_type", _enum_type("payment_process_reference_type", PAYMENT_REFERENCE_TYPE_VALUES), nullable=False, server_default=sa.text("'OTHER'")),
            sa.Column("external_id", sa.String(length=120), nullable=True),
            sa.Column("label", sa.String(length=180), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.ForeignKeyConstraint(["process_id"], ["payment_processes.id"], ondelete="CASCADE"),
        )
        op.create_index("idx_payment_process_references_process", "payment_process_references", ["process_id"], unique=False)
        op.create_index("idx_payment_process_references_type", "payment_process_references", ["reference_type"], unique=False)
        op.create_index("idx_payment_process_references_external", "payment_process_references", ["external_id"], unique=False)

    if not _has_table("payment_process_checklist_items"):
        op.create_table(
            "payment_process_checklist_items",
            sa.Column("id", _uuid_type(), primary_key=True, nullable=False, server_default=_uuid_default()),
            sa.Column("process_id", _uuid_type(), nullable=False),
            sa.Column("stage", _enum_type("payment_process_stage", PAYMENT_PROCESS_STAGE_VALUES), nullable=False),
            sa.Column("item_label", sa.String(length=180), nullable=False),
            sa.Column("status", _enum_type("payment_checklist_status", PAYMENT_CHECKLIST_STATUS_VALUES), nullable=False, server_default=sa.text("'PENDING'")),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("updated_by_user_id", _uuid_type(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.ForeignKeyConstraint(["process_id"], ["payment_processes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        )
        op.create_index("idx_payment_process_checklist_process", "payment_process_checklist_items", ["process_id"], unique=False)
        op.create_index("idx_payment_process_checklist_stage", "payment_process_checklist_items", ["stage"], unique=False)
        op.create_index("idx_payment_process_checklist_status", "payment_process_checklist_items", ["status"], unique=False)

    if not _has_table("payment_process_stage_events"):
        op.create_table(
            "payment_process_stage_events",
            sa.Column("id", _uuid_type(), primary_key=True, nullable=False, server_default=_uuid_default()),
            sa.Column("process_id", _uuid_type(), nullable=False),
            sa.Column("from_stage", _enum_type("payment_process_stage", PAYMENT_PROCESS_STAGE_VALUES), nullable=True),
            sa.Column("to_stage", _enum_type("payment_process_stage", PAYMENT_PROCESS_STAGE_VALUES), nullable=False),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("alerts_snapshot", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", _uuid_type(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now_default()),
            sa.ForeignKeyConstraint(["process_id"], ["payment_processes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        )
        op.create_index("idx_payment_process_stage_events_process", "payment_process_stage_events", ["process_id"], unique=False)
        op.create_index("idx_payment_process_stage_events_created_at", "payment_process_stage_events", ["created_at"], unique=False)


def _extend_payment_processes() -> None:
    if not _has_table("payment_processes"):
        return

    _add_column_if_missing("payment_processes", sa.Column("stage", _enum_type("payment_process_stage", PAYMENT_PROCESS_STAGE_VALUES), nullable=False, server_default=sa.text("'ASSEMBLY'")))
    _add_column_if_missing("payment_processes", sa.Column("supplier_id", _uuid_type(), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("contract_id", _uuid_type(), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("competence_month", sa.Date(), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("due_date", sa.Date(), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("paid_at", sa.Date(), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("assigned_to_user_id", _uuid_type(), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("stage_owner", sa.String(length=120), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("status_note", sa.Text(), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("commitment_number", sa.String(length=80), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("commitment_date", sa.Date(), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("liquidation_number", sa.String(length=80), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("liquidation_date", sa.Date(), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("payment_order_number", sa.String(length=80), nullable=True))
    _add_column_if_missing("payment_processes", sa.Column("payment_order_date", sa.Date(), nullable=True))

    _create_index_if_missing("idx_payment_processes_stage", "payment_processes", ["stage"])
    _create_index_if_missing("idx_payment_processes_supplier_id", "payment_processes", ["supplier_id"])
    _create_index_if_missing("idx_payment_processes_contract_id", "payment_processes", ["contract_id"])
    _create_index_if_missing("idx_payment_processes_competence_month", "payment_processes", ["competence_month"])
    _create_index_if_missing("idx_payment_processes_due_date", "payment_processes", ["due_date"])

    _create_fk_if_missing("fk_payment_processes_supplier_id_payment_suppliers", "payment_processes", "payment_suppliers", ["supplier_id"], ["id"], ondelete="SET NULL")
    _create_fk_if_missing("fk_payment_processes_contract_id_payment_contracts", "payment_processes", "payment_contracts", ["contract_id"], ["id"], ondelete="SET NULL")
    _create_fk_if_missing("fk_payment_processes_assigned_to_user_id_users", "payment_processes", "users", ["assigned_to_user_id"], ["id"], ondelete="SET NULL")


def _migrate_existing_payment_processes() -> None:
    if not (_has_table("payment_processes") and _has_table("payment_suppliers") and _has_table("payment_contracts")):
        return

    bind = _bind()
    now = datetime.now(timezone.utc)
    supplier_by_name: dict[str, str] = {}
    contract_by_key: dict[tuple[str, str], str] = {}

    existing_suppliers = bind.execute(sa.text("SELECT id, name FROM payment_suppliers")).mappings().all()
    for supplier in existing_suppliers:
        supplier_by_name[_normalize_name(supplier["name"]) or ""] = supplier["id"]

    existing_contracts = bind.execute(sa.text("SELECT id, supplier_id, number FROM payment_contracts")).mappings().all()
    for contract in existing_contracts:
        contract_by_key[(str(contract["supplier_id"]), _normalize_name(contract["number"]) or "")] = contract["id"]

    rows = bind.execute(
        sa.text(
            """
            SELECT id, status, issue_date, kind, supplier_name, contract_number, contract_balance
            FROM payment_processes
            """
        )
    ).mappings().all()

    for row in rows:
        supplier_id = None
        supplier_name = _normalize_name(row["supplier_name"])
        if supplier_name:
            supplier_id = supplier_by_name.get(supplier_name)
            if supplier_id is None:
                supplier_id = str(uuid4())
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO payment_suppliers (id, name, active, created_at, updated_at)
                        VALUES (:id, :name, :active, :created_at, :updated_at)
                        """
                    ),
                    {"id": supplier_id, "name": supplier_name, "active": True, "created_at": now, "updated_at": now},
                )
                supplier_by_name[supplier_name] = supplier_id

        contract_id = None
        contract_number = _normalize_name(row["contract_number"])
        if supplier_id and contract_number:
            contract_key = (str(supplier_id), contract_number)
            contract_id = contract_by_key.get(contract_key)
            if contract_id is None:
                contract_id = str(uuid4())
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO payment_contracts (
                            id, supplier_id, number, kind, imported_balance, status, created_at, updated_at
                        )
                        VALUES (
                            :id, :supplier_id, :number, :kind, :imported_balance, 'ACTIVE', :created_at, :updated_at
                        )
                        """
                    ),
                    {
                        "id": contract_id,
                        "supplier_id": supplier_id,
                        "number": contract_number,
                        "kind": row["kind"],
                        "imported_balance": row["contract_balance"],
                        "created_at": now,
                        "updated_at": now,
                    },
                )
                contract_by_key[contract_key] = contract_id
            elif row["contract_balance"] is not None:
                bind.execute(
                    sa.text(
                        """
                        UPDATE payment_contracts
                        SET imported_balance = COALESCE(imported_balance, :imported_balance),
                            updated_at = :updated_at
                        WHERE id = :id
                        """
                    ),
                    {"id": contract_id, "imported_balance": row["contract_balance"], "updated_at": now},
                )

        bind.execute(
            sa.text(
                """
                UPDATE payment_processes
                SET stage = :stage,
                    supplier_id = COALESCE(supplier_id, :supplier_id),
                    contract_id = COALESCE(contract_id, :contract_id),
                    competence_month = COALESCE(competence_month, :competence_month)
                WHERE id = :id
                """
            ),
            {
                "id": row["id"],
                "stage": _stage_from_status(row["status"]),
                "supplier_id": supplier_id,
                "contract_id": contract_id,
                "competence_month": _first_day(row["issue_date"]),
            },
        )


def upgrade() -> None:
    _create_postgresql_enums()
    _create_supplier_table()
    _create_contract_tables()
    _extend_payment_processes()
    _create_process_child_tables()
    _migrate_existing_payment_processes()


def downgrade() -> None:
    if _has_table("payment_process_stage_events"):
        op.drop_index("idx_payment_process_stage_events_created_at", table_name="payment_process_stage_events")
        op.drop_index("idx_payment_process_stage_events_process", table_name="payment_process_stage_events")
        op.drop_table("payment_process_stage_events")

    if _has_table("payment_process_checklist_items"):
        op.drop_index("idx_payment_process_checklist_status", table_name="payment_process_checklist_items")
        op.drop_index("idx_payment_process_checklist_stage", table_name="payment_process_checklist_items")
        op.drop_index("idx_payment_process_checklist_process", table_name="payment_process_checklist_items")
        op.drop_table("payment_process_checklist_items")

    if _has_table("payment_process_references"):
        op.drop_index("idx_payment_process_references_external", table_name="payment_process_references")
        op.drop_index("idx_payment_process_references_type", table_name="payment_process_references")
        op.drop_index("idx_payment_process_references_process", table_name="payment_process_references")
        op.drop_table("payment_process_references")

    if _has_table("payment_processes"):
        for index_name in (
            "idx_payment_processes_due_date",
            "idx_payment_processes_competence_month",
            "idx_payment_processes_contract_id",
            "idx_payment_processes_supplier_id",
            "idx_payment_processes_stage",
        ):
            if _has_index("payment_processes", index_name):
                op.drop_index(index_name, table_name="payment_processes")
        for column_name in (
            "payment_order_date",
            "payment_order_number",
            "liquidation_date",
            "liquidation_number",
            "commitment_date",
            "commitment_number",
            "status_note",
            "stage_owner",
            "assigned_to_user_id",
            "paid_at",
            "due_date",
            "competence_month",
            "contract_id",
            "supplier_id",
            "stage",
        ):
            if _has_column("payment_processes", column_name):
                op.drop_column("payment_processes", column_name)

    if _has_table("payment_contract_amendments"):
        op.drop_index("idx_payment_contract_amendments_number", table_name="payment_contract_amendments")
        op.drop_index("idx_payment_contract_amendments_contract", table_name="payment_contract_amendments")
        op.drop_table("payment_contract_amendments")

    if _has_table("payment_contracts"):
        op.drop_index("idx_payment_contracts_valid_until", table_name="payment_contracts")
        op.drop_index("idx_payment_contracts_status", table_name="payment_contracts")
        op.drop_index("idx_payment_contracts_number", table_name="payment_contracts")
        op.drop_index("idx_payment_contracts_supplier", table_name="payment_contracts")
        op.drop_table("payment_contracts")

    if _has_table("payment_suppliers"):
        op.drop_index("idx_payment_suppliers_active", table_name="payment_suppliers")
        op.drop_index("idx_payment_suppliers_name", table_name="payment_suppliers")
        op.drop_table("payment_suppliers")

    _drop_postgresql_enums()
