function normalizeRows(rows) {
  return rows.slice(0, 20).map((item, index) => {
    const variance = Number(item.variance_percentage || 0)
    return {
      id: item.vehicle_id || `${item.vehicle_type}-${index}`,
      vehicle: item.vehicle_type,
      tco: Number(item.tco_cost_per_km || 0),
      benchmark: Number(item.market_benchmark || 0),
      variance,
      color: variance > 30 ? 'var(--analytics-critical)' : variance < -20 ? 'var(--analytics-low)' : 'var(--analytics-medium)',
    }
  })
}

export default function CostPerKmRanking({ rows = [] }) {
  const data = normalizeRows(rows)
  const maxX = Math.max(1, ...data.map((item) => item.benchmark))
  const maxY = Math.max(1, ...data.map((item) => item.tco))

  return (
    <section className="surface-panel">
      <h3 className="section-title">Custo Total por KM (TCO)</h3>
      {data.length === 0 ? (
        <div className="empty-state">Sem dados para o período selecionado.</div>
      ) : (
        <>
          <div className="analytics-scatter-area">
            {data.map((item) => {
              const left = (item.benchmark / maxX) * 100
              const bottom = (item.tco / maxY) * 100
              return (
                <button
                  key={item.id}
                  type="button"
                  className="analytics-scatter-dot"
                  style={{ left: `${left}%`, bottom: `${bottom}%`, backgroundColor: item.color }}
                  title={`${item.vehicle} | TCO: R$ ${item.tco.toFixed(2)} | Benchmark: R$ ${item.benchmark.toFixed(2)} | Desvio: ${item.variance.toFixed(2)}%`}
                />
              )
            })}
          </div>
          <div className="analytics-scatter-legend">
            <span><i style={{ backgroundColor: 'var(--analytics-critical)' }} /> +30% acima do benchmark</span>
            <span><i style={{ backgroundColor: 'var(--analytics-low)' }} /> -20% abaixo (eficiente)</span>
            <span><i style={{ backgroundColor: 'var(--analytics-medium)' }} /> Faixa intermediária</span>
          </div>
        </>
      )}
    </section>
  )
}
