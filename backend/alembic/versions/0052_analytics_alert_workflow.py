"""Empty analytical workflow tables; no backfill or operational flag changes."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0052_analytics_alert_workflow'
down_revision = '0051_vehicle_loan_printed_terms'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('analytics_alert_cases',
        sa.Column('id', sa.Uuid(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('fingerprint', sa.String(64), nullable=False, unique=True),
        sa.Column('fingerprint_version', sa.SmallInteger(), nullable=False, server_default='1'),
        sa.Column('source_type', sa.String(40), nullable=False),
        sa.Column('source_id', sa.Uuid(), nullable=False),
        sa.Column('rule_key', sa.String(40), nullable=False),
        sa.Column('rule_version', sa.String(40), nullable=False),
        sa.Column('vehicle_id', sa.Uuid()), sa.Column('driver_id', sa.Uuid()),
        sa.Column('organization_id', sa.Uuid()),
        sa.Column('severity', sa.String(12), nullable=False),
        sa.Column('status', sa.String(12), nullable=False),
        sa.Column('first_detected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_detected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_evaluated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('evaluation_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('latest_evidence', JSONB(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.CheckConstraint("status IN ('NEW','IN_REVIEW','RESOLVED','IGNORED')", name='ck_alert_status'),
        sa.CheckConstraint("severity IN ('LOW','MEDIUM','HIGH')", name='ck_alert_severity'),
        sa.CheckConstraint("source_type = 'fuel_supply' AND rule_key IN ('capacity','odometer','close','consumption','price')", name='ck_alert_source_rule'),
        sa.CheckConstraint('version >= 1 AND evaluation_count >= 1 AND fingerprint_version = 1', name='ck_alert_counters'))
    op.create_index('ix_alert_scope_queue', 'analytics_alert_cases', ['organization_id', 'status', 'last_detected_at', 'id'])
    op.create_index('ix_alert_source', 'analytics_alert_cases', ['source_type', 'source_id'])
    op.create_table('analytics_alert_events',
        sa.Column('id', sa.Uuid(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('case_id', sa.Uuid(), sa.ForeignKey('analytics_alert_cases.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('event_type', sa.String(24), nullable=False),
        sa.Column('from_status', sa.String(12)), sa.Column('to_status', sa.String(12)),
        sa.Column('actor_user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('actor_label', sa.String(150), nullable=False), sa.Column('reason', sa.Text()),
        sa.Column('rule_version', sa.String(40), nullable=False),
        sa.Column('evidence', JSONB(), nullable=False),
        sa.Column('evaluation_context', JSONB(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.CheckConstraint("event_type IN ('DETECTED','REEVALUATED','STATUS_CHANGED')", name='ck_alert_event_type'),
        sa.CheckConstraint("(event_type = 'STATUS_CHANGED' AND from_status IS NOT NULL AND to_status IS NOT NULL AND ((from_status IN ('NEW','IN_REVIEW') AND to_status IN ('RESOLVED','IGNORED')) OR (from_status IN ('NEW','RESOLVED','IGNORED') AND to_status = 'IN_REVIEW'))) OR (event_type IN ('DETECTED','REEVALUATED') AND from_status IS NULL AND to_status IS NULL)", name='ck_alert_event_shape'),
        sa.CheckConstraint("event_type <> 'STATUS_CHANGED' OR (to_status = 'IN_REVIEW' AND from_status = 'NEW') OR (reason IS NOT NULL AND length(trim(reason)) > 0)", name='ck_alert_event_reason'))
    op.create_index('ix_alert_event_timeline', 'analytics_alert_events', ['case_id', 'created_at', 'id'])
    op.create_table('analytics_alert_requests',
        sa.Column('id', sa.Uuid(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('actor_user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('operation', sa.String(24), nullable=False),
        sa.Column('idempotency_key', sa.String(80), nullable=False),
        sa.Column('request_hash', sa.String(64), nullable=False),
        sa.Column('response_json', JSONB(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.CheckConstraint("operation IN ('RECONCILE','STATUS_CHANGE')", name='ck_alert_request_operation'))
    op.create_index('uq_alert_request_key', 'analytics_alert_requests', ['actor_user_id', 'operation', 'idempotency_key'], unique=True)
    op.create_index('ix_alert_request_created', 'analytics_alert_requests', ['created_at'])
    # A trigger protects history even when the application role owns DML grants.
    # The sole FK-maintenance exception is anonymizing a removed user's ID.
    op.execute("""CREATE FUNCTION analytics_alert_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
         AND (to_jsonb(OLD) - 'actor_user_id') = (to_jsonb(NEW) - 'actor_user_id') THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Analytics alert history is immutable' USING ERRCODE = '23514';
    END; $$""")
    op.execute("CREATE TRIGGER analytics_alert_history_guard BEFORE UPDATE OR DELETE ON analytics_alert_events FOR EACH ROW EXECUTE FUNCTION analytics_alert_history_immutable()")
    op.execute("""DO $$ DECLARE permission record; BEGIN
      FOR permission IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_schema = current_schema() AND table_name = 'analytics_alert_events'
          AND privilege_type IN ('UPDATE','DELETE') AND grantee <> current_user
      LOOP
        IF permission.grantee = 'PUBLIC' THEN REVOKE UPDATE, DELETE ON analytics_alert_events FROM PUBLIC;
        ELSE EXECUTE format('REVOKE UPDATE, DELETE ON analytics_alert_events FROM %I', permission.grantee); END IF;
      END LOOP;
    END $$""")


def downgrade():
    op.drop_table('analytics_alert_requests')
    op.drop_table('analytics_alert_events')
    op.execute('DROP FUNCTION analytics_alert_history_immutable()')
    op.drop_table('analytics_alert_cases')
