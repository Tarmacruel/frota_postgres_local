"""Store scanned printed loan terms separately from digital signature artifacts."""
from alembic import op
import sqlalchemy as sa

revision = '0051_vehicle_loan_printed_terms'
down_revision = '0050_vehicle_prime_card'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('vehicle_loan_printed_terms',
        sa.Column('id', sa.Uuid(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('loan_id', sa.Uuid(), sa.ForeignKey('vehicle_loans.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('original_filename', sa.String(255), nullable=False),
        sa.Column('storage_path', sa.String(500), nullable=False, unique=True),
        sa.Column('mime_type', sa.String(50), nullable=False),
        sa.Column('size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('sha256', sa.String(64), nullable=False),
        sa.Column('uploaded_by_user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.CheckConstraint('size_bytes > 0', name='ck_vehicle_loan_printed_terms_size'))
    op.create_index('idx_vehicle_loan_printed_terms_loan', 'vehicle_loan_printed_terms', ['loan_id'])


def downgrade():
    op.drop_index('idx_vehicle_loan_printed_terms_loan', table_name='vehicle_loan_printed_terms')
    op.drop_table('vehicle_loan_printed_terms')
