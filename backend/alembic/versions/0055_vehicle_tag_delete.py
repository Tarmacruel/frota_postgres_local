"""Keep historical definitions while allowing personal catalog deletion."""
from alembic import op
import sqlalchemy as sa

revision = '0055_vehicle_tag_delete'
down_revision = '0054_vehicle_tags'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('vehicle_tags', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.drop_index('uq_vehicle_tag_owner_name', table_name='vehicle_tags')
    op.create_index('uq_vehicle_tag_owner_name', 'vehicle_tags', ['owner_user_id', 'normalized_name'],
                    unique=True, postgresql_where=sa.text('deleted_at IS NULL'))


def downgrade():
    # Reconcile any reused names before downgrading; keep history intact.
    op.drop_index('uq_vehicle_tag_owner_name', table_name='vehicle_tags')
    op.create_index('uq_vehicle_tag_owner_name', 'vehicle_tags', ['owner_user_id', 'normalized_name'], unique=True)
    op.drop_column('vehicle_tags', 'deleted_at')
