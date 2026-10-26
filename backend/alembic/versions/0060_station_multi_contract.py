"""Allow a station in several contracts, keeping uniqueness within each contract."""
from alembic import op
import sqlalchemy as sa

revision = '0060_station_multi_contract'
down_revision = '0059_station_contract_exclusive'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index('uq_contract_provider_active_station', table_name='contract_providers')


def downgrade():
    conflict = op.get_bind().execute(sa.text('''SELECT 1 FROM contract_providers
        WHERE active AND fuel_station_id IS NOT NULL
        GROUP BY fuel_station_id HAVING count(*) > 1 LIMIT 1''')).scalar()
    if conflict:
        raise RuntimeError('Há postos vinculados a vários contratos. Confira os vínculos antes de restaurar a exclusividade.')
    op.create_index('uq_contract_provider_active_station', 'contract_providers', ['fuel_station_id'], unique=True,
                    postgresql_where=sa.text('fuel_station_id IS NOT NULL AND active'))
