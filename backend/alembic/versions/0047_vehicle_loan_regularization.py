"""Administrative historical registration with effective-period integrity."""
from alembic import op
import sqlalchemy as sa

revision = '0047_loan_regularization'
down_revision = '0046_loan_terms'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('vehicle_loans', sa.Column('regularized_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('vehicle_loans', sa.Column('regularization_reference', sa.Text(), nullable=True))
    op.execute("""
    CREATE FUNCTION check_vehicle_loan_period() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        IF NEW.status IN ('ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED') AND NEW.started_at IS NOT NULL THEN
            PERFORM id FROM vehicles WHERE id=NEW.vehicle_id FOR UPDATE;
            IF EXISTS (SELECT 1 FROM vehicle_loans other WHERE other.vehicle_id=NEW.vehicle_id
                AND other.id<>NEW.id AND other.status IN ('ACTIVE','AWAITING_RETURN_RECEIPT','RETURNED')
                AND other.started_at IS NOT NULL
                AND (NEW.returned_at IS NULL OR other.started_at<NEW.returned_at)
                AND (other.returned_at IS NULL OR other.returned_at>NEW.started_at)) THEN
                RAISE EXCEPTION 'Overlapping effective loan periods' USING ERRCODE='23514';
            END IF;
        END IF;
        RETURN NEW;
    END $$;
    CREATE TRIGGER check_vehicle_loan_period BEFORE INSERT OR UPDATE ON vehicle_loans
        FOR EACH ROW EXECUTE FUNCTION check_vehicle_loan_period();
    """)


def downgrade():
    if op.get_bind().execute(sa.text('SELECT EXISTS(SELECT 1 FROM vehicle_loans WHERE regularized_at IS NOT NULL)')).scalar():
        raise RuntimeError('Preserve administrative regularization evidence; use a forward migration.')
    op.execute('DROP TRIGGER check_vehicle_loan_period ON vehicle_loans')
    op.execute('DROP FUNCTION check_vehicle_loan_period()')
    op.drop_column('vehicle_loans', 'regularization_reference')
    op.drop_column('vehicle_loans', 'regularized_at')
