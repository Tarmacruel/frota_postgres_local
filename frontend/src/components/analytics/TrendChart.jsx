import AnalyticsSection from './AnalyticsSection'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

export default function TrendChart({ rows = [], ...sectionProps }) {
  return (
    <AnalyticsSection title="Evolução de custos (12 meses)" empty={rows.length === 0} {...sectionProps}>
      {rows.length === 0 ? (
        <div className="empty-state">Sem dados históricos.</div>
      ) : (
        <div className="analytics-chart">
          <ResponsiveContainer>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
              <Legend />
              <Line type="monotone" dataKey="fuel_cost" stroke="var(--analytics-info)" name="Combustível" />
              <Line type="monotone" dataKey="maintenance_cost" stroke="var(--analytics-critical)" name="Manutenção" />
              <Line type="monotone" dataKey="fines_cost" stroke="var(--analytics-high)" name="Multas" />
              <Line type="monotone" dataKey="total_cost" stroke="var(--analytics-low)" name="Total" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnalyticsSection>
  )
}
