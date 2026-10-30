"""Separate global role, versioned settings and reversible record visibility."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = '0063_superuser_settings'
down_revision = '0062_items_network_merge'
branch_labels = None
depends_on = None


def upgrade():
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPERUSER'")
    op.create_table('system_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('values', pg.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('updated_by', pg.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')))
    op.create_table('record_controls',
        sa.Column('module', sa.String(40), primary_key=True),
        sa.Column('record_id', pg.UUID(as_uuid=True), primary_key=True),
        sa.Column('inactive', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('custom_fields', pg.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('lifecycle_effects', pg.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('reason', sa.String(1000)),
        sa.Column('updated_by', pg.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')))
    op.create_index('ix_record_controls_inactive', 'record_controls', ['inactive'])
    op.add_column('audit_logs', sa.Column('organization_id', pg.UUID(as_uuid=True),
                                        sa.ForeignKey('master_organizations.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_audit_logs_organization_id', 'audit_logs', ['organization_id'])
    op.add_column('data_import_batches', sa.Column('organization_id', pg.UUID(as_uuid=True),
        sa.ForeignKey('master_organizations.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_data_import_batches_organization_id', 'data_import_batches', ['organization_id'])


def downgrade():
    # Enum intentionally retained. No downgrade may silently erase the audit trail.
    database = op.get_bind().execute(sa.text('SELECT current_database()')).scalar()
    if not database.startswith('loan_migration_'):
        raise RuntimeError('Use o rollback HML preparado; esta migration preserva configurações e histórico administrativo.')
    op.drop_column('data_import_batches', 'organization_id')
    op.drop_column('audit_logs', 'organization_id')
    op.drop_table('record_controls')
    op.drop_table('system_settings')
