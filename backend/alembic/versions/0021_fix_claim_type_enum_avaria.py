"""fix claim type enum avaria

Revision ID: 0021_fix_claim_type_avaria
Revises: 0020_fix_fuel_stations_schema
Create Date: 2026-04-24
"""

from alembic import op
import sqlalchemy as sa


revision = "0021_fix_claim_type_avaria"
down_revision = "0020_fix_fuel_stations_schema"
branch_labels = None
depends_on = None


def _enum_labels(enum_name: str) -> set[str]:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT e.enumlabel
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = :enum_name
            """
        ),
        {"enum_name": enum_name},
    ).fetchall()
    return {row[0] for row in rows}


def upgrade() -> None:
    labels = _enum_labels("claim_type")
    if "AVERIA" in labels and "AVARIA" not in labels:
        op.execute("ALTER TYPE claim_type RENAME VALUE 'AVERIA' TO 'AVARIA'")


def downgrade() -> None:
    labels = _enum_labels("claim_type")
    if "AVARIA" in labels and "AVERIA" not in labels:
        op.execute("ALTER TYPE claim_type RENAME VALUE 'AVARIA' TO 'AVERIA'")
