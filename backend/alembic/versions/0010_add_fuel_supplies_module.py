"""add fuel supplies module

Revision ID: 0010_fuel_supplies
Revises: 0009_fines_module
Create Date: 2026-04-13 10:30:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0010_fuel_supplies"
down_revision = "0009_fines_module"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fuel_supplies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("supplied_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("odometer_km", sa.Float(), nullable=False),
        sa.Column("liters", sa.Float(), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("fuel_station", sa.String(length=180), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("consumption_km_l", sa.Float(), nullable=True),
        sa.Column("is_consumption_anomaly", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("anomaly_details", sa.Text(), nullable=True),
        sa.Column("receipt_path", sa.String(length=255), nullable=False),
        sa.Column("receipt_mime_type", sa.String(length=100), nullable=False),
        sa.Column("receipt_size_bytes", sa.Integer(), nullable=False),
        sa.Column("receipt_uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint("odometer_km > 0", name="ck_fuel_supplies_odometer_positive"),
        sa.CheckConstraint("liters > 0", name="ck_fuel_supplies_liters_positive"),
        sa.CheckConstraint("total_amount IS NULL OR total_amount >= 0", name="ck_fuel_supplies_amount_non_negative"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["master_organizations.id"], ondelete="SET NULL"),
    )

    op.create_index("idx_fuel_supplies_vehicle", "fuel_supplies", ["vehicle_id"], unique=False)
    op.create_index("idx_fuel_supplies_driver", "fuel_supplies", ["driver_id"], unique=False)
    op.create_index("idx_fuel_supplies_organization", "fuel_supplies", ["organization_id"], unique=False)
    op.create_index("idx_fuel_supplies_supplied_at", "fuel_supplies", ["supplied_at"], unique=False)
    op.create_index("idx_fuel_supplies_anomaly", "fuel_supplies", ["is_consumption_anomaly"], unique=False)
    op.execute("CREATE TRIGGER trg_fuel_supplies_updated_at BEFORE UPDATE ON fuel_supplies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_fuel_supplies_updated_at ON fuel_supplies")
    op.drop_index("idx_fuel_supplies_anomaly", table_name="fuel_supplies")
    op.drop_index("idx_fuel_supplies_supplied_at", table_name="fuel_supplies")
    op.drop_index("idx_fuel_supplies_organization", table_name="fuel_supplies")
    op.drop_index("idx_fuel_supplies_driver", table_name="fuel_supplies")
    op.drop_index("idx_fuel_supplies_vehicle", table_name="fuel_supplies")
    op.drop_table("fuel_supplies")
