"""Personal tags with shared scoped vehicle assignments."""
from alembic import op
import sqlalchemy as sa
revision = '0054_vehicle_tags'
down_revision = '0053_possession_return_photos'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('vehicle_tags',
        sa.Column('id', sa.Uuid(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('owner_user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('owner_name', sa.String(150), nullable=False),
        sa.Column('name', sa.String(40), nullable=False),
        sa.Column('normalized_name', sa.String(80), nullable=False),
        sa.Column('color', sa.String(20), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')))
    op.create_index('ix_vehicle_tags_owner_user_id', 'vehicle_tags', ['owner_user_id'])
    op.create_index('uq_vehicle_tag_owner_name', 'vehicle_tags', ['owner_user_id', 'normalized_name'], unique=True)
    op.create_table('vehicle_tag_assignments',
        sa.Column('id', sa.Uuid(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('vehicle_id', sa.Uuid(), sa.ForeignKey('vehicles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tag_id', sa.Uuid(), sa.ForeignKey('vehicle_tags.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('applied_by_user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('applied_by_name', sa.String(150), nullable=False),
        sa.Column('note', sa.String(500)),
        sa.Column('applied_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('removed_at', sa.DateTime(timezone=True)),
        sa.Column('removed_by_user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('removal_reason', sa.String(500)))
    op.create_index('ix_vehicle_tag_assignments_vehicle_id', 'vehicle_tag_assignments', ['vehicle_id'])
    op.create_index('idx_vehicle_tag_assignment_tag', 'vehicle_tag_assignments', ['tag_id', 'removed_at'])
    op.create_index('uq_vehicle_tag_active', 'vehicle_tag_assignments', ['vehicle_id', 'tag_id'], unique=True,
                    postgresql_where=sa.text('removed_at IS NULL'))


def downgrade():
    op.drop_table('vehicle_tag_assignments')
    op.drop_table('vehicle_tags')
