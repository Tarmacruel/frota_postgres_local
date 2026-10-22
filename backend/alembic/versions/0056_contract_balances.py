"""Explicit contract commitments, executed operations and immutable ledger.

No legacy contract is opened and no historical operation is linked by this migration.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0056_contract_balances'
down_revision = '0055_vehicle_tag_delete'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('CREATE TABLE contract_controls (\n\tcontract_id UUID NOT NULL, \n\topening_balance NUMERIC(16, 2) NOT NULL, \n\topening_date DATE NOT NULL, \n\topened_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\topened_by UUID NOT NULL, \n\tjustification TEXT NOT NULL, \n\tdivergence_open BOOLEAN DEFAULT false NOT NULL, \n\tdivergence_note TEXT, \n\tPRIMARY KEY (contract_id), \n\tFOREIGN KEY(contract_id) REFERENCES payment_contracts (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(opened_by) REFERENCES users (id) ON DELETE RESTRICT\n)')
    op.execute('CREATE TABLE contract_providers (\n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcontract_id UUID NOT NULL, \n\tsupplier_id UUID NOT NULL, \n\tfuel_station_id UUID, \n\tactive BOOLEAN DEFAULT true NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(contract_id) REFERENCES payment_contracts (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(supplier_id) REFERENCES payment_suppliers (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(fuel_station_id) REFERENCES fuel_stations (id) ON DELETE RESTRICT\n)')
    op.execute('CREATE INDEX ix_contract_providers_contract_id ON contract_providers (contract_id)')
    op.execute('CREATE UNIQUE INDEX uq_contract_provider_station ON contract_providers (contract_id, fuel_station_id) WHERE fuel_station_id IS NOT NULL')
    op.execute('CREATE UNIQUE INDEX uq_contract_provider_workshop ON contract_providers (contract_id, supplier_id) WHERE fuel_station_id IS NULL')
    op.execute('CREATE TABLE contract_fuel_prices (\n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tprovider_id UUID NOT NULL, \n\tfuel_type VARCHAR(80) NOT NULL, \n\tunit_price NUMERIC(14, 6) NOT NULL, \n\tvalid_from TIMESTAMP WITH TIME ZONE NOT NULL, \n\tvalid_until TIMESTAMP WITH TIME ZONE, \n\tcreated_by UUID NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT ck_contract_price_positive CHECK (unit_price > 0), \n\tFOREIGN KEY(provider_id) REFERENCES contract_providers (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(created_by) REFERENCES users (id) ON DELETE RESTRICT\n)')
    op.execute('CREATE INDEX idx_contract_price_lookup ON contract_fuel_prices (provider_id, fuel_type, valid_from)')
    op.execute('CREATE TABLE contract_reservations (\n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcontract_id UUID NOT NULL, \n\tprovider_id UUID NOT NULL, \n\tsource_type VARCHAR(30) NOT NULL, \n\tsource_id UUID NOT NULL, \n\tstatus VARCHAR(20) NOT NULL, \n\tgeneration INTEGER NOT NULL, \n\tamount NUMERIC(16, 2) NOT NULL, \n\tprice_id UUID, \n\tunit_price NUMERIC(14, 6), \n\tfuel_type VARCHAR(80), \n\tliters NUMERIC(12, 3), \n\tvehicle_id UUID NOT NULL, \n\torganization_id UUID, \n\tcreated_by UUID NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tfinished_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_contract_reservation_source UNIQUE (source_type, source_id), \n\tCONSTRAINT ck_contract_reservation_positive CHECK (amount > 0), \n\tFOREIGN KEY(contract_id) REFERENCES payment_contracts (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(provider_id) REFERENCES contract_providers (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(price_id) REFERENCES contract_fuel_prices (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(vehicle_id) REFERENCES vehicles (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(organization_id) REFERENCES master_organizations (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(created_by) REFERENCES users (id) ON DELETE RESTRICT\n)')
    op.execute('CREATE INDEX ix_contract_reservations_contract_id ON contract_reservations (contract_id)')
    op.execute('CREATE INDEX ix_contract_reservations_organization_id ON contract_reservations (organization_id)')
    op.execute('CREATE INDEX ix_contract_reservations_status ON contract_reservations (status)')
    op.execute('CREATE TABLE contract_operations (\n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcontract_id UUID NOT NULL, \n\tprovider_id UUID, \n\treservation_id UUID, \n\tsource_type VARCHAR(30) NOT NULL, \n\tsource_id UUID NOT NULL, \n\tamount NUMERIC(16, 2) NOT NULL, \n\toccurred_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tvehicle_id UUID, \n\torganization_id UUID, \n\tinvoice_process_id UUID, \n\trevision INTEGER NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_contract_operation_source UNIQUE (source_type, source_id), \n\tCONSTRAINT ck_contract_operation_nonnegative CHECK (amount >= 0), \n\tFOREIGN KEY(contract_id) REFERENCES payment_contracts (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(provider_id) REFERENCES contract_providers (id) ON DELETE RESTRICT, \n\tUNIQUE (reservation_id), \n\tFOREIGN KEY(reservation_id) REFERENCES contract_reservations (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(vehicle_id) REFERENCES vehicles (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(organization_id) REFERENCES master_organizations (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(invoice_process_id) REFERENCES payment_processes (id) ON DELETE RESTRICT\n)')
    op.execute('CREATE INDEX ix_contract_operations_contract_id ON contract_operations (contract_id)')
    op.execute('CREATE INDEX ix_contract_operations_invoice_process_id ON contract_operations (invoice_process_id)')
    op.execute('CREATE INDEX ix_contract_operations_organization_id ON contract_operations (organization_id)')
    op.execute('CREATE TABLE contract_movements (\n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcontract_id UUID NOT NULL, \n\tevent_key VARCHAR(220) NOT NULL, \n\tmovement_type VARCHAR(35) NOT NULL, \n\tbalance_delta NUMERIC(16, 2) NOT NULL, \n\treserved_delta NUMERIC(16, 2) NOT NULL, \n\tconsumed_delta NUMERIC(16, 2) NOT NULL, \n\treservation_id UUID, \n\toperation_id UUID, \n\tsource_type VARCHAR(30) NOT NULL, \n\tsource_id UUID, \n\tvehicle_id UUID, \n\torganization_id UUID, \n\tprovider_id UUID, \n\tactor_id UUID, \n\tjustification TEXT, \n\tdetails JSON, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(contract_id) REFERENCES payment_contracts (id) ON DELETE RESTRICT, \n\tUNIQUE (event_key), \n\tFOREIGN KEY(reservation_id) REFERENCES contract_reservations (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(operation_id) REFERENCES contract_operations (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(vehicle_id) REFERENCES vehicles (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(organization_id) REFERENCES master_organizations (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(provider_id) REFERENCES contract_providers (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE RESTRICT\n)')
    op.execute('CREATE INDEX idx_contract_movement_contract_date ON contract_movements (contract_id, created_at)')
    op.execute('CREATE INDEX ix_contract_movements_organization_id ON contract_movements (organization_id)')
    op.execute('CREATE TABLE contract_reconciliations (\n\tprocess_id UUID NOT NULL, \n\tcontract_id UUID NOT NULL, \n\tinvoice_amount NUMERIC(16, 2) NOT NULL, \n\toperation_amount NUMERIC(16, 2) NOT NULL, \n\tdifference NUMERIC(16, 2) NOT NULL, \n\tjustification TEXT, \n\trevision INTEGER NOT NULL, \n\tactor_id UUID NOT NULL, \n\treconciled_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (process_id), \n\tFOREIGN KEY(process_id) REFERENCES payment_processes (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(contract_id) REFERENCES payment_contracts (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE RESTRICT\n)')
    op.execute('CREATE TABLE maintenance_orders (\n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcontract_id UUID NOT NULL, \n\tprovider_id UUID NOT NULL, \n\treservation_id UUID, \n\tvehicle_id UUID NOT NULL, \n\tstatus VARCHAR(20) NOT NULL, \n\tservice_description TEXT NOT NULL, \n\testimated_cost NUMERIC(16, 2) NOT NULL, \n\trequest_key UUID NOT NULL, \n\tmaintenance_record_id UUID, \n\tcreated_by UUID NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tcancellation_reason TEXT, \n\tresponsible_organization_id UUID, \n\tvehicle_loan_id UUID, \n\tPRIMARY KEY (id), \n\tCONSTRAINT ck_maintenance_order_estimate CHECK (estimated_cost > 0), \n\tFOREIGN KEY(contract_id) REFERENCES payment_contracts (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(provider_id) REFERENCES contract_providers (id) ON DELETE RESTRICT, \n\tUNIQUE (reservation_id), \n\tFOREIGN KEY(reservation_id) REFERENCES contract_reservations (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(vehicle_id) REFERENCES vehicles (id) ON DELETE RESTRICT, \n\tUNIQUE (request_key), \n\tUNIQUE (maintenance_record_id), \n\tFOREIGN KEY(maintenance_record_id) REFERENCES maintenance_records (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(created_by) REFERENCES users (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(responsible_organization_id) REFERENCES master_organizations (id) ON DELETE RESTRICT, \n\tFOREIGN KEY(vehicle_loan_id) REFERENCES vehicle_loans (id) ON DELETE RESTRICT\n)')
    op.execute('CREATE INDEX ix_maintenance_orders_contract_id ON maintenance_orders (contract_id)')
    op.execute('CREATE INDEX ix_maintenance_orders_responsible_organization_id ON maintenance_orders (responsible_organization_id)')
    op.execute('CREATE INDEX ix_maintenance_orders_status ON maintenance_orders (status)')
    op.execute('CREATE INDEX ix_maintenance_orders_vehicle_id ON maintenance_orders (vehicle_id)')
    op.execute('CREATE INDEX ix_maintenance_orders_vehicle_loan_id ON maintenance_orders (vehicle_loan_id)')
    for table in ('fuel_supply_orders', 'fuel_supplies', 'maintenance_records'):
        for name, target in [('contract_id', 'payment_contracts'), ('contract_provider_id', 'contract_providers'), ('contract_reservation_id', 'contract_reservations')]:
            op.add_column(table, sa.Column(name, postgresql.UUID(as_uuid=True), nullable=True))
            op.create_foreign_key('fk_' + table + '_' + name, table, target, [name], ['id'], ondelete='RESTRICT')
        op.create_index('ix_' + table + '_contract_id', table, ['contract_id'])
    op.add_column('fuel_supply_orders', sa.Column('requested_fuel_type', sa.String(80), nullable=True))
    op.add_column('fuel_supply_orders', sa.Column('request_key', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_unique_constraint('uq_fuel_order_request_key', 'fuel_supply_orders', ['request_key'])
    op.execute("""CREATE FUNCTION contract_movements_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Contract ledger is append-only; record an adjustment or reversal'; END; $$""")
    op.execute('CREATE TRIGGER contract_movements_immutable BEFORE UPDATE OR DELETE ON contract_movements FOR EACH ROW EXECUTE FUNCTION contract_movements_immutable()')


def downgrade():
    op.execute('DROP TRIGGER contract_movements_immutable ON contract_movements')
    op.execute('DROP FUNCTION contract_movements_immutable()')
    op.drop_constraint('uq_fuel_order_request_key', 'fuel_supply_orders', type_='unique')
    op.drop_column('fuel_supply_orders', 'request_key')
    op.drop_column('fuel_supply_orders', 'requested_fuel_type')
    for table in ('fuel_supply_orders', 'fuel_supplies', 'maintenance_records'):
        op.drop_index('ix_' + table + '_contract_id', table_name=table)
        for name in ('contract_reservation_id', 'contract_provider_id', 'contract_id'):
            op.drop_constraint('fk_' + table + '_' + name, table, type_='foreignkey')
            op.drop_column(table, name)
    for table in ('maintenance_orders', 'contract_reconciliations', 'contract_movements', 'contract_operations', 'contract_reservations', 'contract_fuel_prices', 'contract_providers', 'contract_controls'):
        op.drop_table(table)
