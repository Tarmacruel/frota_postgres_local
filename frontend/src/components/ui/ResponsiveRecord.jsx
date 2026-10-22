import { Children, cloneElement, isValidElement, useId, useState } from 'react'

// Keep the original table cells, values and actions. Only the mobile presentation
// changes: secondary fields are revealed without fetching or copying the record.
export default function ResponsiveRecord({ children, label, summaryLabels = [], identityLabel, statusLabel = 'Status', className = '', ...props }) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const cells = Children.toArray(children).map((child, index) => {
    if (!isValidElement(child) || child.type !== 'td') return child
    const name = child.props['data-label']
    const kind = name === identityLabel ? 'identity' : name === statusLabel ? 'status'
      : ['Ações', 'Consulta'].includes(name) ? 'actions' : summaryLabels.includes(name) ? 'summary' : 'detail'
    return cloneElement(child, { 'data-mobile-kind': kind, id: kind === 'detail' ? `${id}-${index}` : child.props.id })
  })
  const detailIds = cells.filter((cell) => cell?.props?.['data-mobile-kind'] === 'detail').map((cell) => cell.props.id).join(' ')
  return <tr {...props} className={`responsive-record ${expanded ? 'is-expanded' : ''} ${className}`.trim()}>
    {cells}
    {detailIds ? <td className="responsive-record__toggle">
      <button type="button" className="ghost-button" aria-label={`${expanded ? 'Ocultar' : 'Ver'} detalhes: ${label}`} aria-expanded={expanded} aria-controls={detailIds || undefined} onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Menos detalhes' : 'Ver detalhes'}<span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
    </td> : null}
  </tr>
}
