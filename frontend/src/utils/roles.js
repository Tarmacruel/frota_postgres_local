export const ROLE_LABELS = {
  SUPERUSER: 'Superusuário',
  ADMIN: 'Administrador',
  PRODUCAO: 'Produção',
  POSTO: 'Posto',
  PADRAO: 'Padrão',
}

export function isAdmin(role) {
  return role === 'ADMIN' || role === 'SUPERUSER'
}

export function isSuperUser(role) { return role === 'SUPERUSER' }
export function isOrganizationScoped(role) { return ['ADMIN', 'PRODUCAO', 'PADRAO'].includes(role) }

export function isPosto(role) {
  return role === 'POSTO'
}

export function canWrite(role) {
  return isAdmin(role) || role === 'PRODUCAO'
}

export function canDelete(role) {
  return isAdmin(role)
}

export function canManageCadastros(role) {
  return isAdmin(role) || role === 'PRODUCAO'
}

export function canAccessFuelSupplies(role) {
  return isAdmin(role) || role === 'PRODUCAO'
}

export function canManageFuelSupplyOrders(role) {
  return isAdmin(role) || role === 'PRODUCAO'
}

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role || 'Sem perfil'
}

export function isFuelStation(role) {
  return role === 'POSTO'
}

export function canConfirmFuelOrders(role) {
  return role === 'POSTO'
}
