"""Version proposals and identify each handoff submitter.

Revision ID: 0045_loan_workflow
Revises: 0044_vehicle_loans
"""
from alembic import op
import sqlalchemy as sa

revision = '0045_loan_workflow'
down_revision = '0044_vehicle_loans'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint('ck_vehicle_loan_events_type', 'vehicle_loan_events', type_='check')
    op.create_check_constraint('ck_vehicle_loan_events_type', 'vehicle_loan_events',
        "event_type IN ('CREATED', 'SUBMITTED', 'RECEIPT_ACCEPTED', 'REJECTED', 'CANCELLED', 'RETURN_SUBMITTED', 'RETURN_ACCEPTED', 'RETURN_REJECTED', 'RETURN_CANCELLED', 'RECTIFIED', 'REGULARIZED')")
    op.add_column('vehicle_loans', sa.Column('version', sa.Integer(), nullable=False, server_default=sa.text('1')))
    for name in ('submitted_by_user_id', 'return_submitted_by_user_id'):
        op.add_column('vehicle_loans', sa.Column(name, sa.UUID(), nullable=True))
        op.create_foreign_key(f'fk_vehicle_loans_{name}', 'vehicle_loans', 'users', [name], ['id'], ondelete='RESTRICT')


def downgrade():
    if op.get_bind().execute(sa.text('SELECT EXISTS(SELECT 1 FROM vehicle_loans)')).scalar():
        raise RuntimeError('Workflow already in use; preserve handoff evidence with a forward migration.')
    op.drop_constraint('ck_vehicle_loan_events_type', 'vehicle_loan_events', type_='check')
    op.create_check_constraint('ck_vehicle_loan_events_type', 'vehicle_loan_events',
        "event_type IN ('CREATED', 'SUBMITTED', 'RECEIPT_ACCEPTED', 'REJECTED', 'CANCELLED', 'RETURN_SUBMITTED', 'RETURN_ACCEPTED', 'RETURN_REJECTED', 'RECTIFIED', 'REGULARIZED')")
    for name in ('return_submitted_by_user_id', 'submitted_by_user_id'):
        op.drop_constraint(f'fk_vehicle_loans_{name}', 'vehicle_loans', type_='foreignkey')
        op.drop_column('vehicle_loans', name)
    op.drop_column('vehicle_loans', 'version')
