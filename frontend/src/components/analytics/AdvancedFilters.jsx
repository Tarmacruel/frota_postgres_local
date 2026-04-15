function buildFilterChips(filters, organizations) {
  const chips = []

  if (filters.period_days !== 30) {
    chips.push({ key: 'period_days', label: `Período: ${filters.period_days} dias`, clearTo: 30 })
  }

  if (filters.vehicle_type) {
    chips.push({ key: 'vehicle_type', label: `Tipo: ${filters.vehicle_type}`, clearTo: '' })
  }

  if (filters.organization) {
    const org = organizations.find((item) => String(item.id) === String(filters.organization))
    chips.push({ key: 'organization', label: `Órgão: ${org?.name || filters.organization}`, clearTo: '' })
  }

  return chips
}

export default function AdvancedFilters({ filters, organizations = [], loading = false, onChange, onRefresh, onExport }) {
  const periodOptions = [
    { value: 7, label: 'Últimos 7 dias' },
    { value: 30, label: 'Últimos 30 dias' },
    { value: 90, label: 'Últimos 90 dias' },
    { value: 180, label: 'Últimos 180 dias' },
    { value: 365, label: 'Últimos 365 dias' },
  ]

  const chips = buildFilterChips(filters, organizations)

  function clearFilters() {
    onChange('period_days', 30)
    onChange('vehicle_type', '')
    onChange('organization', '')
  }

  return (
    <section className="analytics-filters-panel">
      <div className="analytics-filters-top-row">
        <div className="analytics-filters-grid">
          <label className="analytics-filter-field">
            <span>Período</span>
            <select value={filters.period_days} onChange={(e) => onChange('period_days', Number(e.target.value))}>
              {periodOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="analytics-filter-field">
            <span>Tipo de veículo</span>
            <select value={filters.vehicle_type} onChange={(e) => onChange('vehicle_type', e.target.value)}>
              <option value="">Todos os tipos</option>
              <option value="SEDAN">Sedan</option>
              <option value="HATCH">Hatch</option>
              <option value="SUV">SUV</option>
              <option value="PICAPE">Picape</option>
              <option value="VAN">Van</option>
              <option value="ONIBUS">Ônibus</option>
              <option value="CAMINHAO">Caminhão</option>
              <option value="MOTOCICLETA">Motocicleta</option>
            </select>
          </label>

          <label className="analytics-filter-field">
            <span>Órgão</span>
            <select value={filters.organization} onChange={(e) => onChange('organization', e.target.value)}>
              <option value="">Todos os órgãos</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="analytics-filter-actions" role="group" aria-label="Ações de analytics">
          <button type="button" className="app-button" onClick={onRefresh} disabled={loading}>
            {loading ? 'Atualizando...' : '🔄 Atualizar'}
          </button>
          <button type="button" className="secondary-button" onClick={onExport}>
            Exportar relatório
          </button>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="analytics-filter-chips" aria-label="Filtros ativos">
          <span className="analytics-filter-chip-label">Filtros ativos:</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="analytics-filter-chip"
              onClick={() => onChange(chip.key, chip.clearTo)}
            >
              {chip.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="analytics-filter-clear" onClick={clearFilters}>Limpar filtros</button>
        </div>
      ) : null}
    </section>
  )
}
