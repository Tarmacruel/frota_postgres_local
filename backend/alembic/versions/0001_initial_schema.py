"""initial schema

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2026-04-07 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None

user_role = postgresql.ENUM("ADMIN", "PADRAO", name="user_role", create_type=False)
vehicle_status = postgresql.ENUM("ATIVO", "MANUTENCAO", "INATIVO", name="vehicle_status", create_type=False)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    user_role.create(op.get_bind(), checkfirst=True)
    vehicle_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", user_role, nullable=False, server_default="PADRAO"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("idx_users_email", "users", ["email"], unique=False)

    op.create_table(
        "vehicles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plate", sa.String(length=20), nullable=False),
        sa.Column("brand", sa.String(length=50), nullable=False),
        sa.Column("model", sa.String(length=50), nullable=False),
        sa.Column("status", vehicle_status, nullable=False, server_default="ATIVO"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("plate", name="uq_vehicles_plate"),
    )
    op.create_index("idx_vehicles_plate", "vehicles", ["plate"], unique=False)
    op.create_index("idx_vehicles_status", "vehicles", ["status"], unique=False)

    op.create_table(
        "location_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department", sa.String(length=100), nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE", onupdate="CASCADE"),
    )
    op.create_index("idx_history_vehicle", "location_history", ["vehicle_id"], unique=False)
    op.execute(
        "CREATE UNIQUE INDEX uq_location_history_active ON location_history(vehicle_id) WHERE end_date IS NULL"
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
        """
    )
    op.execute(
        "CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
    )
    op.execute(
        "CREATE TRIGGER trg_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON vehicles")
    op.execute("DROP TRIGGER IF EXISTS trg_users_updated_at ON users")
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column")
    op.drop_index("uq_location_history_active", table_name="location_history")
    op.drop_index("idx_history_vehicle", table_name="location_history")
    op.drop_table("location_history")
    op.drop_index("idx_vehicles_status", table_name="vehicles")
    op.drop_index("idx_vehicles_plate", table_name="vehicles")
    op.drop_table("vehicles")
    op.drop_index("idx_users_email", table_name="users")
    op.drop_table("users")
    vehicle_status.drop(op.get_bind(), checkfirst=True)
    user_role.drop(op.get_bind(), checkfirst=True)
