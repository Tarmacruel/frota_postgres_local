export const PERMISSION_MODULES = [
  { key: 'vehicles', label: 'Veículos' },
  { key: 'possession', label: 'Posses' },
  { key: 'drivers', label: 'Condutores' },
  { key: 'maintenance', label: 'Manutenções' },
  { key: 'claims', label: 'Sinistros' },
  { key: 'fines', label: 'Multas' },
  { key: 'master_data', label: 'Cadastros' },
  { key: 'fuel_supplies', label: 'Abastecimentos' },
  { key: 'fuel_supply_orders', label: 'Ordens de abastecimento' },
  { key: 'fuel_stations', label: 'Postos' },
  { key: 'payment_processes', label: 'Processos de pagamento' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'data_imports', label: 'Importação/Exportação' },
]

export const PERMISSION_ACTIONS = [
  { key: 'view', field: 'can_view', label: 'Visualizar' },
  { key: 'create', field: 'can_create', label: 'Criar' },
  { key: 'edit', field: 'can_edit', label: 'Editar' },
  { key: 'delete', field: 'can_delete', label: 'Excluir' },
]

const EMPTY_FLAGS = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
}

export function normalizePermissions(permissions = {}) {
  return PERMISSION_MODULES.reduce((acc, module) => {
    const flags = permissions?.[module.key] || EMPTY_FLAGS
    acc[module.key] = {
      can_view: Boolean(flags.can_view),
      can_create: Boolean(flags.can_create),
      can_edit: Boolean(flags.can_edit),
      can_delete: Boolean(flags.can_delete),
    }
    return acc
  }, {})
}

export function hasPermission(user, module, action = 'view') {
  const field = action.startsWith('can_') ? action : `can_${action}`
  return Boolean(user?.permissions?.[module]?.[field])
}
