"""add fuel stations and user links

Revision ID: 0017_fuel_stations
Revises: f7febf84cec9
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0017_fuel_stations"
down_revision = "f7febf84cec9"
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


def _has_index(table_name: str, index_name: str, columns: list[str] | None = None) -> bool:
    if not _has_table(table_name):
        return False
    for index in _inspector().get_indexes(table_name):
        if index["name"] == index_name:
            return True
        if columns and index.get("column_names") == columns:
            return True
    return False


def _has_unique_constraint(table_name: str, constraint_name: str, columns: list[str] | None = None) -> bool:
    if not _has_table(table_name):
        return False
    for constraint in _inspector().get_unique_constraints(table_name):
        if constraint["name"] == constraint_name:
            return True
        if columns and constraint.get("column_names") == columns:
            return True
    return False


def _has_foreign_key(
    table_name: str,
    *,
    constraint_name: str,
    constrained_columns: list[str],
    referred_table: str,
) -> bool:
    if not _has_table(table_name):
        return False
    for foreign_key in _inspector().get_foreign_keys(table_name):
        if foreign_key.get("name") == constraint_name:
            return True
        if foreign_key.get("constrained_columns") == constrained_columns and foreign_key.get("referred_table") == referred_table:
            return True
    return False


def _has_trigger(table_name: str, trigger_name: str) -> bool:
    bind = op.get_bind()
    query = sa.text(
        """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
              AND event_object_table = :table_name
              AND trigger_name = :trigger_name
        )
        """
    )
    return bool(bind.execute(query, {"table_name": table_name, "trigger_name": trigger_name}).scalar())


def upgrade() -> None:
    if not _has_table("fuel_stations"):
        op.create_table(
            "fuel_stations",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("name", sa.String(length=180), nullable=False),
            sa.Column("cnpj", sa.String(length=18), nullable=True),
            sa.Column("address", sa.String(length=255), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
            sa.UniqueConstraint("name", name="uq_fuel_stations_name"),
        )
    elif not _has_unique_constraint("fuel_stations", "uq_fuel_stations_name", ["name"]):
        op.create_unique_constraint("uq_fuel_stations_name", "fuel_stations", ["name"])

    if _has_table("fuel_stations") and not _has_column("fuel_stations", "cnpj"):
        op.add_column("fuel_stations", sa.Column("cnpj", sa.String(length=18), nullable=True))
    if _has_table("fuel_stations") and not _has_column("fuel_stations", "address"):
        op.add_column("fuel_stations", sa.Column("address", sa.String(length=255), nullable=True))
        op.execute("UPDATE fuel_stations SET address = COALESCE(address, 'Endereco nao informado') WHERE address IS NULL")
        op.alter_column("fuel_stations", "address", existing_type=sa.String(length=255), nullable=False)

    if not _has_index("fuel_stations", "idx_fuel_stations_name", ["name"]):
        op.create_index("idx_fuel_stations_name", "fuel_stations", ["name"], unique=False)
    if not _has_index("fuel_stations", "idx_fuel_stations_active", ["active"]):
        op.create_index("idx_fuel_stations_active", "fuel_stations", ["active"], unique=False)
    if not _has_trigger("fuel_stations", "trg_fuel_stations_updated_at"):
        op.execute("CREATE TRIGGER trg_fuel_stations_updated_at BEFORE UPDATE ON fuel_stations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();")

    if not _has_table("fuel_station_users"):
        op.create_table(
            "fuel_station_users",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("fuel_station_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("fuel_stations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
            sa.UniqueConstraint("user_id", "fuel_station_id", name="uq_fuel_station_users_user_station"),
        )
    elif not _has_unique_constraint("fuel_station_users", "uq_fuel_station_users_user_station", ["user_id", "fuel_station_id"]):
        op.create_unique_constraint("uq_fuel_station_users_user_station", "fuel_station_users", ["user_id", "fuel_station_id"])

    if _has_table("fuel_station_users"):
        if not _has_index("fuel_station_users", "idx_fuel_station_users_user", ["user_id"]):
            op.create_index("idx_fuel_station_users_user", "fuel_station_users", ["user_id"], unique=False)
        if not _has_index("fuel_station_users", "idx_fuel_station_users_station", ["fuel_station_id"]):
            op.create_index("idx_fuel_station_users_station", "fuel_station_users", ["fuel_station_id"], unique=False)
        if not _has_index("fuel_station_users", "idx_fuel_station_users_active", ["active"]):
            op.create_index("idx_fuel_station_users_active", "fuel_station_users", ["active"], unique=False)
        if not _has_trigger("fuel_station_users", "trg_fuel_station_users_updated_at"):
            op.execute("CREATE TRIGGER trg_fuel_station_users_updated_at BEFORE UPDATE ON fuel_station_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();")

    if not _has_column("fuel_supplies", "fuel_station_id"):
        op.add_column("fuel_supplies", sa.Column("fuel_station_id", postgresql.UUID(as_uuid=True), nullable=True))
    if _has_column("fuel_supplies", "fuel_station_id") and not _has_foreign_key(
        "fuel_supplies",
        constraint_name="fk_fuel_supplies_fuel_station_id",
        constrained_columns=["fuel_station_id"],
        referred_table="fuel_stations",
    ):
        op.create_foreign_key("fk_fuel_supplies_fuel_station_id", "fuel_supplies", "fuel_stations", ["fuel_station_id"], ["id"], ondelete="SET NULL")
    if _has_column("fuel_supplies", "fuel_station_id") and not _has_index("fuel_supplies", "idx_fuel_supplies_fuel_station_id", ["fuel_station_id"]):
        op.create_index("idx_fuel_supplies_fuel_station_id", "fuel_supplies", ["fuel_station_id"], unique=False)

    if _has_table("fuel_supply_orders"):
        if not _has_column("fuel_supply_orders", "fuel_station_id"):
            op.add_column("fuel_supply_orders", sa.Column("fuel_station_id", postgresql.UUID(as_uuid=True), nullable=True))
        if _has_column("fuel_supply_orders", "fuel_station_id") and not _has_foreign_key(
            "fuel_supply_orders",
            constraint_name="fk_fuel_supply_orders_fuel_station_id",
            constrained_columns=["fuel_station_id"],
            referred_table="fuel_stations",
        ):
            op.create_foreign_key(
                "fk_fuel_supply_orders_fuel_station_id",
                "fuel_supply_orders",
                "fuel_stations",
                ["fuel_station_id"],
                ["id"],
                ondelete="SET NULL",
            )
        if _has_column("fuel_supply_orders", "fuel_station_id") and not _has_index(
            "fuel_supply_orders",
            "idx_fuel_supply_orders_fuel_station_id",
            ["fuel_station_id"],
        ):
            op.create_index("idx_fuel_supply_orders_fuel_station_id", "fuel_supply_orders", ["fuel_station_id"], unique=False)


def downgrade() -> None:
    if _has_table("fuel_supply_orders") and _has_column("fuel_supply_orders", "fuel_station_id"):
        if _has_index("fuel_supply_orders", "idx_fuel_supply_orders_fuel_station_id", ["fuel_station_id"]):
            op.drop_index("idx_fuel_supply_orders_fuel_station_id", table_name="fuel_supply_orders")
        if _has_foreign_key(
            "fuel_supply_orders",
            constraint_name="fk_fuel_supply_orders_fuel_station_id",
            constrained_columns=["fuel_station_id"],
            referred_table="fuel_stations",
        ):
            foreign_keys = _inspector().get_foreign_keys("fuel_supply_orders")
            matching = next(
                (
                    foreign_key
                    for foreign_key in foreign_keys
                    if foreign_key.get("constrained_columns") == ["fuel_station_id"] and foreign_key.get("referred_table") == "fuel_stations"
                ),
                None,
            )
            if matching and matching.get("name"):
                op.drop_constraint(matching["name"], "fuel_supply_orders", type_="foreignkey")
        op.drop_column("fuel_supply_orders", "fuel_station_id")

    if _has_table("fuel_supplies") and _has_column("fuel_supplies", "fuel_station_id"):
        if _has_index("fuel_supplies", "idx_fuel_supplies_fuel_station_id", ["fuel_station_id"]):
            op.drop_index("idx_fuel_supplies_fuel_station_id", table_name="fuel_supplies")
        if _has_foreign_key(
            "fuel_supplies",
            constraint_name="fk_fuel_supplies_fuel_station_id",
            constrained_columns=["fuel_station_id"],
            referred_table="fuel_stations",
        ):
            foreign_keys = _inspector().get_foreign_keys("fuel_supplies")
            matching = next(
                (
                    foreign_key
                    for foreign_key in foreign_keys
                    if foreign_key.get("constrained_columns") == ["fuel_station_id"] and foreign_key.get("referred_table") == "fuel_stations"
                ),
                None,
            )
            if matching and matching.get("name"):
                op.drop_constraint(matching["name"], "fuel_supplies", type_="foreignkey")
        op.drop_column("fuel_supplies", "fuel_station_id")

    if _has_table("fuel_station_users"):
        op.execute("DROP TRIGGER IF EXISTS trg_fuel_station_users_updated_at ON fuel_station_users")
        if _has_index("fuel_station_users", "idx_fuel_station_users_active", ["active"]):
            op.drop_index("idx_fuel_station_users_active", table_name="fuel_station_users")
        if _has_index("fuel_station_users", "idx_fuel_station_users_station", ["fuel_station_id"]):
            op.drop_index("idx_fuel_station_users_station", table_name="fuel_station_users")
        if _has_index("fuel_station_users", "idx_fuel_station_users_user", ["user_id"]):
            op.drop_index("idx_fuel_station_users_user", table_name="fuel_station_users")
        op.drop_table("fuel_station_users")

    if _has_table("fuel_stations"):
        op.execute("DROP TRIGGER IF EXISTS trg_fuel_stations_updated_at ON fuel_stations")
        if _has_index("fuel_stations", "idx_fuel_stations_active", ["active"]):
            op.drop_index("idx_fuel_stations_active", table_name="fuel_stations")
        if _has_index("fuel_stations", "idx_fuel_stations_name", ["name"]):
            op.drop_index("idx_fuel_stations_name", table_name="fuel_stations")
        if _has_column("fuel_stations", "address"):
            op.drop_column("fuel_stations", "address")
        if _has_column("fuel_stations", "cnpj"):
            op.drop_column("fuel_stations", "cnpj")
        op.drop_table("fuel_stations")
