import { AppIcon } from '../AppIcon'
import { formatIndicator } from '../../utils/indicatorFormat'
import './IndicatorBar.css'

export default function IndicatorBar({ state, loading = false, error = '', label = 'Indicadores', resultCount }) {
  const items = state.metadata?.items || []
  const selected = items.find((item) => item.key === state.selected)
  if (!items.length) return null
  return (
    <section className="interactive-kpis" aria-label={label} aria-busy={loading}>
      <div className="interactive-kpis__grid">
        {items.map((item) => {
          const active = item.key === state.selected
          return <button key={item.key} type="button" className="interactive-kpi" data-tone={item.tone}
            aria-pressed={active} disabled={loading} onClick={() => state.select(item.key)}
            title={item.description || `Filtrar ${item.label.toLowerCase()}`}>
            <span className="interactive-kpi__label">{item.label}</span>
            <strong className="interactive-kpi__value">{loading || error ? '—' : formatIndicator(item.value, item.unit)}</strong>
            <span className="interactive-kpi__action">{active ? 'Selecionado' : item.unit === 'BRL' || item.unit === 'L' ? 'Ver composição' : 'Ver registros'}<AppIcon name={active ? 'check' : 'chevron-right'} className="app-icon" /></span>
          </button>
        })}
      </div>
      <p className="interactive-kpis__swipe-hint">Deslize para ver mais indicadores</p>
      <div className="interactive-kpis__context">
        <span>Totais da busca e dos filtros gerais, em todas as páginas.</span>
        {state.selected !== 'total' ? <div className="interactive-kpis__selection" role="status">
          <span>{selected?.label || 'Indicador selecionado'}{resultCount !== undefined && !loading && !error ? ` · ${resultCount} registro(s)` : ''}</span>
          <button type="button" className="ghost-button" onClick={() => state.select('total')}>Limpar indicador</button>
        </div> : null}
      </div>
    </section>
  )
}
