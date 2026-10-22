import { useId, useState } from 'react'

export default function MobileFilters({ children, activeCount = 0 }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <div className={`mobile-filters${open ? ' is-open' : ''}`}>
    <button type="button" className="ghost-button mobile-filters__trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
      {open ? 'Fechar filtros' : 'Filtros'}{activeCount > 0 ? <span className="mobile-filter-count">{activeCount}</span> : null}
    </button>
    <div id={id} className="mobile-filters__fields">{children}</div>
  </div>
}
