function normalizeRows(rows) {
  return rows
    .slice(0, 12)
    .map((item) => ({
      id: item.vehicle_id || `${item.vehicle_type}-${item.total_km}`,
      vehicle: item.vehicle_type,
      consumo: Number(item.consumption_l_100km || 0),
      media: Number(item.category_average || 0),
    }))
}

export default function EfficiencyChart({ rows = [] }) {
  const data = normalizeRows(rows)
  const maxValue = Math.max(1, ...data.map((item) => Math.max(item.consumo, item.media)))

  return (
    <section className="surface-panel">
      <h3 className="section-title">Eficiência por tipo de veículo</h3>
      {data.length === 0 ? (
        <div className="empty-state">Sem dados para o período selecionado.</div>
      ) : (
        <div className="analytics-bars">
          {data.map((item) => {
            const consumoWidth = (item.consumo / maxValue) * 100
            const mediaWidth = (item.media / maxValue) * 100
            return (
              <div key={item.id} className="analytics-bar-row">
                <div className="analytics-bar-meta">
                  <strong>{item.vehicle}</strong>
                  <span>{item.consumo.toFixed(2)} vs {item.media.toFixed(2)} L/100km</span>
                </div>
                <div className="analytics-bar-track">
                  <div className="analytics-bar-real" style={{ width: `${consumoWidth}%` }} />
                  <div className="analytics-bar-target" style={{ width: `${mediaWidth}%` }} />
                </div>
              </div>
            )
          })}
          <div className="analytics-bar-legend">
            <span><i className="legend-real" /> Consumo real</span>
            <span><i className="legend-target" /> Média da categoria</span>
          </div>
        </div>
      )}
    </section>
  )
}
