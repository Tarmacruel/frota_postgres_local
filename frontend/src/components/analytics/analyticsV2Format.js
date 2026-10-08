const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export function numeric(value) { return value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value) }
export function formatValue(value, unit = '') {
  const n = numeric(value)
  if (n === null) return 'Não disponível'
  if (unit === 'BRL' || unit === 'BRL/km') return currency.format(n) + (unit === 'BRL/km' ? '/km' : '')
  return `${number.format(n)}${unit ? ` ${unit}` : ''}`
}
export function formatDate(value) { return value ? value.split('-').reverse().join('/') : '—' }
export function deltaText(comparison, unit = '') {
  const delta = numeric(comparison?.delta)
  if (delta === null) return 'Comparação indisponível'
  if (delta === 0) return 'Sem variação no período'
  const percent = numeric(comparison?.delta_percent)
  return `${delta > 0 ? '+' : '−'}${formatValue(Math.abs(delta), unit)}${percent === null ? ' · sem base percentual' : ` (${delta > 0 ? '+' : '−'}${number.format(Math.abs(percent))}%)`}`
}
export function closedPeriod(days = 30, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type) => parts.find((item) => item.type === type).value
  const today = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`)
  const end = new Date(today.getTime() - 86400000)
  const start = new Date(end.getTime() - (days - 1) * 86400000)
  return { date_from: start.toISOString().slice(0, 10), date_to: end.toISOString().slice(0, 10) }
}
