"""add maintenance and possession tables

Revision ID: 0002_maint_possession
Revises: 0001_initial_schema
Create Date: 2026-04-09 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_maint_possession"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "maintenance_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("service_description", sa.Text(), nullable=False),
        sa.Column("parts_replaced", sa.Text(), nullable=True),
        sa.Column("total_cost", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint("total_cost >= 0", name="check_total_cost_non_negative"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE", onupdate="CASCADE"),
    )
    op.create_index("idx_maintenance_vehicle", "maintenance_records", ["vehicle_id"], unique=False)
    op.create_index("idx_maintenance_dates", "maintenance_records", ["start_date", "end_date"], unique=False)
    op.create_index("idx_maintenance_created_by", "maintenance_records", ["created_by"], unique=False)
    op.execute(
        "CREATE TRIGGER trg_maintenance_updated_at BEFORE UPDATE ON maintenance_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
    )

    op.create_table(
        "vehicle_possession",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("driver_name", sa.String(length=150), nullable=False),
        sa.Column("driver_document", sa.String(length=20), nullable=True),
        sa.Column("driver_contact", sa.String(length=50), nullable=True),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("observation", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE", onupdate="CASCADE"),
    )
    op.create_index("idx_possession_vehicle", "vehicle_possession", ["vehicle_id"], unique=False)
    op.create_index("idx_possession_driver", "vehicle_possession", ["driver_name"], unique=False)
    op.execute("CREATE UNIQUE INDEX uq_possession_active ON vehicle_possession(vehicle_id) WHERE end_date IS NULL")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_possession_active")
    op.drop_index("idx_possession_driver", table_name="vehicle_possession")
    op.drop_index("idx_possession_vehicle", table_name="vehicle_possession")
    op.drop_table("vehicle_possession")

    op.execute("DROP TRIGGER IF EXISTS trg_maintenance_updated_at ON maintenance_records")
    op.drop_index("idx_maintenance_created_by", table_name="maintenance_records")
    op.drop_index("idx_maintenance_dates", table_name="maintenance_records")
    op.drop_index("idx_maintenance_vehicle", table_name="maintenance_records")
    op.drop_table("maintenance_records")
