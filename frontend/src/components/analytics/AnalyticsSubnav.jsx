import { ANALYTICS_SECTIONS } from './analyticsSections'

export default function AnalyticsSubnav({ activeKey, onChange }) {
  return (
    <nav className="analytics-subnav" aria-label="Seções de análises">
      {ANALYTICS_SECTIONS.map(([key, label]) => (
        <button key={key} type="button" className="analytics-subnav__item"
          aria-current={activeKey === key ? 'page' : undefined} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </nav>
  )
}
