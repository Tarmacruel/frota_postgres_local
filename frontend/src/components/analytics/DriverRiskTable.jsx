export default function DriverRiskTable({ rows = [] }) {
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
            {rows.slice(0, 12).map((item) => (
              <tr key={item.driver_id}>
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
