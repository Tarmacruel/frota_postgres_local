const DAY_MS = 86400000

function calendarDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? timestamp : null
}

export function getCnhDaysLeft(value, now = new Date()) {
  const expiry = calendarDay(value)
  if (expiry === null) return null
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((expiry - today) / DAY_MS)
}

export function formatCnhDate(value) {
  if (calendarDay(value) === null) return 'Não informada'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export function getCnhIssues(driver, now = new Date()) {
  if (!driver) return []
  const issues = []
  if (!String(driver.cnh_numero || '').trim()) issues.push({ code: 'missing_number', label: 'Número da CNH não informado', tone: 'warning' })
  const days = getCnhDaysLeft(driver.cnh_validade, now)
  if (days === null) issues.push({ code: 'missing_expiry', label: 'Validade da CNH não informada', tone: 'warning' })
  else if (days < 0) issues.push({ code: 'expired', label: 'CNH vencida', detail: `Vencimento em ${formatCnhDate(driver.cnh_validade)}`, tone: 'danger' })
  return issues
}

export function getCnhAlert(driver, now = new Date()) {
  const issues = getCnhIssues(driver, now)
  const days = getCnhDaysLeft(driver?.cnh_validade, now)
  if (days !== null && days >= 0 && days <= 60) return [...issues, { code: 'expiring', label: days === 0 ? 'Vence hoje' : `Vence em ${days} dias`, tone: days <= 30 ? 'danger' : 'warning' }]
  return issues
}
