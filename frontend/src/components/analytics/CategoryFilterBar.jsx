export default function CategoryFilterBar({ filters, onChange }) {
  return (
    <div className="actions-inline" style={{ marginBottom: 16 }}>
      <select value={filters.period_days} onChange={(e) => onChange('period_days', Number(e.target.value))}>
        <option value={30}>Ultimos 30 dias</option>
        <option value={90}>Ultimos 90 dias</option>
        <option value={365}>Ultimos 365 dias</option>
      </select>
      <input
        placeholder="Tipo de veiculo (ex: SEDAN)"
        value={filters.vehicle_type}
        onChange={(e) => onChange('vehicle_type', e.target.value.toUpperCase())}
      />
      <input
        placeholder="Orgao (informativo)"
        value={filters.organization}
        onChange={(e) => onChange('organization', e.target.value)}
      />
    </div>
  )
}
