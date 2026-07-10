const labelMap = {
  PROPRIO: 'Próprio',
  LOCADO: 'Locado',
  CEDIDO: 'Cedido',
}

export default function BadgeOwnership({ value }) {
  return <span className={`ownership-badge ownership-${value}`}>{labelMap[value] || value}</span>
}
