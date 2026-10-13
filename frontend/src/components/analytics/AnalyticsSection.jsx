import { useId } from 'react'

export default function AnalyticsSection({ title, description, action, children, className = '', loading = false, error, empty = false, emptyMessage = 'Sem dados para os filtros selecionados.', onRetry }) {
  const titleId = useId()
  return (
    <section className={`analytics-section ${className}`.trim()} aria-labelledby={titleId} aria-busy={loading}>
      <header className="analytics-section__header">
        <div><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div>
        {action}
      </header>
      {loading ? (
        <div className="analytics-state" role="status">
          <span>Carregando {title.toLocaleLowerCase('pt-BR')}…</span>
          <div className="analytics-skeleton" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="analytics-state analytics-state--error" role="alert">
          <p>{error}</p>
          {onRetry ? <button type="button" className="ghost-button" onClick={onRetry}>Tentar novamente</button> : null}
        </div>
      ) : empty ? <p className="analytics-state">{emptyMessage}</p> : children}
    </section>
  )
}
