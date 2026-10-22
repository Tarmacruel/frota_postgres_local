"""Persist idempotency identities for fuel batches and direct records."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0057_funding_request_keys'
down_revision = '0056_contract_balances'
branch_labels = None
depends_on = None


def upgrade():
    # A development copy may already have these optional identities. Verify and
    # retain them while a fresh restore follows the complete migration chain.
    inspector = sa.inspect(op.get_bind())
    for table, name in [('fuel_supply_orders', 'batch_request_key'), ('fuel_supplies', 'request_key')]:
        columns = {c['name']: c for c in inspector.get_columns(table)}
        if name not in columns:
            op.add_column(table, sa.Column(name, postgresql.UUID(as_uuid=True), nullable=True))
        elif not isinstance(columns[name]['type'], postgresql.UUID):
            raise RuntimeError('Unexpected type for financial request identity')
    if 'ix_fuel_supply_orders_batch_request_key' not in {i['name'] for i in inspector.get_indexes('fuel_supply_orders')}:
        op.create_index('ix_fuel_supply_orders_batch_request_key', 'fuel_supply_orders', ['batch_request_key'])
    if 'uq_fuel_supply_request_key' not in {c['name'] for c in inspector.get_unique_constraints('fuel_supplies')}:
        op.create_unique_constraint('uq_fuel_supply_request_key', 'fuel_supplies', ['request_key'])


def downgrade():
    op.drop_constraint('uq_fuel_supply_request_key', 'fuel_supplies', type_='unique')
    op.drop_column('fuel_supplies', 'request_key')
    op.drop_index('ix_fuel_supply_orders_batch_request_key', table_name='fuel_supply_orders')
    op.drop_column('fuel_supply_orders', 'batch_request_key')
