"""Contract items, typed amendments and append-only quantity ledger. No historical backfill."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = '0060_contract_items'
down_revision = '0059_station_contract_exclusive'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('contract_operations', sa.Column('item_revision', sa.Integer(), nullable=False, server_default='0'))
    for name, typ in [('instrument_type', sa.String(30)), ('change_types', pg.JSONB()),
        ('effective_date', sa.Date()), ('document_reference', sa.String(255)),
        ('price_financial_delta', sa.Numeric(16, 2)), ('request_key', pg.UUID()),
        ('request_fingerprint', sa.String(64)), ('snapshot', pg.JSONB()),
        ('attachment', pg.JSONB()), ('corrects_amendment_id', pg.UUID())]:
        op.add_column('payment_contract_amendments', sa.Column(name, typ, nullable=True))
    op.create_index('uq_payment_amendment_request_key', 'payment_contract_amendments', ['request_key'], unique=True)
    ddl = '''
CREATE TABLE contract_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_id uuid NOT NULL REFERENCES payment_contracts(id) ON DELETE RESTRICT,
 code varchar(80) NOT NULL, original_number varchar(80) NOT NULL, description varchar(500) NOT NULL,
 category varchar(30) NOT NULL, unit varchar(30) NOT NULL, product_key varchar(80), group_key varchar(80),
 original_quantity numeric(18,3) NOT NULL, original_unit_price numeric(14,6) NOT NULL, reference_unit_price numeric(14,6) NOT NULL,
 historical_added_quantity numeric(18,3), opening_quantity numeric(18,3), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_contract_item_code UNIQUE(contract_id,code),
 CONSTRAINT ck_contract_item_base_positive CHECK(original_quantity>0 AND original_unit_price>0 AND reference_unit_price>0));
CREATE INDEX ix_contract_items_contract_id ON contract_items(contract_id);
CREATE TABLE contract_quantity_controls (
 contract_id uuid PRIMARY KEY REFERENCES payment_contracts(id) ON DELETE RESTRICT,
 adjudication varchar(10) NOT NULL, justification text NOT NULL, document_reference varchar(255) NOT NULL,
 request_key uuid NOT NULL UNIQUE, request_fingerprint varchar(64) NOT NULL,
 opened_at timestamptz NOT NULL DEFAULT now(), opened_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT);
CREATE TABLE contract_item_prices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES contract_items(id) ON DELETE RESTRICT,
 provider_id uuid NOT NULL REFERENCES contract_providers(id) ON DELETE RESTRICT, unit_price numeric(14,6) NOT NULL CHECK(unit_price>0),
 valid_from timestamptz NOT NULL, valid_until timestamptz,
 fuel_price_id uuid REFERENCES contract_fuel_prices(id) ON DELETE RESTRICT,
 amendment_id uuid REFERENCES payment_contract_amendments(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT);
CREATE INDEX idx_item_price_lookup ON contract_item_prices(item_id,provider_id,valid_from);
CREATE TABLE contract_reservation_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid NOT NULL REFERENCES contract_reservations(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES contract_items(id) ON DELETE RESTRICT, quantity numeric(18,3) NOT NULL CHECK(quantity>=0),
 unit_price numeric(14,6) NOT NULL, price_id uuid REFERENCES contract_item_prices(id) ON DELETE RESTRICT,
 CONSTRAINT uq_reservation_item UNIQUE(reservation_id,item_id));
CREATE INDEX ix_contract_reservation_items_reservation_id ON contract_reservation_items(reservation_id);
CREATE TABLE contract_operation_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES contract_operations(id) ON DELETE RESTRICT,
 item_id uuid REFERENCES contract_items(id) ON DELETE RESTRICT, description varchar(500) NOT NULL, category varchar(30) NOT NULL,
 quantity numeric(18,3) NOT NULL, unit_price numeric(14,6) NOT NULL, amount numeric(16,2) NOT NULL, revision integer NOT NULL DEFAULT 0);
CREATE INDEX ix_contract_operation_items_operation_id ON contract_operation_items(operation_id);
CREATE TABLE contract_item_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_id uuid NOT NULL REFERENCES payment_contracts(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES contract_items(id) ON DELETE RESTRICT, event_key varchar(200) NOT NULL UNIQUE,
 movement_type varchar(40) NOT NULL, quantity_delta numeric(18,3) NOT NULL DEFAULT 0, reserved_delta numeric(18,3) NOT NULL DEFAULT 0,
 source_id uuid, details jsonb, actor_id uuid REFERENCES users(id) ON DELETE RESTRICT, occurred_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_item_movement_contract ON contract_item_movements(contract_id,occurred_at);
CREATE INDEX ix_contract_item_movements_item_id ON contract_item_movements(item_id);
CREATE TABLE contract_amendment_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amendment_id uuid NOT NULL REFERENCES payment_contract_amendments(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES contract_items(id) ON DELETE RESTRICT, document_number varchar(80),
 quantity_delta numeric(18,3) NOT NULL DEFAULT 0, value_delta numeric(16,2) NOT NULL DEFAULT 0, snapshot jsonb NOT NULL);
CREATE INDEX ix_contract_amendment_items_amendment_id ON contract_amendment_items(amendment_id);
CREATE FUNCTION contract_item_movements_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Quantity ledger is append-only; record an adjustment or reversal'; END; $$;
CREATE TRIGGER contract_item_movements_immutable BEFORE UPDATE OR DELETE ON contract_item_movements
 FOR EACH ROW EXECUTE FUNCTION contract_item_movements_immutable();
'''
    schema, routines = ddl.split('CREATE FUNCTION', 1)
    for statement in schema.split(';'):
        if statement.strip():
            op.execute(statement)
    function, trigger = routines.split('CREATE TRIGGER', 1)
    op.execute('CREATE FUNCTION'+function)
    op.execute('CREATE TRIGGER'+trigger)


def downgrade():
    # Destructive recovery must be a separately reviewed operation, not an automatic deploy step.
    raise RuntimeError('Preserve financial history: disable the feature and restore code; do not downgrade quantity records')
