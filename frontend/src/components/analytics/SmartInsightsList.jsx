const SEVERITY_CLASS = {
  CRITICAL: 'status-INATIVO',
  HIGH: 'status-MANUTENCAO',
  MEDIUM: 'status-ATIVO',
}

export default function SmartInsightsList({ insights = [] }) {
  return (
    <section className="surface-panel">
      <h3 className="section-title">Insights inteligentes</h3>
      <div className="hub-urgent-list">
        {insights.slice(0, 10).map((item, index) => (
          <article key={`${item.metric}-${item.vehicle_id || item.driver_id || index}`} className="hub-urgent-item">
            <header>
              <strong>{item.metric}</strong>
              <span className={`status-badge ${SEVERITY_CLASS[item.severity] || 'status-ATIVO'}`}>{item.severity}</span>
            </header>
            <span>{item.message}</span>
            <footer>
              <span className="muted">Ação: {item.recommended_action}</span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}
