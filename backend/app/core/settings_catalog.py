"""Versioned product choices. Settings contain data, never executable markup."""
from copy import deepcopy

DEFAULT_SETTINGS = {
    'identity': {
        'municipality': 'Prefeitura Municipal de Teixeira de Freitas',
        'city': 'Teixeira de Freitas', 'state': 'BA', 'systemName': 'Frota PMTF',
        'subtitle': 'Sistema oficial de gestão da frota municipal',
        'administrationSecretariat': 'Secretaria Municipal de Administração',
        'fleetDepartment': 'Setor de Frotas', 'logoPath': '/brasao-pmtf.png',
        'addressLine': 'Avenida Marechal Castelo Branco, 145 - Centro, Teixeira de Freitas - BA, CEP 45995-041',
        'cnpj': '13.650.403/0001-28',
    },
    'appearance': {'primary': '#2452e8', 'sidebar': '#071426', 'density': 'comfortable'},
    'icons': {}, 'forms': {},
}
ICON_KEYS = ('home', 'fleet', 'loans', 'keys', 'driver', 'wrench', 'incident', 'ticket',
             'fuel', 'orders', 'registry', 'station', 'contract', 'chart', 'transfer', 'access', 'audit', 'settings')
NAVIGATION = {'home': 'Início', 'fleet': 'Veículos', 'loans': 'Empréstimos', 'keys': 'Posses',
              'driver': 'Condutores', 'wrench': 'Manutenções', 'incident': 'Sinistros', 'ticket': 'Multas',
              'fuel': 'Abastecimentos', 'registry': 'Cadastros', 'station': 'Postos', 'contract': 'Contratos e saldos',
              'chart': 'Análises', 'transfer': 'Importar/Exportar', 'access': 'Usuários', 'audit': 'Auditoria'}
# field key, caption, required by the original API. Conditional requirements in a form also remain protected.
FORM_FIELDS = {
    'vehicles': [('plate', 'Placa', True), ('chassi', 'Número do chassi', False), ('prime_card_number', 'Número do cartão Prime', False),
                 ('brand', 'Marca', True), ('model', 'Modelo', True)],
    'drivers': [('nome_completo', 'Nome completo', True), ('documento', 'Documento', True), ('matricula', 'Matrícula', True),
                ('registro', 'Registro', False), ('cargo', 'Cargo', False), ('contato', 'Contato', False), ('email', 'E-mail', False),
                ('cnh_numero', 'Número da CNH', False), ('cnh_validade', 'Validade da CNH', False), ('rg', 'RG', False),
                ('data_nascimento', 'Data de nascimento', False)],
    'possession': [('driver_name', 'Nome do condutor', True), ('driver_document', 'Documento do condutor', False),
                   ('driver_contact', 'Contato do condutor', False), ('observation', 'Observação', False)],
    'vehicle_loans': [('reason', 'Motivo do empréstimo', True), ('delivery_condition', 'Condições de entrega', False),
                      ('return_condition', 'Condições de devolução', False)],
    'claims': [('descricao', 'Descrição', True), ('local', 'Local', True), ('boletim_ocorrencia', 'Boletim de ocorrência', False),
               ('justificativa_encerramento', 'Justificativa de encerramento', False)],
    'fines': [('description', 'Descrição', False), ('location', 'Local', False), ('notes', 'Observações', False)],
    'maintenance': [('service_description', 'Serviço', True), ('parts_description', 'Peças', False)],
    'fuel_supplies': [('notes', 'Observações', False)],
    'payment_processes': [('process_number', 'Número do processo', True), ('invoice_number', 'Número da NF', False),
                          ('billing_number', 'Número da fatura', False), ('notes', 'Notas', False), ('location', 'Localização', False)],
}


def merged_settings(values=None):
    result = deepcopy(DEFAULT_SETTINGS)
    for section, content in (values or {}).items():
        if section in result and isinstance(content, dict):
            result[section].update(content)
    return result
