const KPI_CARD_CONFIG = [
  {
    key: 'average_consumption_l_100km',
    label: 'Consumo médio',
    icon: '⛽',
    formatter: (value) => `${Number(value || 0).toFixed(2)} L/100km`,
    resolveTone: (value) => (Number(value || 0) <= 10 ? 'status-low' : 'status-medium'),
    resolveHint: (value) => (Number(value || 0) <= 10 ? 'Eficiente' : 'Atenção ao consumo'),
  },
  {
    key: 'average_tco_per_km',
    label: 'Custo por km',
    icon: '💰',
    formatter: (value) => `R$ ${Number(value || 0).toFixed(2)}/km`,
    resolveTone: () => 'status-info',
    resolveHint: () => 'Indicador financeiro',
  },
  {
    key: 'active_alerts',
    label: 'Alertas ativos',
    icon: '🚨',
    formatter: (value) => `${Math.round(Number(value || 0))}`,
    resolveTone: (value) => (Number(value || 0) > 5 ? 'status-critical' : 'status-high'),
    resolveHint: (value) => (Number(value || 0) > 5 ? 'Crítico' : 'Monitorando'),
  },
  {
    key: 'fleet_active',
    label: 'Frota ativa',
    icon: '🚗',
    formatter: (value) => `${Math.round(Number(value || 0))}`,
    resolveTone: () => 'status-info',
    resolveHint: () => 'Veículos disponíveis',
  },
]

export default function KPICards({ overview, loading = false }) {
  return (
    <div className="analytics-kpi-grid">
      {KPI_CARD_CONFIG.map((card) => {
        const value = overview?.[card.key]
        const toneClass = card.resolveTone(value)
        return (
          <article key={card.key} className={`analytics-kpi-card ${toneClass}`}>
            <div>
              <p className="analytics-kpi-label">{card.label}</p>
              <strong className="analytics-kpi-value">{loading ? '--' : card.formatter(value)}</strong>
              <span className="analytics-kpi-hint">{loading ? 'Carregando...' : card.resolveHint(value)}</span>
            </div>
            <span className="analytics-kpi-icon" aria-hidden="true">{card.icon}</span>
          </article>
        )
      })}
    </div>
  )
}
