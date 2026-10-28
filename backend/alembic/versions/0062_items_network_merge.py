"""Preserve daily-refresh compatibility with the separately developed network-value schema.

No financial backfill, mode selection, or operating-rule changes occur in this merge.
"""
revision = '0062_items_network_merge'
down_revision = ('0061_items_station_merge', '0061_network_value_fuel')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
