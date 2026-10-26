"""A fuel station belongs to only one active contract, retaining historical links."""
from alembic import op
import sqlalchemy as sa

revision = '0059_station_contract_exclusive'
down_revision = '0058_fuel_price_deletion'
branch_labels = None
depends_on = None


def upgrade():
    conflict = op.get_bind().execute(sa.text('''SELECT 1 FROM contract_providers
        WHERE active AND fuel_station_id IS NOT NULL
        GROUP BY fuel_station_id HAVING count(*) > 1 LIMIT 1''')).scalar()
    if conflict:
        raise RuntimeError('Existem postos com mais de um vínculo contratual ativo. '
                           'Confira e desative os vínculos excedentes antes da migration; nenhum vínculo foi escolhido automaticamente.')
    op.create_index('uq_contract_provider_active_station', 'contract_providers', ['fuel_station_id'], unique=True,
                    postgresql_where=sa.text('fuel_station_id IS NOT NULL AND active'))


def downgrade():
    op.drop_index('uq_contract_provider_active_station', table_name='contract_providers')
