"""add fines module

Revision ID: 0009_fines_module
Revises: 0008_drv_claims
Create Date: 2026-04-13 00:10:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0009_fines_module"
down_revision = "0008_drv_claims"
branch_labels = None
depends_on = None

fine_status = postgresql.ENUM("PENDENTE", "PAGA", "RECURSO", name="fine_status", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    fine_status.create(bind, checkfirst=True)

    op.create_table(
        "fines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ticket_number", sa.String(length=50), nullable=False),
        sa.Column("infraction_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("status", fine_status, nullable=False, server_default="PENDENTE"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint("amount >= 0", name="ck_fines_amount_non_negative"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
    )
    op.create_index("idx_fines_vehicle", "fines", ["vehicle_id"], unique=False)
    op.create_index("idx_fines_driver", "fines", ["driver_id"], unique=False)
    op.create_index("idx_fines_due_date", "fines", ["due_date"], unique=False)
    op.create_index("idx_fines_status", "fines", ["status"], unique=False)
    op.execute("CREATE TRIGGER trg_fines_updated_at BEFORE UPDATE ON fines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();")


def downgrade() -> None:
    bind = op.get_bind()
    op.execute("DROP TRIGGER IF EXISTS trg_fines_updated_at ON fines")
    op.drop_index("idx_fines_status", table_name="fines")
    op.drop_index("idx_fines_due_date", table_name="fines")
    op.drop_index("idx_fines_driver", table_name="fines")
    op.drop_index("idx_fines_vehicle", table_name="fines")
    op.drop_table("fines")
    fine_status.drop(bind, checkfirst=True)
