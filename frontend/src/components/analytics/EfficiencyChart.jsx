import AnalyticsSection from './AnalyticsSection'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

export default function EfficiencyChart({ rows = [], ...sectionProps }) {
  const data = rows.slice(0, 12).map((item) => ({
    vehicle: item.vehicle_type,
    consumo: Number(item.consumption_l_100km || 0),
    media: Number(item.category_average || 0),
  }))

  return (
    <AnalyticsSection title="Eficiência por tipo de veículo" empty={rows.length === 0} {...sectionProps}>
      {data.length === 0 ? (
        <div className="empty-state">Sem dados para o período selecionado.</div>
      ) : (
        <div className="analytics-chart">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 20, right: 24, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="vehicle" />
              <YAxis />
              <Tooltip formatter={(value) => Number(value).toFixed(2)} />
              <Legend />
              <Bar dataKey="consumo" fill="var(--analytics-info)" name="Consumo real" />
              <Bar dataKey="media" fill="var(--analytics-low)" name="Média categoria" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnalyticsSection>
  )
}
