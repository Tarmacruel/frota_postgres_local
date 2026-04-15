const SEVERITY_CONFIG = {
  CRITICAL: {
    icon: '🔴',
    className: 'insight-critical',
    label: 'Crítico',
  },
  HIGH: {
    icon: '🟠',
    className: 'insight-high',
    label: 'Alto',
  },
  MEDIUM: {
    icon: '🟡',
    className: 'insight-medium',
    label: 'Médio',
  },
}

export default function SmartInsightsList({ insights = [] }) {
  if (insights.length === 0) {
    return (
      <section className="surface-panel">
        <h3 className="section-title">Insights inteligentes</h3>
        <div className="empty-state">
          <div style={{ fontSize: 32, marginBottom: 6 }}>✅</div>
          Sem alertas no período selecionado.
        </div>
      </section>
    )
  }

  return (
    <section className="surface-panel">
      <h3 className="section-title">Insights inteligentes</h3>
      <div className="analytics-insight-list">
        {insights.slice(0, 15).map((item, index) => {
          const config = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.MEDIUM
          const variance = Number(item.variance_percentage || 0)
          return (
            <article key={`${item.metric}-${item.vehicle_id || item.driver_id || index}`} className={`analytics-insight ${config.className}`}>
              <header>
                <div className="analytics-insight-title">
                  <span>{config.icon}</span>
                  <strong>{item.metric}</strong>
                </div>
                <span className="status-badge status-PENDENTE">{config.label}</span>
              </header>
              <p>{item.message}</p>
              <footer>
                <span>💡 {item.recommended_action}</span>
                <strong className={variance >= 0 ? 'insight-up' : 'insight-down'}>
                  {variance >= 0 ? '↑' : '↓'} {Math.abs(variance).toFixed(1)}%
                </strong>
              </footer>
            </article>
          )
        })}
      </div>
    </section>
  )
}
