import AnalyticsSection from './AnalyticsSection'
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'

export default function CostPerKmRanking({ rows = [], ...sectionProps }) {
  const data = rows.slice(0, 20).map((item) => {
    const variance = Number(item.variance_percentage || 0)
    return {
      vehicle: item.vehicle_type,
      tco: Number(item.tco_cost_per_km || 0),
      benchmark: Number(item.market_benchmark || 0),
      variance,
      color: variance > 30 ? 'var(--analytics-critical)' : variance < -20 ? 'var(--analytics-low)' : 'var(--analytics-medium)',
    }
  })

  return (
    <AnalyticsSection title="Custo operacional por km" description="Comparação com referência configurada por categoria; não representa pesquisa de mercado." empty={rows.length === 0} {...sectionProps}>
      {data.length === 0 ? (
        <div className="empty-state">Sem dados para o período selecionado.</div>
      ) : (
        <>
          <div className="analytics-chart">
            <ResponsiveContainer>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="benchmark" name="Referência" unit=" R$/km" />
                <YAxis type="number" dataKey="tco" name="Custo por km" unit=" R$/km" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  formatter={(value) => Number(value).toFixed(2)}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.vehicle || ''}
                />
                <Scatter data={data}>
                  {data.map((point, index) => (
                    <Cell key={`${point.vehicle}-${index}`} fill={point.color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="analytics-scatter-legend">
            <span><i className="analytics-legend-critical" /> +30% acima da referência</span>
            <span><i className="analytics-legend-low" /> -20% abaixo (eficiente)</span>
            <span><i className="analytics-legend-medium" /> Faixa intermediária</span>
          </div>
        </>
      )}
    </AnalyticsSection>
  )
}
