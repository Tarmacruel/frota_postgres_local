import AnalyticsEntityLink from './AnalyticsEntityLink'
import AnalyticsSection from './AnalyticsSection'
import { Fragment, useMemo, useState } from 'react'

export default function VehicleDetailsTable({ efficiencyRows = [], tcoRows = [], onOpenEntity, ...sectionProps }) {
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
    <AnalyticsSection title="Detalhamento por veículo" empty={efficiencyRows.length === 0} {...sectionProps}>
      <div className="table-wrap" tabIndex={0} aria-label="Tabela de veículos; role horizontalmente para ver todas as colunas">
        <table className="data-table">
          <thead>
            <tr>
              <th>Veículo</th>
              <th>KM</th>
              <th>Consumo</th>
              <th>Custo/km</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowKey = row.rowKey
              return (
                <Fragment key={rowKey}>
                  <tr>
                    <td><AnalyticsEntityLink entityType="vehicle" entityId={row.vehicle_id} entityName={`Veículo · ${row.vehicle_type}`} onOpen={onOpenEntity}>{row.vehicle_type}</AnalyticsEntityLink></td>
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
                        Referência configurada: R$ {Number(row.tco?.market_benchmark || 0).toFixed(2)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </AnalyticsSection>
  )
}
