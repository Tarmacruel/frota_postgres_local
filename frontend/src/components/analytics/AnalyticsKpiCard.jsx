export default function AnalyticsKpiCard({ label, value, note, icon, tone = 'neutral', loading = false, onClick }) {
  const Component = onClick ? 'button' : 'article'
  return (
    <Component type={onClick ? 'button' : undefined} onClick={onClick} disabled={onClick ? loading : undefined} className={`analytics-foundation-kpi analytics-foundation-kpi--${tone}${onClick ? ' analytics-kpi-interactive' : ''}`} aria-busy={loading}>
      <div>
        <span className="analytics-foundation-kpi__label">{label}</span>
        <strong className="analytics-foundation-kpi__value">{loading ? '—' : (value ?? '—')}</strong>
        <span className="analytics-foundation-kpi__note">{loading ? 'Carregando…' : note}</span>
        {onClick ? <span className="analytics-foundation-kpi__note">Ver composição →</span> : null}
      </div>
      {icon ? <span className="analytics-foundation-kpi__icon" aria-hidden="true">{icon}</span> : null}
    </Component>
  )
}
