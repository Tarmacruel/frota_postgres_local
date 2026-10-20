"""Identify return evidence without changing historical photos or confirmations."""
from alembic import op
import sqlalchemy as sa

revision = '0053_possession_return_photos'
down_revision = '0052_analytics_alert_workflow'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('vehicle_possession_photos', sa.Column('evidence_stage', sa.String(20), nullable=False, server_default='unspecified'))
    op.add_column('vehicle_possession_photos', sa.Column('return_confirmation_id', sa.Uuid(), nullable=True))
    op.add_column('vehicle_possession_photos', sa.Column('return_confirmation_version', sa.Integer(), nullable=True))
    op.add_column('vehicle_possession_photos', sa.Column('uploaded_by_user_id', sa.Uuid(), nullable=True))
    op.add_column('vehicle_possession_photos', sa.Column('content_sha256', sa.String(64), nullable=True))
    op.create_foreign_key('fk_possession_photo_return_confirmation', 'vehicle_possession_photos', 'vehicle_possession_return_confirmation', ['return_confirmation_id'], ['id'])
    op.create_foreign_key('fk_possession_photo_uploader', 'vehicle_possession_photos', 'users', ['uploaded_by_user_id'], ['id'])
    op.create_index('idx_possession_photo_return_confirmation', 'vehicle_possession_photos', ['return_confirmation_id'])


def downgrade():
    op.drop_index('idx_possession_photo_return_confirmation', table_name='vehicle_possession_photos')
    op.drop_constraint('fk_possession_photo_uploader', 'vehicle_possession_photos', type_='foreignkey')
    op.drop_constraint('fk_possession_photo_return_confirmation', 'vehicle_possession_photos', type_='foreignkey')
    for name in ('content_sha256', 'uploaded_by_user_id', 'return_confirmation_version', 'return_confirmation_id', 'evidence_stage'):
        op.drop_column('vehicle_possession_photos', name)
