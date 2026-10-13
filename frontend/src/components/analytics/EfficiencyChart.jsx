import AnalyticsSection from './AnalyticsSection'
import AnalyticsEntityLink from './AnalyticsEntityLink'
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

export default function EfficiencyChart({ rows = [], onOpenEntity, ...sectionProps }) {
  const data = rows.slice(0, 12).map((item) => ({
    vehicle: item.vehicle_type,
    vehicle_id: item.vehicle_id,
    consumo: Number(item.consumption_l_100km || 0),
    media: Number(item.category_average || 0),
  }))

  return (
    <AnalyticsSection title="Eficiência por tipo de veículo" empty={rows.length === 0} {...sectionProps}>
      {data.length === 0 ? (
        <div className="empty-state">Sem dados para o período selecionado.</div>
      ) : (
        <><div className="analytics-chart">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 20, right: 24, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="vehicle" />
              <YAxis />
              <Tooltip formatter={(value) => Number(value).toFixed(2)} />
              <Legend />
              <Bar dataKey="consumo" fill="var(--analytics-info)" name="Consumo real" onClick={(point) => {
                const selected = point?.payload || point
                if (selected?.vehicle_id) onOpenEntity?.({ entityType: 'vehicle', entityId: selected.vehicle_id,
                  title: `Veículo · ${selected.vehicle}`, origin: { label: 'Eficiência por tipo',
                    formula: 'Litros por 100 km exibidos no painel anterior, comparados à média da categoria.' } })
              }} />
              <Bar dataKey="media" fill="var(--analytics-low)" name="Média categoria" />
            </BarChart>
          </ResponsiveContainer>
        </div><ol className="analytics-chart-entities">{data.map((point, index) => <li key={`${point.vehicle_id || point.vehicle}-${index}`}>
          <AnalyticsEntityLink entityType="vehicle" entityId={point.vehicle_id} entityName={`Veículo · ${point.vehicle}`}
            origin={{ label: 'Eficiência por tipo', formula: 'Litros por 100 km exibidos no painel anterior, comparados à média da categoria.' }} onOpen={onOpenEntity}>
            {point.vehicle} · {point.consumo.toFixed(2)} L/100km
          </AnalyticsEntityLink>
        </li>)}</ol></>
      )}
    </AnalyticsSection>
  )
}
