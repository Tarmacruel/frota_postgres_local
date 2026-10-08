import AnalyticsSection from './AnalyticsSection'
import AnalyticsSeverityBadge from './AnalyticsSeverityBadge'
import AnalyticsEntityLink from './AnalyticsEntityLink'

export default function SmartInsightsList({ insights = [], onOpenEntity, ...sectionProps }) {
  return (
    <AnalyticsSection title="Alertas inteligentes" empty={insights.length === 0}
      emptyMessage="Sem alertas no período selecionado." {...sectionProps}>
      <div className="analytics-insight-list">
        {insights.slice(0, 15).map((item, index) => {
          const variance = Number(item.variance_percentage || 0)
          const entityType = item.vehicle_id ? 'vehicle' : 'driver'
          const entityId = item.vehicle_id || item.driver_id
          return (
            <article key={`${item.metric}-${entityId || index}`} className="analytics-insight">
              <header><strong>{item.metric}</strong><AnalyticsSeverityBadge severity={item.severity} /></header>
              <p>{item.message}</p>
              <footer>
                <span>{item.recommended_action}</span>
                <strong className={variance >= 0 ? 'insight-up' : 'insight-down'}>
                  {variance >= 0 ? '↑' : '↓'} {Math.abs(variance).toFixed(1)}%
                </strong>
              </footer>
              {entityId ? <AnalyticsEntityLink entityType={entityType} entityId={entityId}
                entityName={entityType === 'vehicle' ? 'Veículo do alerta' : 'Condutor do alerta'} onOpen={onOpenEntity}>
                {entityType === 'vehicle' ? 'Ver veículo' : 'Ver condutor'}
              </AnalyticsEntityLink> : null}
            </article>
          )
        })}
      </div>
    </AnalyticsSection>
  )
}
