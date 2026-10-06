"""Preserve the content and identity of effective vehicle-loan terms."""
from alembic import op
import sqlalchemy as sa

revision = '0046_loan_terms'
down_revision = '0045_loan_workflow'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index('uq_vehicle_loan_term_source', 'digital_documents', ['source_id', 'document_type'], unique=True,
                    postgresql_where=sa.text("source_type = 'VEHICLE_LOAN'"))
    op.execute("""
        CREATE FUNCTION preserve_vehicle_loan_term() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.source_type = 'VEHICLE_LOAN' THEN
                IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Vehicle loan terms cannot be deleted';
                END IF;
                IF ROW(OLD.source_type, OLD.source_id, OLD.document_type, OLD.snapshot, OLD.content_hash,
                       OLD.evidence_hmac, OLD.organization_id, OLD.title, OLD.created_by_user_id, OLD.created_at,
                       OLD.required_signatures)
                   IS DISTINCT FROM
                   ROW(NEW.source_type, NEW.source_id, NEW.document_type, NEW.snapshot, NEW.content_hash,
                       NEW.evidence_hmac, NEW.organization_id, NEW.title, NEW.created_by_user_id, NEW.created_at,
                       NEW.required_signatures) THEN
                    RAISE EXCEPTION 'Vehicle loan term content is immutable';
                END IF;
            END IF;
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER preserve_vehicle_loan_term BEFORE UPDATE OR DELETE ON digital_documents
            FOR EACH ROW EXECUTE FUNCTION preserve_vehicle_loan_term();
    """)


def downgrade():
    if op.get_bind().execute(sa.text("SELECT EXISTS(SELECT 1 FROM digital_documents WHERE source_type='VEHICLE_LOAN')")).scalar():
        raise RuntimeError('Preserve issued loan terms; use a forward migration.')
    op.execute('DROP TRIGGER preserve_vehicle_loan_term ON digital_documents')
    op.execute('DROP FUNCTION preserve_vehicle_loan_term()')
    op.drop_index('uq_vehicle_loan_term_source', table_name='digital_documents')
