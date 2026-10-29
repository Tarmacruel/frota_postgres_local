import IndicatorBar from '../components/ui/IndicatorBar'
import { useInteractiveKpis } from '../hooks/useInteractiveKpis'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { vehicleLoansAPI } from '../api/vehicleLoans'
import { LoanActionForm, LoanProposalForm } from '../components/VehicleLoanForms'
import Pagination from '../components/Pagination'
import VehicleLoanInspector from '../components/VehicleLoanInspector'
import VehicleLoanRegularization from '../components/VehicleLoanRegularization'
import LoanFeedback from '../components/LoanFeedback'
import { getApiErrorMessage } from '../utils/apiError'
import { availableLoanActions, canRepresent, formatLoanDate, getLoanStatusTone, loanStatuses } from '../utils/vehicleLoans'
import './VehicleLoansPage.css'
import { LOANS_CHANGED_EVENT } from '../hooks/usePendingVehicleLoans'
import { ResponsiveRecord, MobileFilters, PageHeader, StatusChip, VehicleThumbnail } from '../components/ui'

const emptyCatalog = { vehicles: [], organizations: [], allocations: [] }
export default function VehicleLoansPage() {
  const { selected: indicator, metadata: indicatorMetadata, setMetadata: setIndicators, select: selectIndicator } = useInteractiveKpis()
  useEffect(() => { setPage(1) }, [indicator])

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
  const detailTrigger = useRef(null)
  const listRef = useRef(null)
  const detailPosition = useRef(null)
  const detailWasOpen = useRef(Boolean(selectedId))
  useEffect(() => {
    const wasOpen = detailWasOpen.current
    detailWasOpen.current = Boolean(selectedId)
    if (!wasOpen || selectedId) return undefined
    const trigger = detailTrigger.current
    const list = listRef.current
    const position = detailPosition.current
    const frame = window.requestAnimationFrame(() => {
      const target = trigger && document.contains(trigger) ? trigger : list
      target?.focus({ preventScroll: true })
      if (position) window.scrollTo({ top: position.y, left: position.x, behavior: 'auto' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedId])

  async function refreshVehicleCatalog() {
    const { data } = await vehicleLoansAPI.catalog()
    setCatalog(data)
  }

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
    vehicleLoansAPI.list({ indicator: indicator === 'total' ? undefined : indicator,  page, limit: 20, status: status || undefined, direction: direction || undefined, search: appliedSearch || undefined })
      .then(({ data }) => { if (current) { setRows(data.data); setPagination(data.pagination); setIndicators(data.indicators || null) } })
      .catch((err) => { if (current) { setRows([]); setListError(getApiErrorMessage(err)) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [page, status, direction, appliedSearch, revision, indicator, setIndicators])

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

  function selectDetail(id) {
    setParams((current) => { const next = new URLSearchParams(current); next.set('id', id); return next })
  }
  function openDetail(id, trigger) {
    detailTrigger.current = trigger
    detailPosition.current = { x: window.scrollX, y: window.scrollY }
    setFeedback(''); setModal(null); selectDetail(id)
  }
  function openRowDetail(event, id) {
    if (event.defaultPrevented || event.target.closest('button, a, input, select, textarea, label, summary, [role="button"]') || window.getSelection()?.toString()) return
    openDetail(id, event.currentTarget.querySelector('[data-loan-detail-trigger]') || event.currentTarget)
  }
  function closeDetail() {
    setModal(null)
    setParams((current) => { const next = new URLSearchParams(current); next.delete('id'); return next }, { replace: true })
  }
  function refresh() { setModal(null); setRevision((value) => value + 1); loadCatalog() }
  function saved(record) {
    window.dispatchEvent(new Event(LOANS_CHANGED_EVENT))
    setModal(null); setFeedback('Registro salvo. Consulte a situação e o histórico do empréstimo.')
    selectDetail(record.id); setRevision((value) => value + 1); loadCatalog()
  }
  const editable = detail && canEdit('vehicle_loans') && canRepresent(user, detail, 'origin') && ['DRAFT', 'AWAITING_RECEIPT'].includes(detail.status)
  const actions = detail && canEdit('vehicle_loans') ? availableLoanActions(user, detail) : []
  const orgName = (id) => catalog.organizations.find((item) => item.id === id)?.name || (id === detail?.origin_organization_id ? detail.origin_organization_name : detail?.recipient_organization_name) || 'Secretaria'

  return <div className="vehicle-loans-page operation-module">
    <section ref={listRef} tabIndex={-1} aria-label="Lista de empréstimos" className="card loan-section operation-page operation-page--loans">
      <PageHeader
        title="Empréstimos entre secretarias"
        actions={(
          <>
          {['SUPERUSER', 'ADMIN'].includes(user.role) && canCreate('vehicle_loans') && <button className="ghost-button" onClick={() => { setFeedback(''); setModal('regularization') }}>Regularizar empréstimo anterior</button>}
          {canCreate('vehicle_loans') && <button className="app-button" disabled={!catalogReady} onClick={() => { setFeedback(''); setModal('new') }}>Novo empréstimo</button>}
          </>
        )}
      />
      <LoanFeedback error={catalogError} readOnly><button className="ghost-button" onClick={loadCatalog}>Tentar carregar opções novamente</button></LoanFeedback>
      {!catalogReady && !catalogError ? <p className="loan-editor__hint" role="status">Carregando veículos e lotações para liberar novas propostas…</p> : null}
      {feedback && !selectedId && <p role="status" className="loan-success">{feedback}</p>}
      <form className="loan-filters operation-toolbar" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()) }}>
        <label>Placa<input className="app-input" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100} placeholder="Buscar placa" /></label>
        <button className="ghost-button">Buscar</button>
        <MobileFilters activeCount={[status, direction].filter(Boolean).length}>
        <label>Situação<select className="app-input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Todas as situações</option>{Object.entries(loanStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {user.role !== 'SUPERUSER' && <label>Participação<select className="app-input" value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1) }}>
          <option value="">Enviados e recebidos</option><option value="sent">Minha secretaria é a origem</option><option value="received">Minha secretaria é a recebedora</option>
        </select></label>}
        <button type="button" className="ghost-button" onClick={refresh}>Atualizar</button>
      </MobileFilters>
      </form>
      <LoanFeedback error={listError} readOnly><button type="button" className="ghost-button" onClick={refresh}>Tentar consultar empréstimos novamente</button></LoanFeedback>
      {loading ? <p role="status">Carregando empréstimos…</p> : <>
        <p className="section-copy">{pagination.total} registro(s). Devolvidos, rejeitados e cancelados permanecem no histórico.</p>
        <IndicatorBar state={{ selected: indicator, metadata: indicatorMetadata, select: selectIndicator }} loading={loading} error={listError} resultCount={pagination.total} />
      <div className="loan-table-wrap operation-table-card"><table className="loan-table data-table operation-table"><thead><tr><th>Veículo</th><th>Origem → recebedora</th><th>Situação</th><th>Prazo</th><th>Consulta</th></tr></thead><tbody>
          {rows.length === 0 && <tr><td colSpan={5}>Nenhum empréstimo encontrado para estes filtros.</td></tr>}
          {rows.map((loan) => <ResponsiveRecord key={loan.id} onClick={(event) => openRowDetail(event, loan.id)} className={`loan-open-row ${loan.id === selectedId ? 'loan-selected' : ''}`} label={loan.vehicle_plate} identityLabel="Veículo" statusLabel="Situação" summaryLabels={["Origem → recebedora", "Prazo"]}>
            <td data-label="Veículo"><div className="operation-vehicle-identity"><VehicleThumbnail vehicleType={loan.vehicle_type} plate={loan.vehicle_plate} /><span><strong>{loan.vehicle_plate}</strong></span></div></td>
            <td data-label="Origem → recebedora">{loan.origin_organization_name}<br /><span aria-label="para">→ </span>{loan.recipient_organization_name}</td>
            <td data-label="Situação"><StatusChip tone={getLoanStatusTone(loan.status)}>{loanStatuses[loan.status]}</StatusChip>{loan.regularized_at && <small className="loan-regularized">Inclusão retroativa</small>}</td>
            <td data-label="Prazo">{loan.expected_return_at ? formatLoanDate(loan.expected_return_at) : 'Indeterminado'}</td>
            <td data-label="Consulta"><button className="mini-button" data-loan-detail-trigger aria-haspopup="dialog" onClick={(event) => openDetail(loan.id, event.currentTarget)} aria-label={`Ver empréstimo de ${loan.vehicle_plate}`}>Ver detalhes</button></td>
          </ResponsiveRecord>)}
        </tbody></table></div>
        <Pagination currentPage={page} totalPages={pagination.pages} onPageChange={setPage} />
      </>}
    </section>

    {selectedId && <VehicleLoanInspector key={selectedId} detail={detail} context={context} events={events}
      loading={detailLoading} error={detailError} catalogError={catalogError} catalogReady={catalogReady}
      editable={editable} actions={actions} user={user} canView={canView} orgName={orgName}
      onClose={closeDetail} onRefresh={refresh} onAction={setModal} feedback={feedback} returnFocusRef={detailTrigger} />}
    {(modal === 'new' || (modal === 'edit' && detail)) && <LoanProposalForm onVehicleOptionsOpen={refreshVehicleCatalog} key={modal === 'new' ? 'new' : `${detail.id}-${detail.version}`} loan={modal === 'edit' ? detail : null} catalog={catalog} user={user} onClose={() => setModal(null)} onSaved={saved} onRefresh={refresh} canView={canView} />}
    {modal === 'regularization' && <VehicleLoanRegularization onClose={() => setModal(null)} onSaved={saved} canView={canView} user={user} />}
    {modal && !['new', 'edit', 'regularization'].includes(modal) && detail && <LoanActionForm key={`${detail.id}-${detail.version}-${modal}`} operation={modal} loan={detail} context={context} catalog={catalog} user={user} onClose={() => setModal(null)} onSaved={saved} onRefresh={refresh} onEdit={editable ? () => setModal('edit') : undefined} canView={canView} />}
  </div>
}
