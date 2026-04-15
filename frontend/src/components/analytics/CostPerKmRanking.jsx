export default function CostPerKmRanking({ rows = [] }) {
  return (
    <section className="surface-panel">
      <h3 className="section-title">Ranking TCO por km</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>TCO/Km</th>
              <th>Benchmark</th>
              <th>Desvio</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((item) => (
              <tr key={item.vehicle_id || `${item.vehicle_type}-${item.total_km}`}>
                <td>{item.vehicle_type}</td>
                <td>{item.tco_cost_per_km?.toFixed(2) || '-'}</td>
                <td>{item.market_benchmark?.toFixed(2) || '-'}</td>
                <td>{item.variance_percentage?.toFixed(2) || '-'}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
