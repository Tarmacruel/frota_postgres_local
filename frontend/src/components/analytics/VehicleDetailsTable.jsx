import { Fragment, useMemo, useState } from 'react'

export default function VehicleDetailsTable({ efficiencyRows = [], tcoRows = [] }) {
  const [expandedRowKey, setExpandedRowKey] = useState(null)

  const rows = useMemo(() => {
    const tcoByVehicle = new Map(tcoRows.map((row) => [row.vehicle_id, row]))
    const keyOccurrences = new Map()

    return efficiencyRows.map((row) => {
      const baseKey = [
        row.vehicle_id || row.plate || row.vehicle_type || 'unknown-vehicle',
        row.total_km || 0,
        row.consumption_l_100km || 0,
        row.variance_percentage || 0,
      ].join('-')

      const nextOccurrence = (keyOccurrences.get(baseKey) || 0) + 1
      keyOccurrences.set(baseKey, nextOccurrence)

      return {
        ...row,
        rowKey: `${baseKey}-${nextOccurrence}`,
        tco: tcoByVehicle.get(row.vehicle_id) || null,
      }
    })
  }, [efficiencyRows, tcoRows])

  return (
    <section className="surface-panel">
      <h3 className="section-title">Detalhamento por veículo</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Veículo</th>
              <th>KM</th>
              <th>Consumo</th>
              <th>TCO/km</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowKey = row.rowKey
              return (
                <Fragment key={rowKey}>
                  <tr>
                    <td>{row.vehicle_type}</td>
                    <td>{Number(row.total_km || 0).toLocaleString('pt-BR')}</td>
                    <td>{Number(row.consumption_l_100km || 0).toFixed(2)} L/100km</td>
                    <td>R$ {Number(row.tco?.tco_cost_per_km || 0).toFixed(2)}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setExpandedRowKey(expandedRowKey === rowKey ? null : rowKey)}
                      >
                        {expandedRowKey === rowKey ? 'Ocultar' : 'Detalhes'}
                      </button>
                    </td>
                  </tr>
                  {expandedRowKey === rowKey ? (
                    <tr>
                      <td colSpan={5}>
                        Média categoria consumo: {Number(row.category_average || 0).toFixed(2)} L/100km •
                        Desvio consumo: {Number(row.variance_percentage || 0).toFixed(2)}% •
                        Benchmark TCO: R$ {Number(row.tco?.market_benchmark || 0).toFixed(2)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
