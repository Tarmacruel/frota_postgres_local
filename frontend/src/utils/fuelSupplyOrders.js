const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export const ORDER_STATUS_LABELS = {
  OPEN: 'Aberta',
  COMPLETED: 'Concluida',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
}

export function formatOrderNumber(order) {
  if (order?.request_number) return order.request_number
  return `AB-${String(order?.id || '').slice(0, 8).toUpperCase()}`
}

export function getOrderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status || '-'
}

export function getOrderStatusClass(status) {
  if (status === 'OPEN') return 'status-PRODUCAO'
  if (status === 'COMPLETED') return 'status-ATIVO'
  if (status === 'EXPIRED') return 'status-INATIVO'
  if (status === 'CANCELLED') return 'status-INATIVO'
  return 'status-INATIVO'
}

export function formatCurrencyBRL(value) {
  if (value === null || value === undefined || value === '') return '-'
  return currencyFormatter.format(Number(value || 0))
}

export function formatCurrencyInput(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return currencyFormatter.format(Number(digits) / 100)
}

export function parseCurrencyInput(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return null
  return Number(digits) / 100
}

export function formatCnpjInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 14)
  if (!digits) return ''
  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

export function resolvePublicValidationUrl(path) {
  if (!path) return ''
  if (typeof window === 'undefined') return path
  return new URL(path, window.location.origin).toString()
}
