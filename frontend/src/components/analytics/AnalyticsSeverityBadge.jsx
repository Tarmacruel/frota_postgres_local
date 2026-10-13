const LABELS = { CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Médio', LOW: 'Baixo', INFO: 'Informativo' }

export default function AnalyticsSeverityBadge({ severity = 'INFO' }) {
  const key = String(severity).toUpperCase()
  const normalized = Object.hasOwn(LABELS, key) ? key : 'INFO'
  return <span className={`analytics-severity analytics-severity--${normalized.toLowerCase()}`}>{LABELS[normalized]}</span>
}
