"""Retain removed fuel prices for reservation history and audit."""
from alembic import op
import sqlalchemy as sa

revision = '0058_fuel_price_deletion'
down_revision = '0057_funding_request_keys'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('contract_fuel_prices', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('contract_fuel_prices', 'deleted_at')
