export function formatIndicator(value, unit = 'count') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  if (unit === 'BRL') return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: unit === 'L' ? 2 : 0 })}${unit === 'L' ? ' L' : ''}`
}
