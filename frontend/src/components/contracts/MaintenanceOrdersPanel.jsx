import MoneyInput from '../MoneyInput'
import { useCallback, useEffect, useRef, useState } from 'react'
import { maintenanceOrdersAPI } from '../../api/contractControl'
import { vehiclesAPI } from '../../api/vehicles'
import { useAuth } from '../../context/AuthContext'
import useContractFunding from '../../hooks/useContractFunding'
import { getApiErrorMessage } from '../../utils/apiError'
import Modal from '../Modal'
import SearchableSelect from '../SearchableSelect'
import IndicatorBar from '../ui/IndicatorBar'
import ContractFundingFields from './ContractFundingFields'
import { formatContractMoney as brl } from '../../utils/contractBalance'
import ContractReturnBanner from './ContractReturnBanner'
import MaintenanceOrderActionDialog from './MaintenanceOrderActionDialog'
import ContractItemLines from './ContractItemLines'
import { itemLinesPayload, itemLinesTotal } from '../../utils/contractItemLines'

const states = { AUTHORIZED: 'Autorizadas', IN_PROGRESS: 'Em execução', COMPLETED: 'Concluídas', CANCELLED: 'Canceladas' }

export function MaintenanceOrderForm({ vehicles = [], onVehicleOptionsOpen, initialContractId = '', returnTo = '', onClose, onSuccess }) {
  const [form, setForm] = useState({ vehicle_id: '', estimated_cost: '', service_description: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [lines, setLines] = useState([])
  const funding = useContractFunding({ kind: 'MAINTENANCE', estimatedCost: form.estimated_cost, maintenanceLines: itemLinesPayload(lines), initialContractId })
  async function submit(event) {
    event.preventDefault()
    if (!funding.ready || !form.vehicle_id) { setError('Confira veículo, oficina, orçamento e saldo antes de autorizar.'); return }
    setSaving(true); setError('')
    try {
      await maintenanceOrdersAPI.create({ ...form, ...funding.payload, provider_id: funding.provider.id, estimated_cost: funding.quantityEnabled ? funding.quote.reserve_amount : form.estimated_cost })
      onSuccess?.('Pedido de manutenção autorizado e saldo reservado.'); onClose?.()
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível autorizar a manutenção.')) }
    finally { setSaving(false) }
  }
  return <form className="contract-form" onSubmit={submit}>
    <ContractReturnBanner returnTo={returnTo} compact saving={saving} />
    {error ? <div className="alert alert-error contract-form__wide" role="alert">{error}<button className="ghost-button" type="button" onClick={funding.refresh}>Atualizar saldo</button></div> : null}
    <label>Veículo<SearchableSelect value={form.vehicle_id} onOpen={onVehicleOptionsOpen} ariaLabel="Veículo para manutenção"
      onChange={(vehicle_id) => setForm((s) => ({ ...s, vehicle_id }))} placeholder="Selecione o veículo"
      options={vehicles.filter((v) => v.can_operate_vehicle !== false).map((v) => ({ value: v.id, label: `${v.plate} · ${v.brand || ''} ${v.model || ''}`, tags: v.tags || [] }))} /></label>
    <label>Orçamento previsto (R$)<MoneyInput className="app-input" aria-label="Orçamento previsto" type="number" min="0.01" step="0.01" required readOnly={funding.quantityEnabled} value={funding.quantityEnabled ? itemLinesTotal(lines) : form.estimated_cost} onChange={(e) => setForm((s) => ({ ...s, estimated_cost: e.target.value }))} /></label>
    <label className="contract-form__wide">Serviço solicitado<textarea className="app-textarea" minLength={10} maxLength={2000} required value={form.service_description} onChange={(e) => setForm((s) => ({ ...s, service_description: e.target.value }))} /></label>
    <ContractFundingFields funding={{...funding,selectContract:(v)=>{setLines([]);funding.selectContract(v)},selectProvider:(v)=>{setLines([]);funding.selectProvider(v)}}} />
    {funding.quantityEnabled && funding.contract && funding.provider ? <ContractItemLines items={funding.items} prices={funding.itemPrices} lines={lines} onChange={setLines} /> : null}
    <div className="actions-inline"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="app-button" disabled={saving || !funding.ready}>{saving ? 'Autorizando…' : 'Autorizar e reservar saldo'}</button></div>
  </form>
}

export default function MaintenanceOrdersPanel({ contractId = '', returnTo = '', hideCreate = false, vehicles: suppliedVehicles, onVehicleOptionsOpen, onChange, refreshKey }) {
  const { canCreate, canEdit } = useAuth()
  const [list, setList] = useState({ data: [], counts: {}, total: 0, pages: 0 })
  const [status, setStatus] = useState('total')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [dialog, setDialog] = useState(null)
  const [vehicles, setVehicles] = useState(suppliedVehicles || [])
  const listRequest = useRef(0)
  const load = useCallback(async () => {
    const request = ++listRequest.current
    setLoading(true); setError('')
    try { const { data } = await maintenanceOrdersAPI.list({ contract_id: contractId || undefined, status: status === 'total' ? undefined : status, page, limit: 10 }); if (request === listRequest.current) setList(data) }
    catch (err) { if (request === listRequest.current) setError(getApiErrorMessage(err, 'Não foi possível consultar os pedidos.')) }
    finally { if (request === listRequest.current) setLoading(false) }
  }, [contractId, status, page])
  useEffect(() => { load(); return () => { listRequest.current += 1 } }, [load, refreshKey])
  async function showCreate() {
    setError('')
    try {
      if (suppliedVehicles) setVehicles(suppliedVehicles)
      else { const { data } = await vehiclesAPI.listOptions(); setVehicles(data || []) }
      setDialog({ action: 'create' })
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível consultar os veículos.')) }
  }
  function showAction(row, action) {
    setDialog({ row, action })
  }
  const metadata = { items: [{ key: 'total', label: 'Pedidos', value: Object.values(list.counts || {}).reduce((a, b) => a+Number(b), 0) },
    ...Object.entries(states).map(([key, label]) => ({ key, label, value: list.counts?.[key] || 0, tone: key === 'AUTHORIZED' ? 'warning' : 'neutral' }))] }
  return <section className="contract-order-panel" aria-label="Pedidos de manutenção">
    <div className="contract-order-panel__heading"><div><h3>Pedidos de manutenção</h3><span className="muted">A autorização reserva o orçamento. O veículo só entra em execução ao iniciar o serviço.</span></div>
      {!hideCreate && canCreate('maintenance') ? <button className="app-button" onClick={showCreate}>Novo pedido</button> : null}</div>
    {error && !dialog ? <div className="alert alert-error" role="alert">{error}</div> : null}
    {feedback ? <div className="alert alert-success" role="status">{feedback}</div> : null}
    <IndicatorBar state={{ selected: status, metadata, select: (value) => { setStatus(value); setPage(1) } }} loading={loading} error={error} resultCount={list.total} />
    <div className="contract-order-list">{loading ? <p className="contract-empty" role="status">Carregando pedidos…</p> : list.data.map((row) => <article className="contract-order-row" key={row.id}>
      <div><strong>{row.vehicle_plate}</strong> <span className="status-badge">{states[row.status]}</span><p>{row.service_description}</p><small>{row.contract_number} · {row.provider_name} · {row.organization_name || 'Sem secretaria'}</small><p>Previsto {brl(row.estimated_cost)}{row.total_cost !== null ? ` · Realizado ${brl(row.total_cost)}` : ''}</p></div>
      <div className="actions-inline">{canEdit('maintenance') && row.status === 'AUTHORIZED' ? <><button className="secondary-button" onClick={() => showAction(row, 'start')}>Iniciar serviço</button><button className="ghost-button" onClick={() => showAction(row, 'cancel')}>Cancelar pedido</button></> : null}
        {canEdit('maintenance') && ['AUTHORIZED', 'IN_PROGRESS'].includes(row.status) ? <button className="app-button" onClick={() => showAction(row, 'complete')}>Concluir</button> : null}</div>
    </article>)}{!loading && !list.data.length ? <p className="contract-empty">Nenhum pedido neste filtro.</p> : null}</div>
    {list.pages > 1 ? <div className="actions-inline"><button className="ghost-button" disabled={page <= 1} onClick={() => setPage(page-1)}>Anterior</button><span>Página {page} de {list.pages}</span><button className="ghost-button" disabled={page >= list.pages} onClick={() => setPage(page+1)}>Próxima</button></div> : null}
    <Modal open={dialog?.action === 'create'} title="Autorizar manutenção" onClose={() => setDialog(null)}>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {dialog?.action === 'create' ? <MaintenanceOrderForm vehicles={vehicles} onVehicleOptionsOpen={onVehicleOptionsOpen} initialContractId={contractId} returnTo={returnTo} onClose={() => setDialog(null)} onSuccess={(message) => { setFeedback(message); load(); onChange?.() }} /> : null}
    </Modal>
    {dialog?.row ? <MaintenanceOrderActionDialog key={`${dialog.row.id}:${dialog.action}`} row={dialog.row} action={dialog.action} onClose={() => setDialog(null)} onSuccess={(message) => { setFeedback(message); load(); onChange?.() }} /> : null}
  </section>
}
