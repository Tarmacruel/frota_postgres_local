"""add drivers claims and vehicle updates

Revision ID: 0008_drv_claims
Revises: 0007_possession_photo_gallery
Create Date: 2026-04-10 23:10:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_drv_claims"
down_revision = "0007_possession_photo_gallery"
branch_labels = None
depends_on = None

claim_status = postgresql.ENUM("ABERTO", "EM_ANALISE", "ENCERRADO", name="claim_status", create_type=False)
claim_type = postgresql.ENUM("COLISAO", "ROUBO", "FURTO", "AVARIA", "OUTRO", name="claim_type", create_type=False)
driver_license_category = postgresql.ENUM("A", "B", "C", "D", "E", name="driver_license_category", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()

    op.execute("ALTER TYPE vehicle_ownership_type RENAME TO vehicle_ownership_type_old")
    postgresql.ENUM("PROPRIO", "LOCADO", "CEDIDO", name="vehicle_ownership_type").create(bind, checkfirst=False)
    op.execute(
        """
        ALTER TABLE vehicles
        ALTER COLUMN ownership_type DROP DEFAULT,
        ALTER COLUMN ownership_type TYPE vehicle_ownership_type
        USING ownership_type::text::vehicle_ownership_type
        """
    )
    op.execute("DROP TYPE vehicle_ownership_type_old")
    op.alter_column("vehicles", "ownership_type", server_default="PROPRIO")

    driver_license_category.create(bind, checkfirst=True)
    claim_status.create(bind, checkfirst=True)
    claim_type.create(bind, checkfirst=True)

    op.create_table(
        "drivers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("nome_completo", sa.String(length=150), nullable=False),
        sa.Column("documento", sa.String(length=20), nullable=False),
        sa.Column("contato", sa.String(length=50), nullable=True),
        sa.Column("email", sa.String(length=100), nullable=True),
        sa.Column("cnh_categoria", driver_license_category, nullable=True),
        sa.Column("cnh_validade", sa.Date(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("idx_drivers_documento", "drivers", ["documento"], unique=False)
    op.create_index("idx_drivers_nome", "drivers", ["nome_completo"], unique=False)
    op.execute("CREATE INDEX idx_drivers_ativo ON drivers(ativo) WHERE ativo = TRUE")
    op.execute("CREATE UNIQUE INDEX uq_drivers_documento_active ON drivers(documento) WHERE ativo = TRUE")
    op.execute(
        "CREATE TRIGGER trg_drivers_updated_at BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
    )

    op.add_column("vehicle_possession", sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("idx_possession_driver_id", "vehicle_possession", ["driver_id"], unique=False)
    op.create_foreign_key(
        "fk_vehicle_possession_driver",
        "vehicle_possession",
        "drivers",
        ["driver_id"],
        ["id"],
        ondelete="RESTRICT",
        onupdate="CASCADE",
    )

    op.create_table(
        "claims",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("data_ocorrencia", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tipo", claim_type, nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("local", sa.String(length=200), nullable=False),
        sa.Column("boletim_ocorrencia", sa.String(length=50), nullable=True),
        sa.Column("valor_estimado", sa.Numeric(12, 2), nullable=True),
        sa.Column("status", claim_status, nullable=False, server_default="ABERTO"),
        sa.Column("justificativa_encerramento", sa.Text(), nullable=True),
        sa.Column("anexos", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint("valor_estimado >= 0", name="ck_claims_valor_estimado_non_negative"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
    )
    op.create_index("idx_claims_vehicle", "claims", ["vehicle_id"], unique=False)
    op.create_index("idx_claims_driver", "claims", ["driver_id"], unique=False)
    op.create_index("idx_claims_data", "claims", ["data_ocorrencia"], unique=False)
    op.create_index("idx_claims_status", "claims", ["status"], unique=False)
    op.execute(
        "CREATE TRIGGER trg_claims_updated_at BEFORE UPDATE ON claims FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
    )


def downgrade() -> None:
    bind = op.get_bind()

    op.execute("DROP TRIGGER IF EXISTS trg_claims_updated_at ON claims")
    op.drop_index("idx_claims_status", table_name="claims")
    op.drop_index("idx_claims_data", table_name="claims")
    op.drop_index("idx_claims_driver", table_name="claims")
    op.drop_index("idx_claims_vehicle", table_name="claims")
    op.drop_table("claims")

    op.drop_constraint("fk_vehicle_possession_driver", "vehicle_possession", type_="foreignkey")
    op.drop_index("idx_possession_driver_id", table_name="vehicle_possession")
    op.drop_column("vehicle_possession", "driver_id")

    op.execute("DROP TRIGGER IF EXISTS trg_drivers_updated_at ON drivers")
    op.execute("DROP INDEX IF EXISTS uq_drivers_documento_active")
    op.execute("DROP INDEX IF EXISTS idx_drivers_ativo")
    op.drop_index("idx_drivers_nome", table_name="drivers")
    op.drop_index("idx_drivers_documento", table_name="drivers")
    op.drop_table("drivers")

    op.execute("UPDATE vehicles SET ownership_type = 'PROPRIO' WHERE ownership_type = 'CEDIDO'")
    op.execute("ALTER TYPE vehicle_ownership_type RENAME TO vehicle_ownership_type_new")
    postgresql.ENUM("PROPRIO", "LOCADO", name="vehicle_ownership_type").create(bind, checkfirst=False)
    op.execute(
        """
        ALTER TABLE vehicles
        ALTER COLUMN ownership_type DROP DEFAULT,
        ALTER COLUMN ownership_type TYPE vehicle_ownership_type
        USING ownership_type::text::vehicle_ownership_type
        """
    )
    op.execute("DROP TYPE vehicle_ownership_type_new")
    op.alter_column("vehicles", "ownership_type", server_default="PROPRIO")

    claim_type.drop(bind, checkfirst=True)
    claim_status.drop(bind, checkfirst=True)
    driver_license_category.drop(bind, checkfirst=True)
