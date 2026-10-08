export default function AnalyticsKpiCard({ label, value, note, icon, tone = 'neutral', loading = false }) {
  return (
    <article className={`analytics-foundation-kpi analytics-foundation-kpi--${tone}`} aria-busy={loading}>
      <div>
        <span className="analytics-foundation-kpi__label">{label}</span>
        <strong className="analytics-foundation-kpi__value">{loading ? '—' : (value ?? '—')}</strong>
        <span className="analytics-foundation-kpi__note">{loading ? 'Carregando…' : note}</span>
      </div>
      {icon ? <span className="analytics-foundation-kpi__icon" aria-hidden="true">{icon}</span> : null}
    </article>
  )
}
