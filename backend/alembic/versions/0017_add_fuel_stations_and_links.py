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


def upgrade() -> None:
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
    op.create_index("idx_fuel_stations_name", "fuel_stations", ["name"], unique=False)
    op.create_index("idx_fuel_stations_active", "fuel_stations", ["active"], unique=False)
    op.execute("CREATE TRIGGER trg_fuel_stations_updated_at BEFORE UPDATE ON fuel_stations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();")

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
    op.create_index("idx_fuel_station_users_user", "fuel_station_users", ["user_id"], unique=False)
    op.create_index("idx_fuel_station_users_station", "fuel_station_users", ["fuel_station_id"], unique=False)
    op.create_index("idx_fuel_station_users_active", "fuel_station_users", ["active"], unique=False)
    op.execute("CREATE TRIGGER trg_fuel_station_users_updated_at BEFORE UPDATE ON fuel_station_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();")

    op.add_column("fuel_supplies", sa.Column("fuel_station_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_fuel_supplies_fuel_station_id", "fuel_supplies", "fuel_stations", ["fuel_station_id"], ["id"], ondelete="SET NULL")
    op.create_index("idx_fuel_supplies_fuel_station_id", "fuel_supplies", ["fuel_station_id"], unique=False)

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "fuel_supply_orders" in inspector.get_table_names():
        op.add_column("fuel_supply_orders", sa.Column("fuel_station_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "fk_fuel_supply_orders_fuel_station_id",
            "fuel_supply_orders",
            "fuel_stations",
            ["fuel_station_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index("idx_fuel_supply_orders_fuel_station_id", "fuel_supply_orders", ["fuel_station_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "fuel_supply_orders" in inspector.get_table_names():
        op.drop_index("idx_fuel_supply_orders_fuel_station_id", table_name="fuel_supply_orders")
        op.drop_constraint("fk_fuel_supply_orders_fuel_station_id", "fuel_supply_orders", type_="foreignkey")
        op.drop_column("fuel_supply_orders", "fuel_station_id")

    op.drop_index("idx_fuel_supplies_fuel_station_id", table_name="fuel_supplies")
    op.drop_constraint("fk_fuel_supplies_fuel_station_id", "fuel_supplies", type_="foreignkey")
    op.drop_column("fuel_supplies", "fuel_station_id")

    op.execute("DROP TRIGGER IF EXISTS trg_fuel_station_users_updated_at ON fuel_station_users")
    op.drop_index("idx_fuel_station_users_active", table_name="fuel_station_users")
    op.drop_index("idx_fuel_station_users_station", table_name="fuel_station_users")
    op.drop_index("idx_fuel_station_users_user", table_name="fuel_station_users")
    op.drop_table("fuel_station_users")

    op.execute("DROP TRIGGER IF EXISTS trg_fuel_stations_updated_at ON fuel_stations")
    op.drop_index("idx_fuel_stations_active", table_name="fuel_stations")
    op.drop_index("idx_fuel_stations_name", table_name="fuel_stations")
    op.drop_table("fuel_stations")
