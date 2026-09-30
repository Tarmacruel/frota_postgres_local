"""add inter organization vehicle loan foundation

Revision ID: 0044_vehicle_loans
Revises: 0043_certificate_foundation
Create Date: 2026-09-28 09:05:35.441794
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0044_vehicle_loans'
down_revision = '0043_certificate_foundation'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('vehicle_loans',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('vehicle_id', sa.UUID(), nullable=False),
    sa.Column('origin_organization_id', sa.UUID(), nullable=False),
    sa.Column('recipient_organization_id', sa.UUID(), nullable=False),
    sa.Column('origin_allocation_id', sa.UUID(), nullable=True),
    sa.Column('destination_allocation_id', sa.UUID(), nullable=True),
    sa.Column('return_allocation_id', sa.UUID(), nullable=True),
    sa.Column('status', sa.String(length=30), server_default=sa.text("'DRAFT'"), nullable=False),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('origin_representative_id', sa.UUID(), nullable=True),
    sa.Column('recipient_representative_id', sa.UUID(), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('expected_return_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('returned_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('delivery_odometer_km', sa.Numeric(precision=12, scale=1), nullable=True),
    sa.Column('return_odometer_km', sa.Numeric(precision=12, scale=1), nullable=True),
    sa.Column('delivery_condition', sa.Text(), nullable=True),
    sa.Column('return_condition', sa.Text(), nullable=True),
    sa.Column('created_by_user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    sa.CheckConstraint("(status = 'RETURNED') = (returned_at IS NOT NULL)", name='ck_vehicle_loans_effective_return'),
    sa.CheckConstraint("status IN ('DRAFT', 'AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED', 'REJECTED', 'CANCELLED')", name='ck_vehicle_loans_status'),
    sa.CheckConstraint("status NOT IN ('ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED') OR (started_at IS NOT NULL AND delivery_odometer_km IS NOT NULL)", name='ck_vehicle_loans_effective_delivery'),
    sa.CheckConstraint('delivery_odometer_km IS NULL OR delivery_odometer_km >= 0', name='ck_vehicle_loans_delivery_km'),
    sa.CheckConstraint('expected_return_at IS NULL OR started_at IS NULL OR expected_return_at >= started_at', name='ck_vehicle_loans_expected_return'),
    sa.CheckConstraint('origin_organization_id <> recipient_organization_id', name='ck_vehicle_loans_distinct_organizations'),
    sa.CheckConstraint('return_odometer_km IS NULL OR (delivery_odometer_km IS NOT NULL AND return_odometer_km >= delivery_odometer_km)', name='ck_vehicle_loans_return_km'),
    sa.CheckConstraint('returned_at IS NULL OR (started_at IS NOT NULL AND returned_at >= started_at)', name='ck_vehicle_loans_dates'),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['destination_allocation_id'], ['master_allocations.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['origin_allocation_id'], ['master_allocations.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['origin_organization_id'], ['master_organizations.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['origin_representative_id'], ['users.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['recipient_organization_id'], ['master_organizations.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['recipient_representative_id'], ['users.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['return_allocation_id'], ['master_allocations.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_vehicle_loans_origin', 'vehicle_loans', ['origin_organization_id'], unique=False)
    op.create_index('idx_vehicle_loans_recipient', 'vehicle_loans', ['recipient_organization_id'], unique=False)
    op.create_index('idx_vehicle_loans_vehicle_dates', 'vehicle_loans', ['vehicle_id', 'started_at', 'returned_at'], unique=False)
    op.create_index('uq_vehicle_loans_in_progress', 'vehicle_loans', ['vehicle_id'], unique=True, postgresql_where=sa.text("status IN ('AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT')"), sqlite_where=sa.text("status IN ('AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT')"))
    op.create_table('vehicle_loan_events',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('loan_id', sa.UUID(), nullable=False),
    sa.Column('event_type', sa.String(length=30), nullable=False),
    sa.Column('actor_user_id', sa.UUID(), nullable=False),
    sa.Column('represented_organization_id', sa.UUID(), nullable=False),
    sa.Column('effective_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('justification', sa.Text(), nullable=True),
    sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    sa.CheckConstraint("event_type IN ('CREATED', 'SUBMITTED', 'RECEIPT_ACCEPTED', 'REJECTED', 'CANCELLED', 'RETURN_SUBMITTED', 'RETURN_ACCEPTED', 'RETURN_REJECTED', 'RECTIFIED', 'REGULARIZED')", name='ck_vehicle_loan_events_type'),
    sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['loan_id'], ['vehicle_loans.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['represented_organization_id'], ['master_organizations.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_vehicle_loan_events_loan_date', 'vehicle_loan_events', ['loan_id', 'created_at'], unique=False)
    op.add_column('claims', sa.Column('responsible_organization_id', sa.UUID(), nullable=True))
    op.add_column('claims', sa.Column('vehicle_loan_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_claims_responsible_organization_id'), 'claims', ['responsible_organization_id'], unique=False)
    op.create_index(op.f('ix_claims_vehicle_loan_id'), 'claims', ['vehicle_loan_id'], unique=False)
    op.create_foreign_key('fk_claims_vehicle_loan_id', 'claims', 'vehicle_loans', ['vehicle_loan_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key('fk_claims_responsible_organization_id', 'claims', 'master_organizations', ['responsible_organization_id'], ['id'], ondelete='RESTRICT')
    op.add_column('fines', sa.Column('responsible_organization_id', sa.UUID(), nullable=True))
    op.add_column('fines', sa.Column('vehicle_loan_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_fines_responsible_organization_id'), 'fines', ['responsible_organization_id'], unique=False)
    op.create_index(op.f('ix_fines_vehicle_loan_id'), 'fines', ['vehicle_loan_id'], unique=False)
    op.create_foreign_key('fk_fines_vehicle_loan_id', 'fines', 'vehicle_loans', ['vehicle_loan_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key('fk_fines_responsible_organization_id', 'fines', 'master_organizations', ['responsible_organization_id'], ['id'], ondelete='RESTRICT')
    op.add_column('fuel_supplies', sa.Column('vehicle_loan_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_fuel_supplies_vehicle_loan_id'), 'fuel_supplies', ['vehicle_loan_id'], unique=False)
    op.create_foreign_key('fk_fuel_supplies_vehicle_loan_id', 'fuel_supplies', 'vehicle_loans', ['vehicle_loan_id'], ['id'], ondelete='RESTRICT')
    op.add_column('fuel_supply_orders', sa.Column('vehicle_loan_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_fuel_supply_orders_vehicle_loan_id'), 'fuel_supply_orders', ['vehicle_loan_id'], unique=False)
    op.create_foreign_key('fk_fuel_supply_orders_vehicle_loan_id', 'fuel_supply_orders', 'vehicle_loans', ['vehicle_loan_id'], ['id'], ondelete='RESTRICT')
    op.add_column('maintenance_records', sa.Column('responsible_organization_id', sa.UUID(), nullable=True))
    op.add_column('maintenance_records', sa.Column('vehicle_loan_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_maintenance_records_responsible_organization_id'), 'maintenance_records', ['responsible_organization_id'], unique=False)
    op.create_index(op.f('ix_maintenance_records_vehicle_loan_id'), 'maintenance_records', ['vehicle_loan_id'], unique=False)
    op.create_foreign_key('fk_maintenance_records_vehicle_loan_id', 'maintenance_records', 'vehicle_loans', ['vehicle_loan_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key('fk_maintenance_records_responsible_organization_id', 'maintenance_records', 'master_organizations', ['responsible_organization_id'], ['id'], ondelete='RESTRICT')
    op.add_column('vehicle_possession', sa.Column('responsible_organization_id', sa.UUID(), nullable=True))
    op.add_column('vehicle_possession', sa.Column('vehicle_loan_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_vehicle_possession_responsible_organization_id'), 'vehicle_possession', ['responsible_organization_id'], unique=False)
    op.create_index(op.f('ix_vehicle_possession_vehicle_loan_id'), 'vehicle_possession', ['vehicle_loan_id'], unique=False)
    op.create_foreign_key('fk_vehicle_possession_responsible_organization_id', 'vehicle_possession', 'master_organizations', ['responsible_organization_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key('fk_vehicle_possession_vehicle_loan_id', 'vehicle_possession', 'vehicle_loans', ['vehicle_loan_id'], ['id'], ondelete='RESTRICT')
    op.add_column('vehicles', sa.Column('owner_organization_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_vehicles_owner_organization_id'), 'vehicles', ['owner_organization_id'], unique=False)
    op.create_foreign_key('fk_vehicles_owner_organization_id', 'vehicles', 'master_organizations', ['owner_organization_id'], ['id'], ondelete='RESTRICT')
    # Only unambiguous active structured locations establish the initial owner.
    op.execute('''
        WITH active_owner AS (
            SELECT h.vehicle_id, (array_agg(d.organization_id))[1] AS organization_id
            FROM location_history h
            JOIN master_allocations a ON a.id = h.allocation_id
            JOIN master_departments d ON d.id = a.department_id
            WHERE h.end_date IS NULL
            GROUP BY h.vehicle_id
            HAVING count(DISTINCT d.organization_id) = 1
        )
        UPDATE vehicles v SET owner_organization_id = a.organization_id
        FROM active_owner a WHERE a.vehicle_id = v.id
    ''')
    op.execute('''
        CREATE FUNCTION prevent_vehicle_loan_event_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Loan events are append-only; record a corrective event';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER vehicle_loan_events_append_only
        BEFORE UPDATE OR DELETE ON vehicle_loan_events
        FOR EACH ROW EXECUTE FUNCTION prevent_vehicle_loan_event_mutation();
    ''')


def downgrade() -> None:
    # Once loans/attributions exist, reverting application code must preserve data.
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT EXISTS (SELECT 1 FROM vehicle_loans)")).scalar():
        raise RuntimeError('Cannot downgrade recorded loans; use a compatible forward migration.')
    for table in ('claims', 'fines', 'fuel_supplies', 'fuel_supply_orders', 'maintenance_records', 'vehicle_possession'):
        if connection.execute(sa.text(f'SELECT EXISTS (SELECT 1 FROM {table} WHERE vehicle_loan_id IS NOT NULL)')).scalar():
            raise RuntimeError('Cannot downgrade attributed operational history.')
    for table in ('claims', 'fines', 'maintenance_records', 'vehicle_possession'):
        if connection.execute(sa.text(f'SELECT EXISTS (SELECT 1 FROM {table} WHERE responsible_organization_id IS NOT NULL)')).scalar():
            raise RuntimeError('Cannot downgrade attributed operational history.')
    op.execute('DROP FUNCTION prevent_vehicle_loan_event_mutation() CASCADE')
    op.drop_constraint('fk_vehicles_owner_organization_id', 'vehicles', type_='foreignkey')
    op.drop_index(op.f('ix_vehicles_owner_organization_id'), table_name='vehicles')
    op.drop_column('vehicles', 'owner_organization_id')
    op.drop_constraint('fk_vehicle_possession_vehicle_loan_id', 'vehicle_possession', type_='foreignkey')
    op.drop_constraint('fk_vehicle_possession_responsible_organization_id', 'vehicle_possession', type_='foreignkey')
    op.drop_index(op.f('ix_vehicle_possession_vehicle_loan_id'), table_name='vehicle_possession')
    op.drop_index(op.f('ix_vehicle_possession_responsible_organization_id'), table_name='vehicle_possession')
    op.drop_column('vehicle_possession', 'vehicle_loan_id')
    op.drop_column('vehicle_possession', 'responsible_organization_id')
    op.drop_constraint('fk_maintenance_records_responsible_organization_id', 'maintenance_records', type_='foreignkey')
    op.drop_constraint('fk_maintenance_records_vehicle_loan_id', 'maintenance_records', type_='foreignkey')
    op.drop_index(op.f('ix_maintenance_records_vehicle_loan_id'), table_name='maintenance_records')
    op.drop_index(op.f('ix_maintenance_records_responsible_organization_id'), table_name='maintenance_records')
    op.drop_column('maintenance_records', 'vehicle_loan_id')
    op.drop_column('maintenance_records', 'responsible_organization_id')
    op.drop_constraint('fk_fuel_supply_orders_vehicle_loan_id', 'fuel_supply_orders', type_='foreignkey')
    op.drop_index(op.f('ix_fuel_supply_orders_vehicle_loan_id'), table_name='fuel_supply_orders')
    op.drop_column('fuel_supply_orders', 'vehicle_loan_id')
    op.drop_constraint('fk_fuel_supplies_vehicle_loan_id', 'fuel_supplies', type_='foreignkey')
    op.drop_index(op.f('ix_fuel_supplies_vehicle_loan_id'), table_name='fuel_supplies')
    op.drop_column('fuel_supplies', 'vehicle_loan_id')
    op.drop_constraint('fk_fines_responsible_organization_id', 'fines', type_='foreignkey')
    op.drop_constraint('fk_fines_vehicle_loan_id', 'fines', type_='foreignkey')
    op.drop_index(op.f('ix_fines_vehicle_loan_id'), table_name='fines')
    op.drop_index(op.f('ix_fines_responsible_organization_id'), table_name='fines')
    op.drop_column('fines', 'vehicle_loan_id')
    op.drop_column('fines', 'responsible_organization_id')
    op.drop_constraint('fk_claims_responsible_organization_id', 'claims', type_='foreignkey')
    op.drop_constraint('fk_claims_vehicle_loan_id', 'claims', type_='foreignkey')
    op.drop_index(op.f('ix_claims_vehicle_loan_id'), table_name='claims')
    op.drop_index(op.f('ix_claims_responsible_organization_id'), table_name='claims')
    op.drop_column('claims', 'vehicle_loan_id')
    op.drop_column('claims', 'responsible_organization_id')
    op.drop_index('idx_vehicle_loan_events_loan_date', table_name='vehicle_loan_events')
    op.drop_table('vehicle_loan_events')
    op.drop_index('uq_vehicle_loans_in_progress', table_name='vehicle_loans', postgresql_where=sa.text("status IN ('AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT')"), sqlite_where=sa.text("status IN ('AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT')"))
    op.drop_index('idx_vehicle_loans_vehicle_dates', table_name='vehicle_loans')
    op.drop_index('idx_vehicle_loans_recipient', table_name='vehicle_loans')
    op.drop_index('idx_vehicle_loans_origin', table_name='vehicle_loans')
    op.drop_table('vehicle_loans')
