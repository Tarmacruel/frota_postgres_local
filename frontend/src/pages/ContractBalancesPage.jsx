import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { contractControlAPI } from '../api/contractControl'
import { paymentSuppliersAPI } from '../api/paymentProcesses'
import { useAuth } from '../context/AuthContext'
import { useContractControl } from '../hooks/useContractFunding'
import { getApiErrorMessage } from '../utils/apiError'
import PageHeader from '../components/ui/PageHeader'
import IndicatorBar from '../components/ui/IndicatorBar'
import ContractSetupDialog from '../components/contracts/ContractSetupDialog'
import ContractMovementBrowser from '../components/contracts/ContractMovementBrowser'
import ContractCommitmentsBrowser from '../components/contracts/ContractCommitmentsBrowser'
import MaintenanceOrdersPanel from '../components/contracts/MaintenanceOrdersPanel'
import { formatContractMoney as brl } from '../utils/contractBalance'
import PaymentProcessesPage from './PaymentProcessesPage'
import '../styles/contracts-balances.css'

const views = [['overview', 'Visão geral'], ['contracts', 'Contratos'], ['movements', 'Pedidos e movimentações'], ['suppliers', 'Prestadores'], ['payments', 'Faturas e pagamentos']]
const kinds = { FUEL: 'Abastecimento', MAINTENANCE: 'Manutenção veicular' }
const dates = (v) => v ? new Date(v+'T12:00:00').toLocaleDateString('pt-BR') : 'Não informada'

export default function ContractBalancesPage() {
  const mode = useContractControl()
  if (mode.enabled === null) return <p role="status">Carregando acompanhamento contratual…</p>
  if (mode.error) return <div className="alert alert-error" role="alert">{mode.error}</div>
  if (!mode.enabled) return <PaymentProcessesPage />
  return <ContractWorkspace />
}

