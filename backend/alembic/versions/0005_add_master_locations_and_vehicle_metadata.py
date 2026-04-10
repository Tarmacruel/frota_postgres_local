"""add master locations and vehicle metadata

Revision ID: 0005_master_vehicle_meta
Revises: 0004_possession_evidence
Create Date: 2026-04-10 10:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_master_vehicle_meta"
down_revision = "0004_possession_evidence"
branch_labels = None
depends_on = None

vehicle_ownership_type = postgresql.ENUM("PROPRIO", "LOCADO", name="vehicle_ownership_type", create_type=False)


def upgrade() -> None:
    vehicle_ownership_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "master_organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("name", name="uq_master_organizations_name"),
    )
    op.create_index("idx_master_organizations_name", "master_organizations", ["name"], unique=False)

    op.create_table(
        "master_departments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["organization_id"], ["master_organizations.id"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.UniqueConstraint("organization_id", "name", name="uq_master_departments_org_name"),
    )
    op.create_index("idx_master_departments_org", "master_departments", ["organization_id"], unique=False)

    op.create_table(
        "master_allocations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["department_id"], ["master_departments.id"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.UniqueConstraint("department_id", "name", name="uq_master_allocations_department_name"),
    )
    op.create_index("idx_master_allocations_department", "master_allocations", ["department_id"], unique=False)

    op.add_column("vehicles", sa.Column("chassis_number", sa.String(length=50), nullable=True))
    op.add_column("vehicles", sa.Column("ownership_type", vehicle_ownership_type, nullable=False, server_default="PROPRIO"))
    op.create_index("idx_vehicles_chassis_number", "vehicles", ["chassis_number"], unique=True)

    op.add_column("location_history", sa.Column("allocation_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.alter_column("location_history", "department", type_=sa.String(length=255), existing_type=sa.String(length=100), existing_nullable=False)
    op.create_index("idx_location_history_allocation", "location_history", ["allocation_id"], unique=False)
    op.create_foreign_key(
        "fk_location_history_allocation",
        "location_history",
        "master_allocations",
        ["allocation_id"],
        ["id"],
        ondelete="RESTRICT",
        onupdate="CASCADE",
    )

    op.execute(
        "CREATE TRIGGER trg_master_organizations_updated_at BEFORE UPDATE ON master_organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
    )
    op.execute(
        "CREATE TRIGGER trg_master_departments_updated_at BEFORE UPDATE ON master_departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
    )
    op.execute(
        "CREATE TRIGGER trg_master_allocations_updated_at BEFORE UPDATE ON master_allocations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_master_allocations_updated_at ON master_allocations")
    op.execute("DROP TRIGGER IF EXISTS trg_master_departments_updated_at ON master_departments")
    op.execute("DROP TRIGGER IF EXISTS trg_master_organizations_updated_at ON master_organizations")

    op.drop_constraint("fk_location_history_allocation", "location_history", type_="foreignkey")
    op.drop_index("idx_location_history_allocation", table_name="location_history")
    op.alter_column("location_history", "department", type_=sa.String(length=100), existing_type=sa.String(length=255), existing_nullable=False)
    op.drop_column("location_history", "allocation_id")

    op.drop_index("idx_vehicles_chassis_number", table_name="vehicles")
    op.drop_column("vehicles", "ownership_type")
    op.drop_column("vehicles", "chassis_number")

    op.drop_index("idx_master_allocations_department", table_name="master_allocations")
    op.drop_table("master_allocations")
    op.drop_index("idx_master_departments_org", table_name="master_departments")
    op.drop_table("master_departments")
    op.drop_index("idx_master_organizations_name", table_name="master_organizations")
    op.drop_table("master_organizations")

    vehicle_ownership_type.drop(op.get_bind(), checkfirst=True)
