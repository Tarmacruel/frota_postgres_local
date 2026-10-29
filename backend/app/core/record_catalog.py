"""Administrative editing never accepts table names or arbitrary SQL from clients."""
from dataclasses import dataclass


@dataclass(frozen=True)
class RecordModule:
    model: type
    label: str
    search: tuple[str, ...]
    editable: tuple[str, ...]
    route: str
    permission: str


def record_modules():
    from app.models.user import User
    from app.models.vehicle import Vehicle
    from app.models.driver import Driver
    from app.models.possession import VehiclePossession
    from app.models.vehicle_loan import VehicleLoan
    from app.models.claim import Claim
    from app.models.fine import Fine
    from app.models.maintenance import MaintenanceRecord
    from app.models.fuel_supply import FuelSupply
    from app.models.fuel_supply_order import FuelSupplyOrder
    from app.models.payment_process import PaymentContract, PaymentProcess, PaymentSupplier
    from app.models.contract_balance import MaintenanceOrder
    from app.models.fuel_station import FuelStation
    return {
        'users': RecordModule(User, 'Usuários', ('name', 'email'), ('name', 'email', 'organization_id'), '/api/users', 'users'),
        'vehicles': RecordModule(Vehicle, 'Veículos', ('plate', 'brand', 'model', 'chassis_number'),
            ('plate', 'chassis_number', 'brand', 'model', 'year', 'prefix', 'patrimonio_numero_frota', 'color',
             'fuel_type', 'tank_capacity_liters', 'renavam', 'transmission', 'city', 'state', 'registered_detran', 'engine_spec'),
            '/api/vehicles', 'vehicles'),
        'drivers': RecordModule(Driver, 'Condutores', ('nome_completo', 'documento', 'matricula'),
            ('nome_completo', 'documento', 'matricula', 'registro', 'cargo', 'contato', 'email', 'cnh_numero',
             'cnh_categoria', 'cnh_validade', 'rg', 'data_nascimento', 'data_emissao_cnh', 'organization_id', 'ativo'),
            '/api/drivers', 'drivers'),
        'possession': RecordModule(VehiclePossession, 'Posses', ('driver_name', 'observation'),
            ('driver_name', 'driver_document', 'driver_contact', 'observation'), '/api/possession', 'possession'),
        'vehicle_loans': RecordModule(VehicleLoan, 'Empréstimos', ('reason', 'delivery_condition', 'return_condition'),
            ('reason', 'delivery_condition', 'return_condition', 'expected_return_at'), '/api/vehicle-loans', 'vehicle_loans'),
        'claims': RecordModule(Claim, 'Sinistros', ('descricao', 'local', 'boletim_ocorrencia'),
            ('descricao', 'local', 'boletim_ocorrencia', 'valor_estimado', 'justificativa_encerramento'), '/api/claims', 'claims'),
        'fines': RecordModule(Fine, 'Multas', ('ticket_number', 'description', 'location', 'notes'),
            ('ticket_number', 'description', 'location', 'notes', 'driver_name', 'driver_document', 'driver_contact'), '/api/fines', 'fines'),
        'maintenance': RecordModule(MaintenanceRecord, 'Manutenções', ('service_description', 'parts_replaced'),
            ('service_description', 'parts_replaced'), '/api/maintenance', 'maintenance'),
        'fuel_supplies': RecordModule(FuelSupply, 'Abastecimentos', ('notes',), ('notes',), '/api/fuel-supplies', 'fuel_supplies'),
        'fuel_supply_orders': RecordModule(FuelSupplyOrder, 'Ordens de abastecimento', ('order_code', 'notes'),
            ('notes',), '/api/fuel-supply-orders', 'fuel_supply_orders'),
        'maintenance_orders': RecordModule(MaintenanceOrder, 'Pedidos de manutenção', ('service_description',),
            ('service_description',), '/api/maintenance-orders', 'maintenance'),
        'contracts': RecordModule(PaymentContract, 'Contratos', ('number', 'object_description'),
            ('object_description',), '/api/payment-contracts', 'payment_processes'),
        'payment_processes': RecordModule(PaymentProcess, 'Processos de pagamento', ('process_number', 'invoice_number', 'notes'),
            ('process_number', 'invoice_number', 'billing_number', 'notes', 'location', 'responsible_name'),
            '/api/payment-processes', 'payment_processes'),
        'suppliers': RecordModule(PaymentSupplier, 'Prestadores', ('name', 'trade_name', 'cnpj'),
            ('name', 'trade_name', 'cnpj'), '/api/payment-suppliers', 'payment_processes'),
        'fuel_stations': RecordModule(FuelStation, 'Postos', ('name', 'address', 'phone'),
            ('name', 'address', 'phone'), '/api/fuel-stations', 'fuel_stations'),
    }
