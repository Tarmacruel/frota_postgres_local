import { AppIcon } from '../AppIcon'
import { Link } from 'react-router-dom'

export default function StatCard({ icon, label, value, note, tone = 'info', loading = false, to }) {
  const Component = to ? Link : 'article'
  return (
    <Component to={to} className={`ui-stat-card${to ? ' ui-stat-card--interactive' : ''}`} data-tone={tone} aria-label={label} aria-busy={loading} aria-disabled={to && loading ? true : undefined} onClick={loading ? (event) => event.preventDefault() : undefined}>
      <span className="ui-stat-card__icon" aria-hidden="true">
        {icon ? <AppIcon name={icon} className="app-icon" /> : null}
      </span>
      <div className="ui-stat-card__content">
        <strong className="ui-stat-card__value" aria-label={loading ? 'Carregando' : undefined}>{loading ? '—' : value}</strong>
        <span className="ui-stat-card__label">{label}</span>
        {note ? <span className="ui-stat-card__note">{note}</span> : null}
      </div>
      {to ? <AppIcon name="chevron-right" className="app-icon" /> : null}
    </Component>
  )
}
