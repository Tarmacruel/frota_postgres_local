"""add fuel supply orders

Revision ID: 0015_fuel_supply_orders
Revises: 0014_fleet_analytics
Create Date: 2026-04-16 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0015_fuel_supply_orders"
down_revision = "0014_fleet_analytics"
branch_labels = None
depends_on = None


def _create_fuel_stations_table_if_missing() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "fuel_stations" in inspector.get_table_names():
        return

    op.create_table(
        "fuel_stations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("name", name="uq_fuel_stations_name"),
    )
    op.create_index("idx_fuel_stations_name", "fuel_stations", ["name"], unique=False)
    op.execute(
        "CREATE TRIGGER trg_fuel_stations_updated_at "
        "BEFORE UPDATE ON fuel_stations "
        "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
    )


def upgrade() -> None:
    _create_fuel_stations_table_if_missing()

    op.create_table(
        "fuel_supply_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("fuel_station_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "status",
            sa.Enum("OPEN", "EXPIRED", "COMPLETED", "CANCELLED", name="fuel_supply_order_status"),
            nullable=False,
            server_default=sa.text("'OPEN'"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW() + INTERVAL '48 hours'")),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("confirmed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("requested_liters", sa.Numeric(10, 3), nullable=True),
        sa.Column("max_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint("requested_liters IS NULL OR requested_liters > 0", name="ck_fuel_supply_orders_requested_liters_positive"),
        sa.CheckConstraint("max_amount IS NULL OR max_amount >= 0", name="ck_fuel_supply_orders_max_amount_non_negative"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["master_organizations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["fuel_station_id"], ["fuel_stations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["confirmed_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )

    op.create_index("idx_fuel_supply_orders_status", "fuel_supply_orders", ["status"], unique=False)
    op.create_index("idx_fuel_supply_orders_expires_at", "fuel_supply_orders", ["expires_at"], unique=False)
    op.create_index("idx_fuel_supply_orders_vehicle_id", "fuel_supply_orders", ["vehicle_id"], unique=False)
    op.create_index("idx_fuel_supply_orders_fuel_station_id", "fuel_supply_orders", ["fuel_station_id"], unique=False)
    op.execute(
        "CREATE TRIGGER trg_fuel_supply_orders_updated_at "
        "BEFORE UPDATE ON fuel_supply_orders "
        "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_fuel_supply_orders_updated_at ON fuel_supply_orders")
    op.drop_index("idx_fuel_supply_orders_fuel_station_id", table_name="fuel_supply_orders")
    op.drop_index("idx_fuel_supply_orders_vehicle_id", table_name="fuel_supply_orders")
    op.drop_index("idx_fuel_supply_orders_expires_at", table_name="fuel_supply_orders")
    op.drop_index("idx_fuel_supply_orders_status", table_name="fuel_supply_orders")
    op.drop_table("fuel_supply_orders")
    op.execute("DROP TYPE IF EXISTS fuel_supply_order_status")
