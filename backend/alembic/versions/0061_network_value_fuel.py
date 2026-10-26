"""Explicit network fuel contracts, with funding policy frozen on each new order."""
from alembic import op
import sqlalchemy as sa

revision = '0061_network_value_fuel'
down_revision = '0060_station_multi_contract'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('payment_contracts', sa.Column('fuel_pricing_mode', sa.String(20), nullable=False, server_default='FIXED_PRICE'))
    op.create_check_constraint('ck_contract_fuel_pricing_mode', 'payment_contracts', "fuel_pricing_mode IN ('FIXED_PRICE', 'NETWORK_VALUE')")
    op.add_column('fuel_supply_orders', sa.Column('contract_funding_mode', sa.String(20), nullable=True))
    op.create_check_constraint('ck_order_contract_funding_mode', 'fuel_supply_orders', "contract_funding_mode IS NULL OR contract_funding_mode IN ('FIXED_PRICE', 'NETWORK_VALUE')")


def downgrade():
    network = op.get_bind().execute(sa.text("SELECT 1 FROM fuel_supply_orders WHERE contract_funding_mode = 'NETWORK_VALUE' LIMIT 1")).scalar()
    if network:
        raise RuntimeError('Há pedidos por valor sem reserva; preserve a política histórica antes de reverter o schema.')
    op.drop_constraint('ck_order_contract_funding_mode', 'fuel_supply_orders', type_='check')
    op.drop_column('fuel_supply_orders', 'contract_funding_mode')
    op.drop_constraint('ck_contract_fuel_pricing_mode', 'payment_contracts', type_='check')
    op.drop_column('payment_contracts', 'fuel_pricing_mode')
