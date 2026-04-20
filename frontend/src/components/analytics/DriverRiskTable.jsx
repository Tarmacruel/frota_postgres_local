import { useMemo } from 'react'

export default function DriverRiskTable({ rows = [] }) {
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
    <section className="surface-panel">
      <h3 className="section-title">Score de risco de condutores</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Condutor</th>
              <th>Multas</th>
              <th>Sinistros</th>
              <th>Anomalias</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((item) => (
              <tr key={item.rowKey}>
                <td>{item.driver_name}</td>
                <td>{item.fines_count}</td>
                <td>{item.claims_count}</td>
                <td>{item.anomalies_count}</td>
                <td>{item.normalized_risk_score?.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
