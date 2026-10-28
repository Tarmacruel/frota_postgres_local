import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppIcon } from './AppIcon'
import Modal from './Modal'
import VehicleLoanDocuments from './VehicleLoanDocuments'
import VehicleLoanSummary from './VehicleLoanSummary'
import LoanFeedback from './LoanFeedback'
import { loanFeedback } from '../utils/loanFeedback'
import { ActionMenu, StatusChip, VehicleThumbnail } from './ui'
import { blockedLoanAction, formatLoanDate, getLoanStatusTone, loanEventLabels, loanStatuses } from '../utils/vehicleLoans'

const ended = ['RETURNED', 'REJECTED', 'CANCELLED']
const tabs = [['summary', 'Resumo'], ['documents', 'Documentos'], ['history', 'Histórico']]

export default function VehicleLoanInspector({ detail, context, events, loading, error, catalogError,
  catalogReady, editable, actions = [], user, canView, orgName, onClose, onRefresh, onAction, feedback, returnFocusRef }) {
  const [tab, setTab] = useState('summary')
  const [documentsVisited, setDocumentsVisited] = useState(false)
  const [focusBlockers, setFocusBlockers] = useState(false)
  const blockersRef = useRef(null)
  const guidanceRef = useRef(null)
  const introRef = useRef(null)
  const contentRef = useRef(null)
  const tabRefs = useRef({})
  const id = useId()
  const primary = actions.find(([, action]) => action.handoff)
  const secondary = actions.filter(([operation]) => operation !== primary?.[0])
  const primaryBlocked = primary && detail ? blockedLoanAction(user, detail, primary[1], context) : ''
  const blockerCount = Object.values(context?.blockers || {}).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const active = detail && !ended.includes(detail.status)
  const menuItems = [
    editable && { label: 'Editar proposta', icon: 'catalog', disabled: !catalogReady || !context, onClick: () => onAction('edit') },
    ...secondary.map(([operation, action]) => ({ label: action.label, tone: 'danger',
      disabled: !catalogReady || Boolean(blockedLoanAction(user, detail, action, context)), onClick: () => onAction(operation) })),
  ].filter(Boolean)

  function selectTab(next) {
    setTab(next)
    if (next === 'documents') setDocumentsVisited(true)
    contentRef.current?.scrollTo?.({ top: 0, left: 0 })
  }
  function navigateTabs(event, index) {
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    selectTab(tabs[next][0]); tabRefs.current[tabs[next][0]]?.focus()
  }
  useEffect(() => {
    if (!focusBlockers || tab !== 'summary') return
    const target = error ? introRef.current : blockerCount > 0 ? blockersRef.current : guidanceRef.current || blockersRef.current
    const checks = target?.querySelector('details')
    if (checks) checks.open = true
    target?.focus({ preventScroll: true })
    target?.scrollIntoView?.({ block: 'nearest' })
    setFocusBlockers(false)
  }, [focusBlockers, tab, blockerCount, error])

  return <Modal open title={detail ? `Empréstimo ${detail.vehicle_plate}` : 'Detalhes do empréstimo'}
    onClose={onClose} returnFocusRef={returnFocusRef} initialFocusRef={introRef} className="loan-inspector" backdropClassName="loan-inspector-backdrop">
    <div ref={introRef} tabIndex={-1} className="loan-inspector__intro">
    {loading && !detail ? <p className="loan-inspector__message" role="status">Carregando dados, pendências e histórico…</p> : null}
    {error ? <div className="loan-inspector__message"><LoanFeedback error={error} readOnly><button type="button" className="ghost-button" onClick={onRefresh}>Recarregar detalhe</button></LoanFeedback></div> : null}
    {detail ? <>
      <div className="loan-inspector__identity">
        <div className="loan-inspector__status"><VehicleThumbnail vehicleType={detail.vehicle_type} plate={detail.vehicle_plate} /><StatusChip tone={getLoanStatusTone(detail.status)}>{loanStatuses[detail.status]}</StatusChip></div>
        <div className="loan-inspector__route"><div><span>Origem</span><strong>{detail.origin_organization_name}</strong></div><span aria-hidden="true">→</span><div><span>Recebedora</span><strong>{detail.recipient_organization_name}</strong></div></div>
      </div>
    </> : null}
    </div>
    {detail ? <>
      {feedback ? <p className="loan-success loan-inspector__message" role="status">{feedback}</p> : null}
      {catalogError ? <div className="loan-inspector__message"><LoanFeedback error={`As opções de operação não estão disponíveis. ${catalogError}`} readOnly><button type="button" className="ghost-button" onClick={onRefresh}>Atualizar opções</button></LoanFeedback></div> : null}
      {active && blockerCount > 0 ? <div className="loan-inspector__attention"><span><strong>{blockerCount} {blockerCount === 1 ? 'pendência aberta' : 'pendências abertas'}</strong><small>Resolva antes de trocar a responsabilidade.</small></span><button type="button" className="ghost-button" onClick={() => { selectTab('summary'); setFocusBlockers(true) }}>Ver pendências</button></div> : null}
      <nav className="loan-inspector__tabs" role="tablist" aria-label="Detalhes do empréstimo">
        {tabs.map(([key, label], index) => <button key={key} type="button" role="tab" id={`${id}-${key}-tab`}
          ref={(node) => { tabRefs.current[key] = node }} aria-selected={tab === key} aria-controls={`${id}-${key}-panel`}
          aria-label={key === 'documents' ? 'Documentos e assinaturas' : label} tabIndex={tab === key ? 0 : -1}
          onClick={() => selectTab(key)} onKeyDown={(event) => navigateTabs(event, index)}>{label}</button>)}
      </nav>
      <div className="loan-inspector__content" ref={contentRef}>
        {tab === 'summary' ? <section role="tabpanel" tabIndex={0} id={`${id}-summary-panel`} aria-labelledby={`${id}-summary-tab`}>
          <VehicleLoanSummary detail={detail} events={events} onDocuments={() => selectTab('documents')}>
          {primaryBlocked && !error && loanFeedback(primaryBlocked).target !== 'operations' ? <div ref={guidanceRef} tabIndex={-1}><LoanFeedback error={primaryBlocked} tone="warning">{loanFeedback(primaryBlocked).target === 'refresh' ? <button type="button" className="ghost-button" onClick={onRefresh}>Atualizar dados do empréstimo</button> : null}</LoanFeedback></div> : null}
          {active && context ? <section ref={blockersRef} tabIndex={-1} className="loan-inspector__checks" data-attention={blockerCount > 0} aria-label="Pendências para a troca de responsabilidade">
            <details open={blockerCount > 0 || undefined}>
            <summary className="loan-inspector__checks-heading"><span>Conferência operacional<strong>{blockerCount ? `${blockerCount} pendência(s)` : 'Sem pendências'}</strong></span><AppIcon name="chevron-down" /></summary>
            <div className="loan-inspector__checks-body">
            <h4>Pendências para a troca de responsabilidade</h4>
            <dl className="loan-inspector__counts"><div><dt>Posses abertas</dt><dd>{context.blockers?.open_possessions || 0}</dd></div><div><dt>Rotas abertas</dt><dd>{context.blockers?.open_trips || 0}</dd></div><div><dt>Ordens abertas</dt><dd>{context.blockers?.open_fuel_orders || 0}</dd></div></dl>
            <p>Referência mínima do odômetro: {context.minimum_odometer_km} km.</p><p>As pendências serão verificadas novamente ao confirmar a ação.</p>
            {blockerCount > 0 ? <p className="loan-editor__hint">Conclua ou corrija as operações aplicáveis antes da troca. Confira as rotas no menu da posse correspondente e, depois, atualize os dados deste empréstimo. Se não tiver acesso, peça a conferência à gestão.</p> : null}
            <div className="actions-inline">{canView('possession') && <Link className="ghost-button" to={`/posses?vehicle_id=${detail.vehicle_id}`}>Consultar posses do veículo</Link>}{canView('fuel_supply_orders') && <Link className="ghost-button" to={`/abastecimentos?view=open&vehicle_id=${detail.vehicle_id}`}>Consultar ordens abertas</Link>}{blockerCount > 0 ? <button type="button" className="ghost-button" onClick={onRefresh}>Atualizar conferência</button> : null}</div>
            </div></details>
          </section> : null}
          </VehicleLoanSummary>
          <div className="actions-inline">{canView('possession') && (!active || !context) && <Link className="ghost-button" to={`/posses?vehicle_id=${detail.vehicle_id}`}>Consultar posses do veículo</Link>}{canView('fuel_supplies') && <Link className="ghost-button" to={`/abastecimentos?vehicle_id=${detail.vehicle_id}`}>Consultar abastecimentos do veículo</Link>}</div>
        </section> : null}
        {documentsVisited || tab === 'documents' ? <section className="loan-inspector__panel" role="tabpanel" hidden={tab !== 'documents'} tabIndex={0} id={`${id}-documents-panel`} aria-labelledby={`${id}-documents-tab`}>
          <VehicleLoanDocuments key={`${detail.id}-${detail.version}`} loanId={detail.id} regularized={Boolean(detail.regularized_at)} />
        </section> : null}
        {tab === 'history' ? <section role="tabpanel" tabIndex={0} id={`${id}-history-panel`} aria-labelledby={`${id}-history-tab`}>
          <h4>Histórico de ações</h4>{!events.length ? <p className="muted">Nenhuma ação registrada neste empréstimo.</p> : <ol className="loan-timeline">{events.map((event) => <li key={event.id}><strong>{loanEventLabels[event.event_type] || event.event_type}</strong><span>{formatLoanDate(event.created_at)}</span><p>{event.actor_name || 'Usuário registrado'} · {orgName(event.represented_organization_id)}</p>{event.justification ? <p className="loan-copy">{event.justification}</p> : null}</li>)}</ol>}
        </section> : null}
      </div>
    </> : null}
    <footer className="loan-inspector__footer">
      <div className="loan-inspector__action-note">{primaryBlocked || (!catalogReady && detail ? 'Atualize as opções antes de continuar.' : '')}{primaryBlocked ? <button type="button" className="loan-summary__text-action" onClick={() => { selectTab('summary'); setFocusBlockers(true) }}>Como resolver</button> : null}</div>
      <div className="loan-inspector__footer-actions">
        {menuItems.length ? <ActionMenu label={`Mais ações do empréstimo de ${detail.vehicle_plate}`} items={menuItems} /> : null}
        {primary ? <button type="button" className="app-button" disabled={Boolean(primaryBlocked) || !catalogReady} onClick={() => onAction(primary[0])}>{primary[1].label}</button>
          : <button type="button" className="secondary-button" onClick={onClose}>Fechar detalhes</button>}
      </div>
    </footer>
  </Modal>
}
