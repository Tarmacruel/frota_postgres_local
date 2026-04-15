export default function EfficiencyChart({ rows = [] }) {
  return (
    <section className="surface-panel">
      <h3 className="section-title">Eficiência por tipo de veículo</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Consumo L/100km</th>
              <th>Média categoria</th>
              <th>Desvio</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((item) => (
              <tr key={item.vehicle_id || `${item.vehicle_type}-${item.total_km}`}>
                <td>{item.vehicle_type}</td>
                <td>{item.consumption_l_100km?.toFixed(2) || '-'}</td>
                <td>{item.category_average?.toFixed(2) || '-'}</td>
                <td>{item.variance_percentage?.toFixed(2) || '-'}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
