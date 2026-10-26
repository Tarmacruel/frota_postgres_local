import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { contractControlAPI } from '../api/contractControl'
import { paymentSuppliersAPI } from '../api/paymentProcesses'
import { useAuth } from '../context/AuthContext'
import { useContractControl } from '../hooks/useContractFunding'
import { getApiErrorMessage } from '../utils/apiError'
import { contractOrderPath, rememberContractPosition, restoreContractPosition } from '../utils/contractNavigation'
import PageHeader from '../components/ui/PageHeader'
import IndicatorBar from '../components/ui/IndicatorBar'
import ContractSetupDialog from '../components/contracts/ContractSetupDialog'
import ContractAmendmentEditor from '../components/contracts/ContractAmendmentEditor'
import ContractInspector, { ContractMovementContent, ContractPosition, ContractState } from '../components/contracts/ContractInspector'
import { formatContractMoney as brl, contractDate, contractKinds } from '../utils/contractBalance'
import PaymentProcessesPage from './PaymentProcessesPage'
import { appEnvironment } from '../config/environment'
import '../styles/contracts-balances.css'
import '../styles/contract-items.css'

const views = [['contracts', 'Contratos'], ['movements', 'Pedidos e movimentações'], ['payments', 'Faturas e pagamentos'], ['suppliers', 'Prestadores']]
const attention = [['pending_setup', 'Configuração pendente', 'warning'], ['divergence', 'Divergência', 'danger'], ['low_balance', 'Saldo até 10%', 'warning'], ['expires_30', 'Vencem em 30 dias', 'info']]

export default function ContractBalancesPage() {
  const mode = useContractControl()
  if (mode.enabled === null) return <p role="status">Carregando acompanhamento contratual…</p>
  if (mode.error) return <div className="alert alert-error" role="alert">{mode.error}</div>
  if (!mode.enabled) return <PaymentProcessesPage />
  return <ContractWorkspace quantityEnabled={mode.quantityEnabled} />
}

