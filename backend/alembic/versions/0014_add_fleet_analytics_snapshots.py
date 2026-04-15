"""add fleet analytics snapshots table

Revision ID: 0014_fleet_analytics
Revises: 0013_vehicle_type
Create Date: 2026-04-15 11:30:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0014_fleet_analytics"
down_revision = "0013_vehicle_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fleet_analytics_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=True),
        sa.Column("driver_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vehicle_type", sa.String(length=40), nullable=False),
        sa.Column("scope", sa.String(length=30), nullable=False, server_default=sa.text("'VEHICLE'")),
        sa.Column("total_km", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_liters", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("fuel_cost", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("maintenance_cost", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("fines_cost", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("consumption_l_100km", sa.Float(), nullable=True),
        sa.Column("tco_cost_per_km", sa.Float(), nullable=True),
        sa.Column("driver_risk_score", sa.Float(), nullable=True),
        sa.Column("anomalies_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("category_average_consumption", sa.Float(), nullable=True),
        sa.Column("category_average_tco", sa.Float(), nullable=True),
        sa.Column("market_benchmark_tco", sa.Float(), nullable=True),
        sa.Column("extra_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_index("idx_fleet_analytics_snapshot_period", "fleet_analytics_snapshots", ["period_start", "period_end"], unique=False)
    op.create_index("idx_fleet_analytics_snapshot_scope", "fleet_analytics_snapshots", ["vehicle_type", "vehicle_id", "driver_id"], unique=False)
    op.create_index("idx_fleet_analytics_snapshot_created", "fleet_analytics_snapshots", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_fleet_analytics_snapshot_created", table_name="fleet_analytics_snapshots")
    op.drop_index("idx_fleet_analytics_snapshot_scope", table_name="fleet_analytics_snapshots")
    op.drop_index("idx_fleet_analytics_snapshot_period", table_name="fleet_analytics_snapshots")
    op.drop_table("fleet_analytics_snapshots")
