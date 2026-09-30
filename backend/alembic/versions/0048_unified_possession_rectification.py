"""Versioned, immutable evidence for unified possession corrections."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0048_possession_rectification'
down_revision = '0047_loan_regularization'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('vehicle_possession', sa.Column('revision', sa.Integer(), nullable=False, server_default='1'))
    op.create_table('possession_revisions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('possession_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('vehicle_possession.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('actor_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('actor_name', sa.String(150), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('before', postgresql.JSONB(), nullable=False),
        sa.Column('after', postgresql.JSONB(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')))
    op.create_index('uq_possession_revision', 'possession_revisions', ['possession_id', 'version'], unique=True)
    op.execute("""
    CREATE FUNCTION preserve_possession_revision() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Possession correction evidence is immutable'; END $$;
    CREATE TRIGGER preserve_possession_revision BEFORE UPDATE OR DELETE ON possession_revisions
        FOR EACH ROW EXECUTE FUNCTION preserve_possession_revision();
    """)


def downgrade():
    if op.get_bind().execute(sa.text('SELECT EXISTS(SELECT 1 FROM possession_revisions)')).scalar():
        raise RuntimeError('Preserve possession correction evidence; use a forward migration.')
    op.drop_table('possession_revisions')
    op.execute('DROP FUNCTION preserve_possession_revision()')
    op.drop_column('vehicle_possession', 'revision')
