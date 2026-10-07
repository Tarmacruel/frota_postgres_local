"""Optional Prime fuel card on vehicle registration."""
from alembic import op
import sqlalchemy as sa

revision = "0050_vehicle_prime_card"
down_revision = "0049_justification_suggestions"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("vehicles", sa.Column("prime_card_number", sa.String(16), nullable=True))


def downgrade():
    op.drop_column("vehicles", "prime_card_number")
