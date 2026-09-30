import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { vehicleLoansAPI } from '../api/vehicleLoans'
import { LoanActionForm, LoanProposalForm } from '../components/VehicleLoanForms'
import Pagination from '../components/Pagination'
import VehicleLoanDocuments from '../components/VehicleLoanDocuments'
import VehicleLoanRegularization from '../components/VehicleLoanRegularization'
import { getApiErrorMessage } from '../utils/apiError'
import { availableLoanActions, blockedLoanAction, canRepresent, formatLoanDate, loanEventLabels, loanStatuses } from '../utils/vehicleLoans'
import './VehicleLoansPage.css'
import { LOANS_CHANGED_EVENT } from '../hooks/usePendingVehicleLoans'

const emptyCatalog = { vehicles: [], organizations: [], allocations: [] }
const ended = ['RETURNED', 'REJECTED', 'CANCELLED']

export default function VehicleLoansPage() {
  const { user, canCreate, canEdit, canView } = useAuth()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id') || ''
  const [catalog, setCatalog] = useState(emptyCatalog)
  const [catalogError, setCatalogError] = useState('')
  const [catalogReady, setCatalogReady] = useState(false)
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ pages: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [direction, setDirection] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [detail, setDetail] = useState(null)
  const [context, setContext] = useState(null)
  const [events, setEvents] = useState([])
  const [detailError, setDetailError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [feedback, setFeedback] = useState('')
  const catalogRequest = useRef(0)

  async function loadCatalog() {
    const request = ++catalogRequest.current
    setCatalogReady(false); setCatalogError('')
    try {
      const { data } = await vehicleLoansAPI.catalog()
      if (request === catalogRequest.current) { setCatalog(data); setCatalogReady(true) }
    } catch (err) { if (request === catalogRequest.current) setCatalogError(getApiErrorMessage(err)) }
  }
  useEffect(() => {
    loadCatalog()
    return () => { catalogRequest.current += 1 }
  }, [])

  useEffect(() => {
    let current = true
    setLoading(true); setListError('')
    vehicleLoansAPI.list({ page, limit: 20, status: status || undefined, direction: direction || undefined, search: appliedSearch || undefined })
      .then(({ data }) => { if (current) { setRows(data.data); setPagination(data.pagination) } })
      .catch((err) => { if (current) { setRows([]); setListError(getApiErrorMessage(err)) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [page, status, direction, appliedSearch, revision])

  useEffect(() => {
    let current = true
    setDetail(null); setContext(null); setEvents([]); setDetailError('')
    if (!selectedId) { setDetailLoading(false); return () => { current = false } }
    setDetailLoading(true)
    Promise.all([vehicleLoansAPI.get(selectedId), vehicleLoansAPI.context(selectedId), vehicleLoansAPI.events(selectedId)])
      .then(([record, situation, history]) => {
        if (!current) return
        setDetail(record.data); setEvents(history.data)
        if (record.data.version === situation.data.version) setContext(situation.data)
        else setDetailError('O empréstimo mudou durante a consulta. Atualize antes de continuar.')
      })
      .catch((err) => { if (current) setDetailError(getApiErrorMessage(err)) })
      .finally(() => { if (current) setDetailLoading(false) })
    return () => { current = false }
  }, [selectedId, revision])

  function refresh() { setModal(null); setRevision((value) => value + 1); loadCatalog() }
  function saved(record) {
    window.dispatchEvent(new Event(LOANS_CHANGED_EVENT))
    setModal(null); setFeedback('Registro salvo. Consulte a situação e o histórico abaixo.')
    setParams({ id: record.id }); setRevision((value) => value + 1); loadCatalog()
  }
  const editable = detail && canEdit('vehicle_loans') && canRepresent(user, detail, 'origin') && ['DRAFT', 'AWAITING_RECEIPT'].includes(detail.status)
  const actions = detail && canEdit('vehicle_loans') ? availableLoanActions(user, detail) : []
  const orgName = (id) => catalog.organizations.find((item) => item.id === id)?.name || (id === detail?.origin_organization_id ? detail.origin_organization_name : detail?.recipient_organization_name) || 'Secretaria'

  return <div className="vehicle-loans-page">
    <section className="card loan-section">
      <div className="loan-heading"><div><h2>Empréstimos entre secretarias</h2><p>Entrega, recebimento e devolução de veículos. A secretaria de origem permanece no cadastro.</p></div>
        <div className="actions-inline">
          {user.role === 'ADMIN' && canCreate('vehicle_loans') && <button className="ghost-button" onClick={() => { setFeedback(''); setModal('regularization') }}>Regularizar empréstimo anterior</button>}
          {canCreate('vehicle_loans') && <button className="app-button" disabled={!catalogReady} onClick={() => { setFeedback(''); setModal('new') }}>Novo empréstimo</button>}
        </div>
      </div>
      {catalogError && <div role="alert" className="loan-error">{catalogError} <button className="ghost-button" onClick={loadCatalog}>Tentar carregar opções novamente</button></div>}
      {feedback && <p role="status" className="loan-success">{feedback}</p>}
      <form className="loan-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()) }}>
        <label>Placa<input className="app-input" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100} placeholder="Buscar placa" /></label>
        <button className="ghost-button">Buscar</button>
        <label>Situação<select className="app-input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Todas as situações</option>{Object.entries(loanStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {user.role !== 'ADMIN' && <label>Participação<select className="app-input" value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1) }}>
          <option value="">Enviados e recebidos</option><option value="sent">Minha secretaria é a origem</option><option value="received">Minha secretaria é a recebedora</option>
        </select></label>}
        <button type="button" className="ghost-button" onClick={refresh}>Atualizar</button>
      </form>
      {listError && <p role="alert" className="loan-error">{listError}</p>}
      {loading ? <p role="status">Carregando empréstimos…</p> : <>
        <p className="section-copy">{pagination.total} registro(s). Devolvidos, rejeitados e cancelados permanecem no histórico.</p>
        <div className="loan-table-wrap"><table className="loan-table"><thead><tr><th>Veículo</th><th>Origem → recebedora</th><th>Situação</th><th>Prazo</th><th>Consulta</th></tr></thead><tbody>
          {rows.length === 0 && <tr><td colSpan={5}>Nenhum empréstimo encontrado para estes filtros.</td></tr>}
          {rows.map((loan) => <tr key={loan.id} className={loan.id === selectedId ? 'loan-selected' : ''}>
            <td><strong>{loan.vehicle_plate}</strong></td>
            <td>{loan.origin_organization_name}<br /><span aria-label="para">→ </span>{loan.recipient_organization_name}</td>
            <td><span className={`loan-status loan-status-${loan.status}`}>{loanStatuses[loan.status]}</span>{loan.regularized_at && <small className="loan-regularized">Inclusão retroativa</small>}</td>
            <td>{loan.expected_return_at ? formatLoanDate(loan.expected_return_at) : 'Indeterminado'}</td>
            <td><button className="mini-button" onClick={() => { setModal(null); setParams({ id: loan.id }) }} aria-label={`Ver empréstimo de ${loan.vehicle_plate}`}>Ver detalhes</button></td>
          </tr>)}
        </tbody></table></div>
        <Pagination currentPage={page} totalPages={pagination.pages} onPageChange={setPage} />
      </>}
    </section>

    {selectedId && <section className="card loan-section" aria-label="Detalhe do empréstimo">
      <div className="loan-heading"><h2>Detalhes do empréstimo</h2><button className="ghost-button" onClick={() => { setModal(null); setParams({}) }}>Fechar detalhes</button></div>
      {detailLoading && <p role="status">Carregando dados, pendências e histórico…</p>}
      {detailError && <p role="alert" className="loan-error">{detailError} <button className="ghost-button" onClick={refresh}>Recarregar detalhe</button></p>}
      {detail && <>
        <h3>{detail.vehicle_plate} <span className={`loan-status loan-status-${detail.status}`}>{loanStatuses[detail.status]}</span></h3>
        {detail.regularized_at && <div className="loan-notice"><strong>Regularização administrativa registrada em {formatLoanDate(detail.regularized_at)}</strong><p>Referência: {detail.regularization_reference}</p><p>As datas efetivas foram informadas na regularização. Não representam aceites ou assinaturas realizados no passado.</p></div>}
        <div className="loan-actions">
          {editable && <button className="ghost-button" disabled={!catalogReady || !context} onClick={() => setModal('edit')}>Editar proposta</button>}
          {actions.map(([operation, action]) => {
            const blocked = blockedLoanAction(user, detail, action, context)
            return <div key={operation}><button className="app-button" disabled={Boolean(blocked) || !catalogReady} onClick={() => setModal(operation)}>{action.label}</button>{blocked && <small>{blocked}</small>}</div>
          })}
        </div>
        <dl className="loan-facts">
          <div><dt>Secretaria de origem</dt><dd>{detail.origin_organization_name}</dd></div>
          <div><dt>Secretaria recebedora</dt><dd>{detail.recipient_organization_name}</dd></div>
          <div><dt>Lotação de origem</dt><dd>{detail.origin_allocation_name || 'Não identificada'}</dd></div>
          <div><dt>Lotação de destino</dt><dd>{detail.destination_allocation_name}</dd></div>
          <div><dt>Prazo previsto</dt><dd>{detail.expected_return_at ? formatLoanDate(detail.expected_return_at) : 'Indeterminado'}</dd></div>
          <div><dt>Entrega efetiva</dt><dd>{formatLoanDate(detail.started_at)}</dd></div>
          <div><dt>Odômetro de entrega</dt><dd>{detail.delivery_odometer_km == null ? 'Não informado' : `${detail.delivery_odometer_km} km`}</dd></div>
          <div><dt>Devolução efetiva</dt><dd>{formatLoanDate(detail.returned_at)}</dd></div>
          {detail.return_allocation_id && <div><dt>Lotação de retorno</dt><dd>{detail.return_allocation_name}</dd></div>}
          {detail.return_odometer_km != null && <div><dt>Odômetro de devolução</dt><dd>{detail.return_odometer_km} km</dd></div>}
        </dl>
        <div className="loan-copy"><strong>Motivo</strong><p>{detail.reason}</p><strong>Condições de entrega</strong><p>{detail.delivery_condition || 'Ainda não informadas'}</p>
          {detail.return_condition && <><strong>Condições de devolução</strong><p>{detail.return_condition}</p></>}
        </div>
        {!ended.includes(detail.status) && context && <div className="loan-notice">
          <strong>Pendências para a troca de responsabilidade</strong>
          <p>Posses abertas: {context.blockers.open_possessions} · Rotas abertas: {context.blockers.open_trips} · Ordens abertas: {context.blockers.open_fuel_orders}</p>
          <p>Referência mínima do odômetro: {context.minimum_odometer_km} km.</p>
          <p>As pendências serão verificadas novamente ao confirmar a ação.</p>
        </div>}

        {detail.status === 'RETURNED' && <p>A devolução foi concluída. A antiga recebedora conserva acesso aos registros até a data de devolução.</p>}
        <div className="actions-inline">
          {canView('possession') && <Link className="ghost-button" to={`/posses?vehicle_id=${detail.vehicle_id}`}>Consultar posses do veículo</Link>}
          {canView('fuel_supplies') && <Link className="ghost-button" to={`/abastecimentos?vehicle_id=${detail.vehicle_id}`}>Consultar abastecimentos do veículo</Link>}
        </div>
        <VehicleLoanDocuments key={`${detail.id}-${detail.version}`} loanId={detail.id} regularized={Boolean(detail.regularized_at)} />
        <h3>Histórico de ações</h3>
        <ol className="loan-timeline">{events.map((event) => <li key={event.id}>
          <strong>{loanEventLabels[event.event_type] || event.event_type}</strong><span>{formatLoanDate(event.created_at)}</span>
          <p>{event.actor_name || 'Usuário registrado'} · {orgName(event.represented_organization_id)}</p>
          {event.justification && <p className="loan-copy">{event.justification}</p>}
        </li>)}</ol>
      </>}
    </section>}
    {(modal === 'new' || (modal === 'edit' && detail)) && <LoanProposalForm key={modal === 'new' ? 'new' : `${detail.id}-${detail.version}`} loan={modal === 'edit' ? detail : null} catalog={catalog} user={user} onClose={() => setModal(null)} onSaved={saved} onRefresh={refresh} />}
    {modal === 'regularization' && <VehicleLoanRegularization onClose={() => setModal(null)} onSaved={saved} />}
    {modal && !['new', 'edit', 'regularization'].includes(modal) && detail && <LoanActionForm key={`${detail.id}-${detail.version}-${modal}`} operation={modal} loan={detail} context={context} catalog={catalog} user={user} onClose={() => setModal(null)} onSaved={saved} onRefresh={refresh} />}
  </div>
}
