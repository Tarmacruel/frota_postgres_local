"""add possession public number, trips, destinations and return confirmations

Revision ID: 0039_possession_trips
Revises: 0038_require_user_cpf
Create Date: 2026-07-11
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0039_possession_trips"
down_revision = "0038_require_user_cpf"
branch_labels = None
depends_on = None


PUBLIC_NUMBER_SEQUENCE = "vehicle_possession_public_number_seq"


def upgrade() -> None:
    op.execute(
        f"CREATE SEQUENCE {PUBLIC_NUMBER_SEQUENCE} AS BIGINT START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1 NO CYCLE"
    )
    op.add_column("vehicle_possession", sa.Column("public_number", sa.BigInteger(), nullable=True))
    op.add_column(
        "vehicle_possession",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.execute(
        """
        WITH ordered_legacy AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    ORDER BY COALESCE(created_at, start_date), start_date, id
                )::BIGINT AS generated_number
            FROM vehicle_possession
            WHERE public_number IS NULL
        )
        UPDATE vehicle_possession AS possession
        SET public_number = ordered_legacy.generated_number
        FROM ordered_legacy
        WHERE possession.id = ordered_legacy.id
        """
    )
    op.execute(
        f"""
        SELECT setval(
            '{PUBLIC_NUMBER_SEQUENCE}',
            COALESCE((SELECT MAX(public_number) FROM vehicle_possession), 1),
            EXISTS(SELECT 1 FROM vehicle_possession)
        )
        """
    )
    op.alter_column(
        "vehicle_possession",
        "public_number",
        nullable=False,
        server_default=sa.text(f"nextval('{PUBLIC_NUMBER_SEQUENCE}'::regclass)"),
    )
    op.execute(f"ALTER SEQUENCE {PUBLIC_NUMBER_SEQUENCE} OWNED BY vehicle_possession.public_number")
    op.create_unique_constraint(
        "uq_vehicle_possession_public_number",
        "vehicle_possession",
        ["public_number"],
    )
    op.create_check_constraint(
        "ck_vehicle_possession_public_number_positive",
        "vehicle_possession",
        "public_number > 0",
    )

    op.drop_constraint("vehicle_possession_vehicle_id_fkey", "vehicle_possession", type_="foreignkey")
    op.create_foreign_key(
        "vehicle_possession_vehicle_id_fkey",
        "vehicle_possession",
        "vehicles",
        ["vehicle_id"],
        ["id"],
        ondelete="RESTRICT",
        onupdate="CASCADE",
    )
    op.execute(
        "CREATE TRIGGER trg_vehicle_possession_updated_at BEFORE UPDATE ON vehicle_possession "
        "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
    )

    op.create_table(
        "vehicle_possession_trip",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "possession_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("vehicle_possession.id", ondelete="RESTRICT", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'EM_ANDAMENTO'")),
        sa.Column("origin", sa.String(length=255), nullable=False),
        sa.Column("purpose", sa.String(length=500), nullable=False),
        sa.Column("departure_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("return_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_odometer_km", sa.Numeric(12, 1), nullable=False),
        sa.Column("end_odometer_km", sa.Numeric(12, 1), nullable=True),
        sa.Column("observation", sa.Text(), nullable=True),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "closed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "cancelled_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_reason", sa.String(length=1000), nullable=True),
        sa.UniqueConstraint("possession_id", "sequence_number", name="uq_possession_trip_sequence"),
        sa.UniqueConstraint("possession_id", "id", name="uq_possession_trip_possession_id_id"),
        sa.CheckConstraint("sequence_number > 0", name="ck_possession_trip_sequence_positive"),
        sa.CheckConstraint(
            "status IN ('EM_ANDAMENTO', 'ENCERRADA', 'CANCELADA')",
            name="ck_possession_trip_status",
        ),
        sa.CheckConstraint(
            "char_length(btrim(origin)) BETWEEN 1 AND 255",
            name="ck_possession_trip_origin_length",
        ),
        sa.CheckConstraint(
            "char_length(btrim(purpose)) BETWEEN 1 AND 500",
            name="ck_possession_trip_purpose_length",
        ),
        sa.CheckConstraint(
            "observation IS NULL OR char_length(observation) <= 2000",
            name="ck_possession_trip_observation_length",
        ),
        sa.CheckConstraint(
            "start_odometer_km >= 0",
            name="ck_possession_trip_start_odometer_nonnegative",
        ),
        sa.CheckConstraint(
            "end_odometer_km IS NULL OR end_odometer_km >= start_odometer_km",
            name="ck_possession_trip_end_odometer_order",
        ),
        sa.CheckConstraint(
            "return_at IS NULL OR return_at >= departure_at",
            name="ck_possession_trip_return_order",
        ),
        sa.CheckConstraint(
            "(status = 'EM_ANDAMENTO' AND return_at IS NULL AND end_odometer_km IS NULL "
            "AND closed_by_user_id IS NULL AND closed_at IS NULL AND cancelled_by_user_id IS NULL "
            "AND cancelled_at IS NULL AND cancellation_reason IS NULL) OR "
            "(status = 'ENCERRADA' AND return_at IS NOT NULL AND end_odometer_km IS NOT NULL "
            "AND closed_by_user_id IS NOT NULL AND closed_at IS NOT NULL AND cancelled_by_user_id IS NULL "
            "AND cancelled_at IS NULL AND cancellation_reason IS NULL) OR "
            "(status = 'CANCELADA' AND return_at IS NULL AND end_odometer_km IS NULL "
            "AND closed_by_user_id IS NULL AND closed_at IS NULL AND cancelled_by_user_id IS NOT NULL "
            "AND cancelled_at IS NOT NULL AND char_length(btrim(cancellation_reason)) BETWEEN 8 AND 1000)",
            name="ck_possession_trip_status_fields",
        ),
    )
    op.create_index("idx_possession_trip_possession", "vehicle_possession_trip", ["possession_id"])
    op.create_index("idx_possession_trip_status", "vehicle_possession_trip", ["status"])
    op.create_index("idx_possession_trip_departure", "vehicle_possession_trip", ["departure_at"])
    op.create_index("idx_possession_trip_created_by", "vehicle_possession_trip", ["created_by_user_id"])
    op.create_index(
        "uq_possession_trip_open",
        "vehicle_possession_trip",
        ["possession_id"],
        unique=True,
        postgresql_where=sa.text("status = 'EM_ANDAMENTO'"),
    )

    op.create_table(
        "vehicle_possession_trip_destination",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "trip_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("vehicle_possession_trip.id", ondelete="RESTRICT", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=False),
        sa.Column("address_reference", sa.String(length=500), nullable=True),
        sa.Column("observation", sa.Text(), nullable=True),
        sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("departed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("trip_id", "sequence_number", name="uq_possession_trip_destination_sequence"),
        sa.CheckConstraint("sequence_number > 0", name="ck_possession_trip_destination_sequence_positive"),
        sa.CheckConstraint(
            "char_length(btrim(description)) BETWEEN 1 AND 300",
            name="ck_possession_trip_destination_description_length",
        ),
        sa.CheckConstraint(
            "address_reference IS NULL OR char_length(address_reference) <= 500",
            name="ck_possession_trip_destination_address_length",
        ),
        sa.CheckConstraint(
            "observation IS NULL OR char_length(observation) <= 2000",
            name="ck_possession_trip_destination_observation_length",
        ),
        sa.CheckConstraint(
            "departed_at IS NULL OR arrived_at IS NOT NULL",
            name="ck_possession_trip_destination_departure_requires_arrival",
        ),
        sa.CheckConstraint(
            "departed_at IS NULL OR departed_at >= arrived_at",
            name="ck_possession_trip_destination_time_order",
        ),
    )
    op.create_index(
        "idx_possession_trip_destination_trip",
        "vehicle_possession_trip_destination",
        ["trip_id"],
    )
    op.create_index(
        "idx_possession_trip_destination_created_by",
        "vehicle_possession_trip_destination",
        ["created_by_user_id"],
    )

    op.create_table(
        "vehicle_possession_return_confirmation",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "possession_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("vehicle_possession.id", ondelete="RESTRICT", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("declaration_version", sa.String(length=32), nullable=False),
        sa.Column("declaration_text", sa.Text(), nullable=False),
        sa.Column("canonical_payload_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "confirmed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("confirmer_name", sa.String(length=150), nullable=False),
        sa.Column("confirmer_email", sa.String(length=255), nullable=True),
        sa.Column("confirmer_role", sa.String(length=30), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("request_id", sa.String(length=64), nullable=False),
        sa.Column("ip_address", postgresql.INET(), nullable=False),
        sa.Column("user_agent", sa.String(length=256), nullable=False),
        sa.Column("final_odometer_km", sa.Numeric(12, 1), nullable=False),
        sa.Column("vehicle_condition_notes", sa.Text(), nullable=False),
        sa.Column("last_trip_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("superseded_by_confirmation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("admin_correction_reason", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint(
            "possession_id",
            "version",
            name="uq_possession_return_confirmation_version",
        ),
        sa.UniqueConstraint(
            "possession_id",
            "id",
            name="uq_possession_return_confirmation_possession_id_id",
        ),
        sa.ForeignKeyConstraint(
            ["possession_id", "last_trip_id"],
            ["vehicle_possession_trip.possession_id", "vehicle_possession_trip.id"],
            name="fk_return_confirmation_last_trip_same_possession",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["possession_id", "superseded_by_confirmation_id"],
            [
                "vehicle_possession_return_confirmation.possession_id",
                "vehicle_possession_return_confirmation.id",
            ],
            name="fk_return_confirmation_superseded_same_possession",
            ondelete="RESTRICT",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.CheckConstraint("version > 0", name="ck_possession_return_confirmation_version_positive"),
        sa.CheckConstraint(
            "canonical_payload_hash ~ '^[0-9a-f]{64}$'",
            name="ck_possession_return_confirmation_hash",
        ),
        sa.CheckConstraint(
            "request_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$'",
            name="ck_possession_return_confirmation_request_id",
        ),
        sa.CheckConstraint(
            "final_odometer_km >= 0",
            name="ck_possession_return_confirmation_odometer_nonnegative",
        ),
        sa.CheckConstraint(
            "char_length(btrim(declaration_version)) BETWEEN 1 AND 32",
            name="ck_possession_return_confirmation_declaration_version",
        ),
        sa.CheckConstraint(
            "char_length(btrim(declaration_text)) BETWEEN 1 AND 8000",
            name="ck_possession_return_confirmation_declaration_text",
        ),
        sa.CheckConstraint(
            "char_length(btrim(vehicle_condition_notes)) BETWEEN 1 AND 4000",
            name="ck_possession_return_confirmation_condition_notes",
        ),
        sa.CheckConstraint(
            "(is_current AND superseded_at IS NULL AND superseded_by_confirmation_id IS NULL) OR "
            "(NOT is_current AND superseded_at IS NOT NULL AND superseded_by_confirmation_id IS NOT NULL "
            "AND superseded_by_confirmation_id <> id AND superseded_at >= confirmed_at)",
            name="ck_possession_return_confirmation_current_state",
        ),
        sa.CheckConstraint(
            "(version = 1 AND admin_correction_reason IS NULL) OR "
            "(version > 1 AND char_length(btrim(admin_correction_reason)) BETWEEN 8 AND 1000)",
            name="ck_possession_return_confirmation_correction_reason",
        ),
    )
    op.create_index(
        "idx_possession_return_confirmation_possession",
        "vehicle_possession_return_confirmation",
        ["possession_id"],
    )
    op.create_index(
        "idx_possession_return_confirmation_confirmed_by",
        "vehicle_possession_return_confirmation",
        ["confirmed_by_user_id"],
    )
    op.create_index(
        "idx_possession_return_confirmation_confirmed_at",
        "vehicle_possession_return_confirmation",
        ["confirmed_at"],
    )
    op.create_index(
        "uq_possession_return_confirmation_current",
        "vehicle_possession_return_confirmation",
        ["possession_id"],
        unique=True,
        postgresql_where=sa.text("is_current"),
    )

    for table_name in ("vehicle_possession_trip", "vehicle_possession_trip_destination"):
        op.execute(
            f"CREATE TRIGGER trg_{table_name}_updated_at BEFORE UPDATE ON {table_name} "
            "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
        )

    op.execute(
        """
        CREATE FUNCTION prevent_possession_domain_delete()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'hard delete disabled for %', TG_TABLE_NAME
                USING ERRCODE = 'integrity_constraint_violation';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    for table_name in (
        "vehicle_possession",
        "vehicle_possession_trip",
        "vehicle_possession_trip_destination",
        "vehicle_possession_return_confirmation",
    ):
        op.execute(
            f"CREATE TRIGGER trg_{table_name}_prevent_delete BEFORE DELETE ON {table_name} "
            "FOR EACH ROW EXECUTE FUNCTION prevent_possession_domain_delete()"
        )

    op.execute(
        """
        CREATE FUNCTION enforce_return_confirmation_append_only()
        RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.is_current IS TRUE
               AND NEW.is_current IS FALSE
               AND OLD.superseded_at IS NULL
               AND NEW.superseded_at IS NOT NULL
               AND OLD.superseded_by_confirmation_id IS NULL
               AND NEW.superseded_by_confirmation_id IS NOT NULL
               AND (
                    to_jsonb(NEW) - ARRAY['is_current', 'superseded_at', 'superseded_by_confirmation_id']
               ) = (
                    to_jsonb(OLD) - ARRAY['is_current', 'superseded_at', 'superseded_by_confirmation_id']
               )
            THEN
                RETURN NEW;
            END IF;

            RAISE EXCEPTION 'return confirmation is append-only'
                USING ERRCODE = 'integrity_constraint_violation';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        "CREATE TRIGGER trg_return_confirmation_append_only BEFORE UPDATE "
        "ON vehicle_possession_return_confirmation FOR EACH ROW "
        "EXECUTE FUNCTION enforce_return_confirmation_append_only()"
    )


def downgrade() -> None:
    bind = op.get_bind()
    for table_name in (
        "vehicle_possession_return_confirmation",
        "vehicle_possession_trip_destination",
        "vehicle_possession_trip",
    ):
        if bind.execute(sa.text(f"SELECT EXISTS(SELECT 1 FROM {table_name} LIMIT 1)")).scalar_one():
            raise RuntimeError(
                "Downgrade recusado: existem registros do novo domínio. "
                "Restaure um backup compatível em vez de apagar histórico."
            )

    op.execute(
        "DROP TRIGGER IF EXISTS trg_return_confirmation_append_only "
        "ON vehicle_possession_return_confirmation"
    )
    op.execute("DROP FUNCTION IF EXISTS enforce_return_confirmation_append_only()")

    for table_name in (
        "vehicle_possession_return_confirmation",
        "vehicle_possession_trip_destination",
        "vehicle_possession_trip",
        "vehicle_possession",
    ):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table_name}_prevent_delete ON {table_name}")
    op.execute("DROP FUNCTION IF EXISTS prevent_possession_domain_delete()")

    op.execute(
        "DROP TRIGGER IF EXISTS trg_vehicle_possession_trip_destination_updated_at "
        "ON vehicle_possession_trip_destination"
    )
    op.execute(
        "DROP TRIGGER IF EXISTS trg_vehicle_possession_trip_updated_at ON vehicle_possession_trip"
    )
    op.drop_table("vehicle_possession_return_confirmation")
    op.drop_table("vehicle_possession_trip_destination")
    op.drop_table("vehicle_possession_trip")

    op.execute("DROP TRIGGER IF EXISTS trg_vehicle_possession_updated_at ON vehicle_possession")
    op.drop_constraint("vehicle_possession_vehicle_id_fkey", "vehicle_possession", type_="foreignkey")
    op.create_foreign_key(
        "vehicle_possession_vehicle_id_fkey",
        "vehicle_possession",
        "vehicles",
        ["vehicle_id"],
        ["id"],
        ondelete="CASCADE",
        onupdate="CASCADE",
    )
    op.drop_constraint(
        "ck_vehicle_possession_public_number_positive",
        "vehicle_possession",
        type_="check",
    )
    op.drop_constraint(
        "uq_vehicle_possession_public_number",
        "vehicle_possession",
        type_="unique",
    )
    op.drop_column("vehicle_possession", "updated_at")
    op.drop_column("vehicle_possession", "public_number")
    op.execute(f"DROP SEQUENCE IF EXISTS {PUBLIC_NUMBER_SEQUENCE}")
