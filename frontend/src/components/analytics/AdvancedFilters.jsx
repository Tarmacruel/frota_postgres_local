export default function AdvancedFilters({ filters, organizations = [], onChange, onRefresh }) {
  const periodOptions = [
    { value: 30, label: 'Últimos 30 dias' },
    { value: 90, label: 'Últimos 90 dias' },
    { value: 365, label: 'Últimos 365 dias' },
  ]

  return (
    <div className="surface-panel" style={{ marginBottom: 12 }}>
      <div className="panel-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div>
          <label>Período</label>
          <select value={filters.period_days} onChange={(e) => onChange('period_days', Number(e.target.value))}>
            {periodOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Tipo de veículo</label>
          <select value={filters.vehicle_type} onChange={(e) => onChange('vehicle_type', e.target.value)}>
            <option value="">Todos</option>
            <option value="SEDAN">Sedan</option>
            <option value="HATCH">Hatch</option>
            <option value="SUV">SUV</option>
            <option value="PICAPE">Picape</option>
            <option value="VAN">Van</option>
            <option value="ONIBUS">Ônibus</option>
            <option value="CAMINHAO">Caminhão</option>
          </select>
        </div>

        <div>
          <label>Órgão</label>
          <select value={filters.organization} onChange={(e) => onChange('organization', e.target.value)}>
            <option value="">Todos</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button type="button" className="app-button" onClick={onRefresh}>🔄 Atualizar</button>
        </div>
      </div>
    </div>
  )
}
