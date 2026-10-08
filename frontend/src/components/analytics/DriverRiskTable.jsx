import AnalyticsEntityLink from './AnalyticsEntityLink'
import AnalyticsSection from './AnalyticsSection'
import { useMemo } from 'react'

export default function DriverRiskTable({ rows = [], onOpenEntity, ...sectionProps }) {
  const displayRows = useMemo(() => {
    const uniqueByDriver = new Map()

    rows.forEach((item) => {
      const driverKey = item.driver_id || item.driver_name || `driver-${uniqueByDriver.size}`
      if (!uniqueByDriver.has(driverKey)) {
        uniqueByDriver.set(driverKey, item)
      }
    })

    return Array.from(uniqueByDriver.values())
      .slice(0, 12)
      .map((item, index) => ({
        ...item,
        rowKey: `${item.driver_id || item.driver_name || 'unknown-driver'}-${index}`,
      }))
  }, [rows])

  return (
    <AnalyticsSection title="Pontuação de risco de condutores" empty={rows.length === 0} {...sectionProps}>
      <div className="table-wrap" tabIndex={0} aria-label="Tabela de condutores; role horizontalmente para ver todas as colunas">
        <table className="data-table">
          <thead>
            <tr>
              <th>Condutor</th>
              <th>Multas</th>
              <th>Sinistros</th>
              <th>Anomalias</th>
              <th>Pontuação</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((item) => (
              <tr key={item.rowKey}>
                <td><AnalyticsEntityLink entityType="driver" entityId={item.driver_id} entityName={item.driver_name} onOpen={onOpenEntity}>{item.driver_name}</AnalyticsEntityLink></td>
                <td>{item.fines_count}</td>
                <td>{item.claims_count}</td>
                <td>{item.anomalies_count}</td>
                <td>{item.normalized_risk_score?.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnalyticsSection>
  )
}
