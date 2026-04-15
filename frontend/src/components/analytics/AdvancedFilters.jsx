import SearchableSelect from '../SearchableSelect'

function buildFilterChips(filters, organizations, vehicleTypeOptions) {
  const chips = []

  if (filters.period_days !== 30) {
    chips.push({ key: 'period_days', label: `Período: ${filters.period_days} dias`, clearTo: 30 })
  }

  if (filters.vehicle_type) {
    const selectedType = vehicleTypeOptions.find((item) => item.value === filters.vehicle_type)
    chips.push({ key: 'vehicle_type', label: `Tipo: ${selectedType?.label || filters.vehicle_type}`, clearTo: '' })
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

  const vehicleTypeOptions = [
    { value: '', label: 'Todos os tipos' },
    { value: 'SEDAN', label: 'Sedan' },
    { value: 'HATCH', label: 'Hatch' },
    { value: 'SUV', label: 'SUV' },
    { value: 'PICAPE', label: 'Picape' },
    { value: 'VAN', label: 'Van' },
    { value: 'ONIBUS', label: 'Ônibus' },
    { value: 'CAMINHAO', label: 'Caminhão' },
    { value: 'MOTOCICLETA', label: 'Motocicleta' },
  ]

  const organizationOptions = [
    { value: '', label: 'Todos os órgãos' },
    ...organizations.map((org) => ({
      value: org.id,
      label: org.name,
      description: `${org.departments?.length || 0} departamento(s)`,
      keywords: `${org.name} ${org.departments?.map((department) => department.name).join(' ') || ''}`,
    })),
  ]

  const chips = buildFilterChips(filters, organizations, vehicleTypeOptions)

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
            <SearchableSelect
              value={filters.period_days}
              options={periodOptions}
              onChange={(value) => onChange('period_days', Number(value))}
              searchPlaceholder="Buscar período"
              placeholder="Selecione o período"
              allowClear={false}
            />
          </label>

          <label className="analytics-filter-field">
            <span>Tipo de veículo</span>
            <SearchableSelect
              value={filters.vehicle_type}
              options={vehicleTypeOptions}
              onChange={(value) => onChange('vehicle_type', value)}
              searchPlaceholder="Buscar tipo de veículo"
              placeholder="Selecione um tipo"
              allowClear
              clearLabel="Limpar tipo"
            />
          </label>

          <label className="analytics-filter-field">
            <span>Órgão</span>
            <SearchableSelect
              value={filters.organization}
              options={organizationOptions}
              onChange={(value) => onChange('organization', value)}
              searchPlaceholder="Buscar órgão"
              placeholder="Selecione um órgão"
              allowClear
              clearLabel="Limpar órgão"
            />
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
