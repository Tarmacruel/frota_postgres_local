import { AppIcon } from '../AppIcon'

export default function StatCard({ icon, label, value, note, tone = 'info', loading = false }) {
  return (
    <article className="ui-stat-card" data-tone={tone} aria-label={label} aria-busy={loading}>
      <span className="ui-stat-card__icon" aria-hidden="true">
        {icon ? <AppIcon name={icon} className="app-icon" /> : null}
      </span>
      <div className="ui-stat-card__content">
        <strong className="ui-stat-card__value" aria-label={loading ? 'Carregando' : undefined}>{loading ? '—' : value}</strong>
        <span className="ui-stat-card__label">{label}</span>
        {note ? <span className="ui-stat-card__note">{note}</span> : null}
      </div>
    </article>
  )
}