function ContractWorkspace({ quantityEnabled = false }) {
  const { canEdit, canCreate, canView } = useAuth()
  const manage = canEdit('payment_processes')
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const view = views.some(([key]) => key === params.get('view')) ? params.get('view') : 'contracts'
  const kind = params.get('kind') || ''
  const search = params.get('search') || ''
  const indicator = params.get('contract_indicator') || 'total'
  const selectedId = params.get('contract_id') || ''
  const tab = ['summary', 'movements', 'invoices', 'settings'].includes(params.get('contract_tab')) ? params.get('contract_tab') : 'summary'
  const movementMode = ['ledger', 'reservations', 'operations', 'maintenance'].includes(params.get('movement_mode')) ? params.get('movement_mode') : 'ledger'
  const [data, setData] = useState({ data: [], indicators: {}, totals: {} })
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState(null)
  const [selectedReadiness, setSelectedReadiness] = useState(null)
  const [catalog, setCatalog] = useState({ suppliers: [], stations: [] })
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [revision, setRevision] = useState(0)
  const [dialog, setDialog] = useState(null)
  const listCache = useRef('')
  const catalogCache = useRef(-1)
  const returnFocusRef = useRef(null)
  const listNeeded = view === 'contracts' || view === 'movements'
  const detailId = listNeeded ? selectedId : ''
  const catalogNeeded = view === 'suppliers' || Boolean(dialog) || (Boolean(detailId) && tab === 'settings')
  const listKey = JSON.stringify([kind, search, indicator, revision])
  function update(patch, replace = false) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if ('contract_id' in patch && patch.contract_id !== current.get('contract_id')) ['ledger_page', 'operations_page', 'reservations_page'].forEach((name) => next.delete(name))
      Object.entries(patch).forEach(([name, value]) => value ? next.set(name, value) : next.delete(name))
      return next
    }, { replace })
  }
  function show(type, extra = {}) {
    setDialog({ type, contract: ['contract', 'supplier', 'supplierEdit'].includes(type) ? undefined : detail?.contract, requestKey: crypto.randomUUID(), ...extra })
  }
  function refresh() { setRevision((value) => value + 1) }
  useEffect(() => {
    if (!catalogNeeded || catalogCache.current === revision) return undefined
    let active = true
    setCatalogError('')
    Promise.all([paymentSuppliersAPI.list(), contractControlAPI.catalog()]).then(([suppliers, settings]) => {
      if (active) { setCatalog({ suppliers: suppliers.data || [], stations: settings.data.stations || [] }); catalogCache.current = revision }
    }).catch((err) => { if (active) setCatalogError(getApiErrorMessage(err, 'Não foi possível consultar os cadastros.')) })
    return () => { active = false }
  }, [catalogNeeded, revision])
  useEffect(() => {
    if (!listNeeded || listCache.current === listKey) return undefined
    let active = true
    setLoading(true); setError('')
    const timer = setTimeout(() => {
      contractControlAPI.contracts({ kind: kind || undefined, search: search || undefined, indicator: indicator === 'total' ? undefined : indicator }).then(({ data: result }) => {
        if (active) { setData(result); listCache.current = listKey }
      }).catch((err) => { if (active) setError(getApiErrorMessage(err, 'Não foi possível consultar os saldos.')) })
        .finally(() => { if (active) setLoading(false) })
    }, search ? 300 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [listNeeded, listKey, kind, search, indicator])
  useEffect(() => {
    if (!detailId) { setDetail(null); setDetailLoading(false); setDetailError(''); return undefined }
    let active = true
    setDetailLoading(true); setDetail(null); setDetailError('')
    contractControlAPI.detail(detailId).then(({ data: result }) => { if (active) setDetail(result) })
      .catch((err) => { if (active) setDetailError(getApiErrorMessage(err, 'Não foi possível carregar o contrato.')) })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [detailId, revision])
  useEffect(() => {
    if (!loading && (!detailId || !detailLoading)) restoreContractPosition(location.pathname + location.search)
  }, [loading, detailId, detailLoading, location.pathname, location.search])
  const currentDetail = detail?.contract?.id === detailId ? detail : null
  const c = currentDetail?.contract
  const listedRow = data.data.find((item) => item.id === selectedId)
  const row = listedRow || (selectedReadiness?.id === selectedId ? selectedReadiness : null)
  // A configured contract can leave the pending filter while its inspector stays open.
  useEffect(() => {
    if (!c || loading || listedRow) { setSelectedReadiness(null); return undefined }
    let active = true
    contractControlAPI.contracts({ search: c.number }).then(({ data: result }) => {
      if (active) setSelectedReadiness(result.data.find((item) => item.id === c.id) || null)
    }).catch((err) => { if (active) setDetailError(getApiErrorMessage(err, 'Não foi possível conferir a elegibilidade do contrato.')) })
    return () => { active = false }
  }, [c, loading, listedRow, revision])
  const items = [
    { key: 'opened', label: 'Disponível', value: data.totals.available_balance, unit: 'BRL', tone: 'success' },
    { key: 'reserved', label: 'Reservado', value: data.totals.reserved_amount, unit: 'BRL', tone: 'warning' },
    { key: 'consumed', label: 'Consumido', value: data.totals.consumed_since_opening, unit: 'BRL', tone: 'info' },
    { key: 'pending', label: 'A pagar em faturas', value: data.totals.pending_amount, unit: 'BRL', tone: 'warning' },
  ]
  function selectIndicator(key) { update({ contract_indicator: key === 'total' || key === indicator ? '' : key, contract_id: '', contract_tab: '' }) }
  function payments(patch = {}) { update({ view: 'payments', contract_id: c?.id || selectedId, financial_view: 'processes', indicator: '', focus_process: '', ...patch }) }
  function movements(mode) { update({ contract_tab: 'movements', movement_mode: mode }) }
  async function toggleProvider(provider) {
    setDetailError('')
    try { await contractControlAPI.setProvider(c.id, provider.id, !provider.active); refresh() }
    catch (err) { setDetailError(getApiErrorMessage(err, 'Não foi possível atualizar o vínculo.')) }
  }
  const returnTo = location.pathname + location.search
  const orderPath = c ? contractOrderPath(c.kind, c.id, returnTo) : ''
  const onOrder = () => rememberContractPosition(returnTo, selectedId)
  function closeInspector() {
    update({ contract_id: '', contract_tab: '' })
    window.requestAnimationFrame(() => returnFocusRef.current?.focus({ preventScroll: true }))
  }
  return <div className="page-shell contract-workspace contract-workspace--daily">
    <PageHeader title="Contratos e saldos" description="Consulte saldos, resolva pendências e acompanhe os pedidos."
      actions={<>{manage && view === 'contracts' ? <button className="app-button" onClick={() => show('contract')}>Novo contrato</button> : null}<button className="ghost-button" onClick={refresh} disabled={listNeeded && loading}>Atualizar</button></>} />
    <nav className="contract-workspace__tabs" aria-label="Áreas do acompanhamento contratual">{views.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => update({ view: key })}>{label}</button>)}</nav>
    {error && listNeeded ? <div className="alert alert-error" role="alert">{error}<button className="ghost-button" onClick={refresh}>Tentar novamente</button></div> : null}
    {catalogError && catalogNeeded ? <div className="alert alert-error" role="alert">{catalogError}<button className="ghost-button" onClick={refresh}>Tentar novamente</button></div> : null}
    {feedback ? <div className="alert alert-success" role="status">{feedback}</div> : null}
    {view === 'contracts' ? <>
      <div className="contract-toolbar"><input className="app-input" type="search" aria-label="Buscar contrato ou empresa" placeholder="Buscar contrato ou empresa contratada" value={search} onChange={(event) => update({ search: event.target.value, contract_id: '', contract_tab: '' }, true)} />
        <select className="app-select" aria-label="Objeto do contrato" value={kind} onChange={(event) => update({ kind: event.target.value, contract_id: '', contract_tab: '', contract_indicator: '' })}><option value="">Todos os objetos</option>{Object.entries(contractKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <IndicatorBar state={{ selected: indicator, metadata: { items }, select: selectIndicator }} loading={loading} error={error} resultCount={data.data.length} />
      <div className="contract-attention" aria-label="Pendências dos contratos">{attention.map(([key, label, tone]) => <button type="button" key={key} className="contract-attention__filter" data-tone={tone} data-attention={Boolean(data.indicators[key])} aria-pressed={indicator === key} disabled={loading} onClick={() => selectIndicator(key)}>{label}<strong>{loading || error ? '—' : data.indicators[key] || 0}</strong></button>)}
        {indicator !== 'total' ? <button className="ghost-button" onClick={() => selectIndicator('total')}>Todos os contratos</button> : null}</div>
      <div className="contract-table-caption"><span>{loading ? 'Consultando contratos…' : `${data.data.length} contrato(s) neste filtro`}</span><span>{loading || error ? 'Saldo em atualização' : `Saldo apurado em ${data.indicators.opened || 0} de ${data.indicators.all || 0} contratos`} · posição atual</span></div>
      <div className="table-wrap contract-register"><table className="data-table contract-table"><thead><tr><th>Contrato / empresa</th><th>Objeto</th><th>Vigência</th><th>Disponível</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6} className="contract-empty" role="status">Carregando contratos…</td></tr> : data.data.map((contract) => <tr key={contract.id}>
          <td data-label="Contrato / empresa"><button ref={(node) => { if (node && contract.id === selectedId) returnFocusRef.current = node }} className="contract-text-link" aria-label={`Abrir contrato ${contract.number}`} onClick={(event) => { returnFocusRef.current = event.currentTarget; update({ contract_id: contract.id, contract_tab: 'summary' }) }}>{contract.number}</button><small>{contract.supplier_name}</small></td>
          <td data-label="Objeto">{contractKinds[contract.kind] || 'Não informado'}</td><td data-label="Vigência">{contractDate(contract.valid_from)}<small>até {contractDate(contract.valid_until)}</small></td>
          <td data-label="Disponível" className="contract-register__balance">{brl(contract.available_balance)}</td><td data-label="Situação"><ContractState contract={contract} /></td>
          <td data-label="Ações"><button className="ghost-button" aria-label={`Detalhes do contrato ${contract.number}`} onClick={(event) => { returnFocusRef.current = event.currentTarget; update({ contract_id: contract.id, contract_tab: 'summary' }) }}>Abrir</button></td>
        </tr>)}{!loading && !data.data.length ? <tr><td colSpan={6} className="contract-empty">Nenhum contrato neste filtro.</td></tr> : null}
      </tbody></table></div>
    </> : null}
    {view === 'movements' ? <section className="contract-global-movements"><label>Contrato<select className="app-select" value={selectedId} onChange={(event) => update({ contract_id: event.target.value })}><option value="">Selecione o contrato</option>{data.data.map((contract) => <option key={contract.id} value={contract.id}>{contract.number} · {contract.supplier_name}</option>)}</select></label>
      {detailLoading ? <p role="status">Carregando contrato…</p> : detailError ? <p className="alert alert-error" role="alert">{detailError}</p> : c ? <>
        <div className="contract-order-panel__heading"><h3>Contrato {c.number}</h3>{row?.ready && canCreate(c.kind === 'FUEL' ? 'fuel_supply_orders' : 'maintenance') ? <Link className="app-button" to={orderPath} onClick={onOrder}>Novo pedido de {c.kind === 'FUEL' ? 'abastecimento' : 'manutenção'}</Link> : null}<button className="ghost-button" onClick={() => update({ view: 'contracts', contract_tab: 'summary' })}>Detalhes do contrato</button></div>
        <ContractPosition contract={c} onMovements={(mode) => update({ movement_mode: mode })} />
        <ContractMovementContent detail={currentDetail} mode={movementMode} onMode={(mode) => update({ movement_mode: mode })} canViewMaintenance={canView('maintenance')} revision={revision} onChange={refresh} />
      </> : <p className="contract-empty">Selecione um contrato para consultar extrato, reservas e serviços.</p>}
    </section> : null}
    {view === 'payments' ? <div className="contract-embedded"><PaymentProcessesPage key={`${params.get('focus_process')}:${revision}`} embedded initialView={params.get('financial_view') || 'processes'} initialContractId={selectedId} initialProcessId={params.get('focus_process') || ''} initialOperationId={params.get('new_process_operation') || ''} onDraftConsumed={() => update({ new_process_operation: '' }, true)} onContractChange={(value) => update({ contract_id: value, focus_process: '' }, true)} onViewChange={(value) => update({ financial_view: value }, true)} onDataChange={() => { listCache.current = ''; catalogCache.current = -1 }} /></div> : null}
    {view === 'suppliers' ? <section className="contract-detail"><div className="contract-order-panel__heading"><div><h3>Empresas e prestadores executantes</h3><p className="muted">Os vínculos de postos e oficinas são definidos na configuração de cada contrato.</p></div>{manage ? <button className="app-button" onClick={() => show('supplier')}>Novo prestador</button> : null}</div>
      <div className="table-wrap"><table className="data-table contract-table"><thead><tr><th>Nome / razão social</th><th>CNPJ</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{catalog.suppliers.map((supplier) => <tr key={supplier.id}><td data-label="Nome / razão social">{supplier.name}</td><td data-label="CNPJ">{supplier.cnpj || 'Não informado'}</td><td data-label="Situação">{supplier.active ? 'Ativo' : 'Inativo'}</td><td data-label="Ações">{manage ? <button className="ghost-button" onClick={() => show('supplierEdit', { supplier })}>Editar</button> : null}</td></tr>)}</tbody></table></div>
    </section> : null}
    {appEnvironment.isHomologation ? <p className="contract-hml-note">Homologação: a cópia das 06h reinicia os cadastros e os pedidos exclusivos dos testes.</p> : null}
    <ContractInspector open={view === 'contracts' && Boolean(selectedId)} detail={currentDetail} row={row} loading={detailLoading || (!currentDetail && !detailError)} error={detailError} tab={tab} onTab={(value) => update({ contract_tab: value })} onClose={closeInspector}
      onShow={show} onPayments={payments} onMovements={movements} movementMode={movementMode} onMovementMode={(mode) => update({ movement_mode: mode })}
      manage={manage} quantityEnabled={quantityEnabled} canCreateOrder={c ? canCreate(c.kind === 'FUEL' ? 'fuel_supply_orders' : 'maintenance') : false} canViewMaintenance={canView('maintenance')} orderPath={orderPath} onOrder={onOrder} onProviderToggle={toggleProvider} revision={revision} returnFocusRef={returnFocusRef} onRefresh={refresh} />
    {dialog && quantityEnabled && dialog.type === 'amend' ? <ContractAmendmentEditor contract={dialog.contract} providers={detail?.providers || []} onClose={() => setDialog(null)} onSuccess={() => { setFeedback('Alteração registrada. Demonstrativo disponível no histórico.'); refresh() }} /> : dialog ? <ContractSetupDialog key={`${dialog.type}:${dialog.price?.id || dialog.contract?.id || dialog.supplier?.id || 'new'}`} dialog={dialog} suppliers={catalog.suppliers} stations={catalog.stations} providers={detail?.providers || []} onClose={() => setDialog(null)} onSuccess={(result, type) => {
      setFeedback(type === 'priceDelete' ? 'Preço excluído. Reservas e abastecimentos anteriores foram preservados.' : 'Dados salvos. O acompanhamento foi atualizado.'); refresh()
      if (type === 'contract') update({ contract_id: result.id, view: 'contracts', contract_tab: 'settings', contract_indicator: '' })
    }} /> : null}
  </div>
}
