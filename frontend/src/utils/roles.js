export const ROLE_LABELS = {
  ADMIN: 'Administrador',
  PRODUCAO: 'Producao',
  PADRAO: 'Padrao',
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

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role || 'Sem perfil'
}
