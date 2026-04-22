export const ROLE_LABELS = {
  ADMIN: 'Administrador',
  PRODUCAO: 'Producao',
  PADRAO: 'Padrao',
  POSTO: 'Posto',
}

export function isAdmin(role) {
  return role === 'ADMIN'
}

export function canWrite(role) {
  return role === 'ADMIN' || role === 'PRODUCAO'
}

export function canDelete(role) {
  return role === 'ADMIN'
}

export function canManageCadastros(role) {
  return role === 'ADMIN' || role === 'PRODUCAO'
}

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role || 'Sem perfil'
}


export function isFuelStation(role) {
  return role === 'POSTO'
}

export function canAccessFuelSupplies(role) {
  return role === 'ADMIN' || role === 'PRODUCAO' || role === 'POSTO'
}

export function canConfirmFuelOrders(role) {
  return role === 'ADMIN' || role === 'POSTO'
}