function ContractWorkspace() {
  const { canEdit, canCreate, canView } = useAuth()
  const manage = canEdit('payment_processes')
  const [params, setParams] = useSearchParams()
  const view = views.some(([key]) => key === params.get('view')) ? params.get('view') : 'overview'
  const kind = params.get('kind') || ''
  const search = params.get('search') || ''
  const indicator = params.get('contract_indicator') || 'total'
  const [data, setData] = useState({ data: [], indicators: {}, totals: {} })
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState(null)
  const [catalog, setCatalog] = useState({ suppliers: [], stations: [] })
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [revision, setRevision] = useState(0)
  const [dialog, setDialog] = useState(null)
  const selectedId = params.get('contract_id') || data.data[0]?.id || ''
  const movementMode = params.get('movement_mode') || 'ledger'
  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([name, value]) => value ? next.set(name, value) : next.delete(name))
    setParams(next)
  }
  function show(type, extra = {}) {
    setDialog({ type, contract: ['contract', 'supplier', 'supplierEdit'].includes(type) ? undefined : detail?.contract,
      requestKey: crypto.randomUUID(), ...extra })
  }
  function refresh() { setRevision((r) => r+1) }
  useEffect(() => {
    let active = true
    Promise.all([paymentSuppliersAPI.list(), contractControlAPI.catalog()]).then(([suppliers, settings]) => {
      if (active) setCatalog({ suppliers: suppliers.data || [], stations: settings.data.stations || [] })
    }).catch((err) => { if (active) setError(getApiErrorMessage(err, 'Não foi possível consultar os cadastros.')) })
    return () => { active = false }
  }, [revision])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    contractControlAPI.contracts({ kind: kind || undefined, search: search || undefined, indicator: indicator === 'total' ? undefined : indicator }).then(({ data: result }) => {
      if (active) setData(result)
    }).catch((err) => { if (active) setError(getApiErrorMessage(err, 'Não foi possível consultar os saldos.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [kind, search, indicator, revision, view])
  useEffect(() => {
    if (!selectedId) { setDetail(null); return undefined }
    let active = true
    setDetailLoading(true); setDetail(null)
    contractControlAPI.detail(selectedId).then(({ data: result }) => { if (active) setDetail(result) })
      .catch((err) => { if (active) setError(getApiErrorMessage(err, 'Não foi possível carregar o contrato.')) })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [selectedId, revision, view])
  const c = detail?.contract
  const items = [
    { key: 'total', label: 'Contratos', value: data.indicators.all || 0 },
    { key: 'opened', label: 'Saldo disponível', value: data.totals.available_balance, unit: 'BRL', tone: 'success' },
    { key: 'reserved', label: 'Reservado em pedidos', value: data.totals.reserved_amount, unit: 'BRL', tone: 'warning' },
    { key: 'consumed', label: 'Consumido desde a abertura', value: data.totals.consumed_since_opening, unit: 'BRL' },
    { key: 'paid', label: 'Pago em faturas', value: data.totals.paid_amount, unit: 'BRL', tone: 'success' },
    { key: 'pending', label: 'A pagar em faturas', value: data.totals.pending_amount, unit: 'BRL', tone: 'warning' },
    { key: 'pending_setup', label: 'Aguardam configuração', value: data.indicators.pending_setup || 0, tone: 'warning' },
    { key: 'divergence', label: 'Com divergência', value: data.indicators.divergence || 0, tone: 'danger' },
    { key: 'low_balance', label: 'Saldo até 10% do inicial', value: data.indicators.low_balance || 0, tone: 'warning' },
    { key: 'expires_30', label: 'Vencem em até 30 dias', value: data.indicators.expires_30 || 0 },
  ]
  function goMovements(mode) { update({ view: 'movements', contract_id: c.id, movement_mode: mode }) }
  async function toggleProvider(provider) {
    setError('')
    try { await contractControlAPI.setProvider(c.id, provider.id, !provider.active); refresh() }
    catch (err) { setError(getApiErrorMessage(err, 'Não foi possível atualizar o vínculo.')) }
  }
  const detailHeader = c ? <>
    <div className="contract-detail__header"><div><small className="muted">{kinds[c.kind] || 'Objeto não informado'} · {c.status === 'ACTIVE' ? 'Ativo' : c.status === 'SUSPENDED' ? 'Suspenso' : 'Encerrado'}</small><h3>Contrato {c.number}</h3><p>{c.supplier_name}</p><p>Vigência: {dates(c.valid_from)} a {dates(c.valid_until)}</p></div>
      {manage ? <button className="secondary-button" onClick={() => show('edit')}>Editar cadastro</button> : null}</div>
    <div className="contract-summary">
      <button onClick={() => goMovements('ledger')}><span>Saldo contratual atual</span><strong>{brl(c.contractual_balance)}</strong><small>Ver composição</small></button>
      <button onClick={() => goMovements('reservations')}><span>Reservado em pedidos</span><strong>{brl(c.reserved_amount)}</strong><small>Ver reservas abertas</small></button>
      <button onClick={() => goMovements('operations')}><span>Consumo desde a abertura</span><strong>{brl(c.consumed_since_opening)}</strong><small>Ver serviços realizados</small></button>
      <button onClick={() => goMovements('ledger')}><span>Disponível para novos pedidos</span><strong>{brl(c.available_balance)}</strong><small>Saldo menos reservas</small></button>
    </div>
    {!c.control_opened ? <div className="contract-setup"><h4>Configure este contrato para liberar pedidos</h4><p>O histórico anterior foi preservado. O saldo inicial precisa ser conferido antes de iniciar os descontos automáticos.</p><ol><li>Confira objeto, empresa e vigência.</li><li>Vincule os postos ou oficinas da rede{c.kind === 'FUEL' ? ' e cadastre os preços dos combustíveis' : ''}.</li><li>Confirme o saldo livre e a data de início do controle.</li></ol>
      {manage ? <button className="app-button" onClick={() => show('opening')}>Conferir saldo inicial</button> : null}</div> : <p className="muted">Controle iniciado em {dates(c.opening_date)} · saldo inicial conferido {brl(c.opening_balance)}.</p>}
    {c.divergence_open ? <div className="alert alert-error"><strong>Novos pedidos bloqueados por divergência.</strong><p>{c.divergence_note}</p>{manage ? <div className="actions-inline"><button className="secondary-button" onClick={() => show('adjust')}>Ajustar saldo</button><button className="secondary-button" onClick={() => show('resolve')}>Regularizar divergência</button></div> : null}</div> : null}
  </> : null
  return <div className="page-shell contract-workspace">
    <PageHeader title="Contratos e saldos" description="Acompanhe os contratos, os pedidos autorizados e o consumo real da frota."
      actions={<>{manage && view !== 'payments' ? <button className="app-button" onClick={() => show('contract')}>Novo contrato</button> : null}<button className="ghost-button" onClick={refresh} disabled={loading}>Atualizar</button></>} />
    <nav className="contract-workspace__tabs" aria-label="Áreas do acompanhamento contratual">{views.map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => update({ view: key })}>{label}</button>)}</nav>
    {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
    {feedback ? <div className="alert alert-success" role="status">{feedback}</div> : null}
    {view === 'payments' ? <div className="contract-embedded"><PaymentProcessesPage key={`${params.get('financial_view')}:${params.get('contract_id')}:${params.get('focus_process')}`} embedded initialView={params.get('financial_view') || 'processes'} initialContractId={params.get('contract_id') || ''} initialProcessId={params.get('focus_process') || ''} /></div> : null}
    {['overview', 'contracts'].includes(view) ? <>
      <div className="contract-toolbar"><input className="app-input" type="search" aria-label="Buscar contrato ou empresa" placeholder="Buscar contrato ou empresa contratada" value={search} onChange={(e) => update({ search: e.target.value, contract_id: '' })} />
        <select className="app-select" aria-label="Objeto do contrato" value={kind} onChange={(e) => update({ kind: e.target.value, contract_id: '', contract_indicator: '' })}><option value="">Todos os objetos</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <IndicatorBar state={{ selected: indicator, metadata: { items }, select: (key) => update({ contract_indicator: key === 'total' || key === indicator ? '' : key, contract_id: '' }) }} loading={loading} error={error} resultCount={data.data.length} />
      <div className="contract-split"><div className="contract-list" aria-label="Contratos do filtro">{data.data.map((contract) => <button className="contract-list__row" key={contract.id} aria-pressed={selectedId === contract.id} onClick={() => update({ contract_id: contract.id })}>
        <small>{kinds[contract.kind] || 'Sem objeto'}</small><strong>{contract.number}</strong><small>{contract.supplier_name}</small><div className="contract-list__balance"><small>Disponível</small><strong>{brl(contract.available_balance)}</strong></div>
        {!contract.control_opened ? <small>Saldo inicial pendente de confirmação</small> : null}{contract.divergence_open ? <small className="form-error">Divergência — pedidos bloqueados</small> : null}
      </button>)}{!loading && !data.data.length ? <p className="contract-empty">Nenhum contrato neste filtro.</p> : null}</div>
        <section className="contract-detail" aria-label="Acompanhamento do contrato selecionado">
          {detailLoading ? <p role="status">Carregando contrato…</p> : detailHeader}
          {c ? <>
            <div className="actions-inline">{c.control_opened && !c.divergence_open && canCreate(c.kind === 'FUEL' ? 'fuel_supply_orders' : 'maintenance') ? <Link className="app-button" to={`${c.kind === 'FUEL' ? '/abastecimentos' : '/manutencoes'}?action=create&contract_id=${c.id}`}>{c.kind === 'FUEL' ? 'Novo pedido de abastecimento' : 'Novo pedido de manutenção'}</Link> : null}
              {manage ? <><button className="secondary-button" onClick={() => show('amend')}>Registrar aditivo</button>{c.control_opened ? <button className="ghost-button" onClick={() => show('adjust')}>Ajustar saldo</button> : null}</> : null}
              <button className="ghost-button" onClick={() => update({ view: 'payments', financial_view: 'contractManagement', contract_id: c.id, indicator: '' })}>Histórico e projeções</button></div>
            <section className="contract-detail__section"><div className="contract-order-panel__heading"><h4>Rede executante</h4>{manage ? <button className="secondary-button" onClick={() => show('provider')}>Vincular prestador</button> : null}</div>
              {(detail.providers || []).map((p) => <div className="contract-order-panel__heading" key={p.id}><span><strong>{p.station_name || p.name}</strong>{p.station_name ? <small className="muted"> · {p.name}</small> : null}<small> · {p.active ? 'Ativo' : 'Inativo'}</small></span>{manage ? <button className="ghost-button" onClick={() => toggleProvider(p)}>{p.active ? 'Desativar vínculo' : 'Reativar vínculo'}</button> : null}</div>)}
              {!detail.providers?.length ? <p className="muted">Nenhum posto ou oficina vinculado.</p> : null}</section>
            {c.kind === 'FUEL' ? <section className="contract-detail__section"><div className="contract-order-panel__heading"><h4>Preços por posto e combustível</h4>{manage ? <button className="secondary-button" disabled={!detail.providers?.some((p) => p.active)} onClick={() => show('price')}>Novo preço</button> : null}</div>
              <div className="table-wrap"><table className="data-table contract-table"><thead><tr><th>Posto / combustível</th><th>Preço por litro</th><th>Vigência</th></tr></thead><tbody>{(detail.prices || []).map((p) => <tr key={p.id}><td data-label="Posto / combustível">{p.station_name || p.provider_name}<small>{p.fuel_type}</small></td><td data-label="Preço por litro">{Number(p.unit_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 6 })}</td><td data-label="Vigência">{new Date(p.valid_from).toLocaleString('pt-BR')}<small>{p.valid_until ? `Até ${new Date(p.valid_until).toLocaleString('pt-BR')}` : 'Sem encerramento programado'}</small></td></tr>)}{!detail.prices?.length ? <tr><td colSpan={3} className="contract-empty">Cadastre o preço para calcular as reservas dos pedidos.</td></tr> : null}</tbody></table></div></section> : null}
            <section className="contract-detail__section"><h4>Pagamentos vinculados</h4><div className="contract-summary"><button onClick={() => update({ view: 'payments', financial_view: 'processes', contract_id: c.id, indicator: 'paid_amount' })}><span>Pago em faturas</span><strong>{brl(c.paid_amount)}</strong></button><button onClick={() => update({ view: 'payments', financial_view: 'processes', contract_id: c.id, indicator: 'pending_amount' })}><span>A pagar em faturas</span><strong>{brl(c.pending_amount)}</strong></button></div><p className="muted">Os pagamentos acompanham a tramitação financeira e não descontam novamente os serviços já consumidos.</p></section>
            <details><summary>Aditivos e dados do contrato</summary><p>{c.object_description || c.contract_type || 'Objeto conforme cadastro contratual.'}</p><p>{c.notes}</p>{c.amendments?.map((a) => <p key={a.id}><strong>Aditivo {a.number || 'sem número'}</strong> · {brl(a.value_delta)} · {a.valid_until ? `Vigência até ${dates(a.valid_until)}` : 'Sem alteração de vigência'}<br />{a.notes}</p>)}</details>
          </> : null}
        </section></div>
    </> : null}
    {view === 'movements' ? <>
      <label>Contrato<select className="app-select" value={selectedId} onChange={(e) => update({ contract_id: e.target.value })}><option value="">Selecione</option>{data.data.map((row) => <option key={row.id} value={row.id}>{row.number} · {row.supplier_name}</option>)}</select></label>
      {detailLoading ? <p role="status">Carregando contrato…</p> : detailHeader}
      <div className="status-pills" aria-label="Consulta operacional">{[['ledger','Extrato'],['reservations','Reservas abertas'],['operations','Serviços realizados'],...(canView('maintenance') ? [['maintenance','Pedidos de manutenção']] : [])].map(([key,label]) => <button key={key} className={`status-pill ${movementMode === key ? 'active' : ''}`} onClick={() => update({ movement_mode: key })}>{label}</button>)}<Link className="ghost-button" to="/abastecimentos">Abrir abastecimentos</Link></div>
      {c && movementMode === 'ledger' ? <ContractMovementBrowser key={c.id} contract={c} providers={detail.providers} revision={revision} /> : null}
      {c && ['reservations','operations'].includes(movementMode) ? <ContractCommitmentsBrowser key={`${c.id}:${movementMode}`} contract={c} providers={detail.providers} mode={movementMode} revision={revision} /> : null}
      {movementMode === 'maintenance' && canView('maintenance') ? <MaintenanceOrdersPanel contractId={c?.id || selectedId} onChange={refresh} /> : null}
    </> : null}
    {view === 'suppliers' ? <section className="contract-detail"><div className="contract-order-panel__heading"><div><h3>Empresas e prestadores executantes</h3><p className="muted">Cadastre empresas contratadas, oficinas e prestadores. Os vínculos da rede são definidos em cada contrato.</p></div>{manage ? <button className="app-button" onClick={() => show('supplier')}>Novo prestador</button> : null}</div>
      <div className="table-wrap"><table className="data-table contract-table"><thead><tr><th>Nome / razão social</th><th>CNPJ</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{catalog.suppliers.map((s) => <tr key={s.id}><td data-label="Nome / razão social">{s.name}</td><td data-label="CNPJ">{s.cnpj || 'Não informado'}</td><td data-label="Situação">{s.active ? 'Ativo' : 'Inativo'}</td><td data-label="Ações">{manage ? <button className="ghost-button" onClick={() => show('supplierEdit', { supplier: s })}>Editar</button> : null}</td></tr>)}</tbody></table></div></section> : null}
    <p className="muted">Homologação: a cópia diária das 06h reinicia os cadastros e os pedidos exclusivos dos testes.</p>
    {dialog ? <ContractSetupDialog key={`${dialog.type}:${dialog.contract?.id || dialog.supplier?.id || 'new'}`} dialog={dialog} suppliers={catalog.suppliers} stations={catalog.stations} providers={detail?.providers || []}
      onClose={() => setDialog(null)} onSuccess={(result, type) => { setFeedback('Dados salvos. O acompanhamento foi atualizado.'); refresh(); if (type === 'contract') update({ contract_id: result.id, view: 'contracts', contract_indicator: '' }) }} /> : null}
  </div>
}
