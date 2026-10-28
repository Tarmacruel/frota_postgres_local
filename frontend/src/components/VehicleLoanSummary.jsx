import { useId, useLayoutEffect, useRef, useState } from 'react'
import { AppIcon } from './AppIcon'
import { formatLoanDate } from '../utils/vehicleLoans'
import { vehicleLoanJourney } from '../utils/vehicleLoanJourney'

const stepLabels = { done: 'Concluída', current: 'Etapa atual', upcoming: 'A seguir', stopped: 'Interrompida', skipped: 'Não realizada' }

function LoanNote({ title, text, sectionRef, expanded, onToggle }) {
  const id = useId()
  const long = text.length > 72 || text.includes('\n')
  const textRef = useRef(null)
  const [clipped, setClipped] = useState(long)
  useLayoutEffect(() => {
    const node = textRef.current
    let current = true
    function measure() {
      if (!current || expanded || !node) return
      setClipped(node.clientWidth ? node.scrollHeight > node.clientHeight + 1 : long)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(node)
    if (!observer) window.addEventListener('resize', measure)
    document.fonts?.ready?.then(measure)
    return () => { current = false; observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [text, expanded, long])
  return <section className="loan-summary__note" ref={sectionRef} tabIndex={-1} aria-labelledby={`${id}-title`}>
    <header><h5 id={`${id}-title`}>{title}</h5>{long && (clipped || expanded) ? <button type="button" className="loan-summary__read-more"
      aria-controls={`${id}-text`} aria-expanded={Boolean(expanded)} aria-label={`${expanded ? 'Recolher texto' : 'Ler texto completo'}: ${title}`}
      onClick={onToggle}>{expanded ? 'Recolher' : 'Ler completo'}<AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} /></button> : null}</header>
    <p id={`${id}-text`} ref={textRef} className="loan-copy" data-preview={long && !expanded}>{text}</p>
  </section>
}

export default function VehicleLoanSummary({ detail, events, onDocuments, children }) {
  const [expandedNotes, setExpandedNotes] = useState({})
  const sections = useRef({})
  const id = useId()
  const journey = vehicleLoanJourney(detail, events)
  const returned = detail.status === 'RETURNED'
  const cancelled = ['CANCELLED', 'REJECTED'].includes(detail.status)
  const delivered = ['ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED'].includes(detail.status)
  const registerSection = (key) => (node) => { sections.current[key] = node }
  function navigateStage(key) {
    const node = sections.current[key]
    if (!node) return
    if (key === 'purpose') setExpandedNotes((current) => ({ ...current, purpose: true }))
    if (node.tagName === 'DETAILS') node.open = true
    const target = node.querySelector('summary') || node
    target.focus({ preventScroll: true })
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    node.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  }
  const note = (key, title, text, fallback) => <LoanNote title={title} text={text || fallback} sectionRef={registerSection(key)}
    expanded={expandedNotes[key]} onToggle={() => setExpandedNotes((current) => ({ ...current, [key]: !current[key] }))} />

  return <div className="loan-summary">
    {journey ? <section className="loan-journey" data-finished={returned} data-stopped={Boolean(journey.stopped)} aria-label="Progresso do empréstimo">
      <header className="loan-journey__heading"><div><span>Etapas operacionais</span><h4>{returned ? <AppIcon name="check" /> : null}{journey.title}</h4></div><strong className="loan-journey__score">{journey.completed}<span> / {journey.steps.length}</span></strong></header>
      <div className="loan-journey__bar" role="progressbar" aria-label="Etapas operacionais concluídas"
        aria-valuemin={0} aria-valuemax={journey.steps.length} aria-valuenow={journey.completed}
        aria-valuetext={`${journey.completed} de ${journey.steps.length} etapas operacionais concluídas${journey.stopped ? '; percurso interrompido' : ''}`}>
        {journey.steps.map((step) => <span key={step.key} data-complete={step.state === 'done'} />)}
      </div>
      <ol className="loan-journey__steps" aria-label="Marcos do empréstimo" data-count={journey.steps.length}>
        {journey.steps.map((step, index) => <li key={step.key} data-state={step.state} aria-current={step.state === 'current' ? 'step' : undefined}>
          <button type="button" onClick={() => navigateStage(step.key)} aria-label={`${step.label}: ${stepLabels[step.state]}. Consultar detalhes`}>
            <span className="loan-journey__marker" aria-hidden="true">{step.state === 'done' ? <AppIcon name="check" /> : step.state === 'stopped' ? <AppIcon name="close" /> : index + 1}</span>
            <strong>{step.label}</strong><small>{stepLabels[step.state]}</small>
          </button>
        </li>)}
      </ol>
      <div className="loan-journey__next">{journey.next ? <div><span>Próxima etapa · {journey.next}</span><strong>{detail[`${journey.owner}_organization_name`] || 'Secretaria responsável'}</strong></div> : null}{!journey.next || journey.regularized ? <p>{journey.hint}</p> : null}
        {returned ? <button type="button" className="loan-summary__text-action" onClick={onDocuments}>Conferir documentos e assinaturas<AppIcon name="chevron-right" /></button> : null}
      </div>
    </section> : null}

    {children}
    {detail.regularized_at ? <div className="loan-notice"><strong>Regularização administrativa registrada em {formatLoanDate(detail.regularized_at)}</strong><p>Referência: {detail.regularization_reference}</p><p>As datas efetivas foram informadas na regularização. Não representam aceites ou assinaturas realizados no passado.</p></div> : null}

    <section className="loan-summary__moments" aria-label="Entrega e devolução">
      <article ref={registerSection('delivery')} tabIndex={-1} aria-labelledby={`${id}-delivery`} data-recorded={Boolean(detail.started_at)}>
        <header><span className="loan-summary__direction" aria-hidden="true">↗</span><h4 id={`${id}-delivery`}>Entrega</h4>{detail.started_at ? <span className="loan-summary__moment-state">Registrada</span> : null}</header>
        <dl><div><dt>Entrega efetiva</dt><dd>{detail.started_at ? formatLoanDate(detail.started_at) : cancelled ? 'Não realizada' : delivered ? 'Data não informada' : 'Aguardando confirmação'}</dd></div>
          <div><dt>Odômetro de entrega</dt><dd>{detail.delivery_odometer_km == null ? 'Não informado' : `${detail.delivery_odometer_km} km`}</dd></div></dl>
      </article>
      <article ref={registerSection('return')} tabIndex={-1} aria-labelledby={`${id}-return`} data-recorded={Boolean(detail.returned_at)}>
        <header><span className="loan-summary__direction" aria-hidden="true">↙</span><h4 id={`${id}-return`}>Devolução</h4>{detail.returned_at ? <span className="loan-summary__moment-state">Registrada</span> : null}</header>
        <dl><div><dt>Devolução efetiva</dt><dd>{detail.returned_at ? formatLoanDate(detail.returned_at) : returned ? 'Data não informada' : cancelled ? 'Não se aplica' : 'Ainda não concluída'}</dd></div>
          {detail.return_odometer_km != null ? <div><dt>Odômetro de devolução</dt><dd>{`${detail.return_odometer_km} km`}</dd></div> : null}
          <div><dt>Prazo previsto</dt><dd>{detail.expected_return_at ? formatLoanDate(detail.expected_return_at) : 'Indeterminado'}</dd></div></dl>
      </article>
    </section>

    <section className="loan-summary__observations" aria-labelledby={`${id}-notes`}><h4 id={`${id}-notes`}>Motivo e condições</h4>
      {note('purpose', 'Motivo', detail.reason, 'Não informado')}
      {note('delivery-note', 'Condições de entrega', detail.delivery_condition, 'Ainda não informadas')}
      {detail.return_condition ? note('return-note', 'Condições de devolução', detail.return_condition) : null}
    </section>

    <details className="loan-summary__units" ref={registerSection('units')}>
      <summary><span><strong>Lotações e responsabilidade</strong><small>Consultar origem, destino e retorno</small></span><AppIcon name="chevron-down" /></summary>
      <dl className="loan-summary__unit-facts"><div><dt>Secretaria de origem</dt><dd>{detail.origin_organization_name}</dd></div><div><dt>Lotação de origem</dt><dd>{detail.origin_allocation_name || 'Não identificada'}</dd></div>
        <div><dt>Secretaria recebedora</dt><dd>{detail.recipient_organization_name}</dd></div><div><dt>Lotação de destino</dt><dd>{detail.destination_allocation_name || 'Não identificada'}</dd></div>
        {detail.return_allocation_id ? <div><dt>Lotação de retorno</dt><dd>{detail.return_allocation_name}</dd></div> : null}</dl>
      {returned ? <p>A devolução foi concluída. A antiga recebedora conserva acesso aos registros até a data de devolução.</p> : null}
    </details>
  </div>
}
