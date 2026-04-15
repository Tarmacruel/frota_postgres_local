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

export default function EfficiencyChart({ rows = [] }) {
  const data = rows.slice(0, 12).map((item) => ({
    vehicle: item.vehicle_type,
    consumo: Number(item.consumption_l_100km || 0),
    media: Number(item.category_average || 0),
  }))

  return (
    <section className="surface-panel">
      <h3 className="section-title">Eficiência por tipo de veículo</h3>
      {data.length === 0 ? (
        <div className="empty-state">Sem dados para o período selecionado.</div>
      ) : (
        <div style={{ width: '100%', height: 300 }}>
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
    </section>
  )
}
