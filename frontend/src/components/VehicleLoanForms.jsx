import JustificationField from './JustificationField'
import { useRef, useState } from 'react'
import Modal from './Modal'
import VehicleLoanSelect from './VehicleLoanSelect'
import { vehicleLoansAPI } from '../api/vehicleLoans'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'
import { blockedLoanAction, loanActions } from '../utils/vehicleLoans'

function Reason({ value, onChange, required, context, userId }) {
  return <div className="loan-field">
    <JustificationField label={`Justificativa ${required ? '(obrigatória)' : '(opcional)'}`} context={context} userId={userId} className="app-input" value={value} onChange={(e) => onChange(e.target.value)} required={required} minLength={8} maxLength={1000} rows={3} />
  </div>
}

export function LoanProposalForm({ loan, catalog, user, onClose, onSaved, onRefresh }) {
  const [form, setForm] = useState({
    vehicle_id: loan?.vehicle_id || '', destination_allocation_id: loan?.destination_allocation_id || '',
    recipient: loan?.recipient_organization_id || '', reason: loan?.reason || '',
    delivery_odometer_km: loan?.delivery_odometer_km ?? '', delivery_condition: loan?.delivery_condition || '',
    expected_return_at: toDateTimeLocalValue(loan?.expected_return_at), justification: '',
  })
  const [indefinite, setIndefinite] = useState(!loan?.expected_return_at)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const sending = useRef(false)
  const vehicle = catalog.vehicles.find((item) => item.id === form.vehicle_id)
  const owner = loan?.origin_organization_id || vehicle?.owner_organization_id
  const ownerName = catalog.organizations.find((item) => item.id === owner)?.name || loan?.origin_organization_name
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))

  async function save(event) {
    event.preventDefault()
    if (sending.current || stale || !owner) return
    if (!form.recipient || !catalog.allocations.some((item) => item.id === form.destination_allocation_id && item.organization_id === form.recipient)) {
      setError('Selecione a secretaria recebedora e uma lotação de destino na lista de resultados.')
      return
    }
    sending.current = true
    setBusy(true)
    setError('')
    try {
      const body = {
        acting_organization_id: owner, destination_allocation_id: form.destination_allocation_id,
        reason: form.reason.trim(), delivery_condition: form.delivery_condition.trim() || null,
        delivery_odometer_km: form.delivery_odometer_km === '' ? null : form.delivery_odometer_km,
        expected_return_at: indefinite ? null : new Date(form.expected_return_at).toISOString(),
        ...(form.justification.trim() ? { justification: form.justification.trim() } : {}),
      }
      const response = loan
        ? await vehicleLoansAPI.update(loan.id, { ...body, expected_version: loan.version })
        : await vehicleLoansAPI.create({ ...body, vehicle_id: form.vehicle_id })
      onSaved(response.data)
    } catch (err) {
      setError(getApiErrorMessage(err))
      if (err.response?.status === 409) setStale(true)
    } finally { sending.current = false; setBusy(false) }
  }

  return <Modal open title={loan ? 'Editar proposta de empréstimo' : 'Novo empréstimo entre secretarias'} onClose={onClose} canClose={!busy}>
    <form onSubmit={save} className="loan-form">
      <p>Salve a proposta e revise os dados antes de enviar. A responsabilidade muda somente após o aceite da recebedora.</p>
      {loan?.status === 'AWAITING_RECEIPT' && <p className="loan-notice">Editar esta proposta retorna o empréstimo ao rascunho. Será necessário enviar novamente.</p>}
      {error && <p role="alert" className="loan-error">{error}</p>}
      <fieldset disabled={busy || stale}>
        {loan ? <p><strong>Veículo:</strong> {loan.vehicle_plate}</p> : <VehicleLoanSelect label="Veículo"
          value={form.vehicle_id} options={catalog.vehicles} disabled={busy || stale}
          placeholder="Selecione um veículo da origem" searchPlaceholder="Buscar por placa, marca ou modelo"
          onChange={(value) => setForm((prev) => ({ ...prev, vehicle_id: value, recipient: '', destination_allocation_id: '', delivery_odometer_km: '', delivery_condition: '' }))} />}
        {!loan && !catalog.vehicles.length && <p role="status">Nenhum veículo disponível para proposta. Confira a origem, a lotação atual e os empréstimos em andamento.</p>}
        <p><strong>Secretaria de origem:</strong> {ownerName || 'Selecione o veículo'}</p>
        <VehicleLoanSelect label="Secretaria recebedora" value={form.recipient}
          options={catalog.organizations.filter((item) => item.id !== owner)} disabled={!owner || busy || stale}
          placeholder="Selecione a recebedora" searchPlaceholder="Buscar secretaria"
          onChange={(value) => setForm((prev) => ({ ...prev, recipient: value, destination_allocation_id: '' }))} />
        <VehicleLoanSelect label="Lotação de destino" value={form.destination_allocation_id}
          options={catalog.allocations.filter((item) => item.organization_id === form.recipient)} disabled={!form.recipient || busy || stale}
          placeholder="Selecione a lotação de destino" searchPlaceholder="Buscar lotação de destino"
          onChange={(value) => change('destination_allocation_id', value)} />
        <label className="loan-field">Motivo do empréstimo<textarea className="app-input" required minLength={8} maxLength={2000} value={form.reason} onChange={(e) => change('reason', e.target.value)} rows={3} /></label>
        <label><input type="checkbox" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} /> Prazo indeterminado</label>
        {!indefinite && <label className="loan-field">Previsão de devolução<input className="app-input" type="datetime-local" required value={form.expected_return_at} onChange={(e) => change('expected_return_at', e.target.value)} /></label>}
        <p className="section-copy">A previsão não devolve o veículo automaticamente.</p>
        <label className="loan-field">Odômetro de entrega (km)<input className="app-input" type="number" min="0" step="0.1" value={form.delivery_odometer_km} onChange={(e) => change('delivery_odometer_km', e.target.value)} /></label>
        <label className="loan-field">Condições de entrega<textarea className="app-input" minLength={3} maxLength={2000} value={form.delivery_condition} onChange={(e) => change('delivery_condition', e.target.value)} rows={3} /></label>
        <p className="section-copy">Odômetro e condições são obrigatórios para enviar a proposta.</p>
        {user.role === 'ADMIN' && <>
          <p>Você representa <strong>{ownerName || 'a secretaria de origem'}</strong> nesta ação.</p>
          <Reason context={loan ? "loan_proposal" : "loan_create"} userId={user.id} required value={form.justification} onChange={(value) => change('justification', value)} />
        </>}
      </fieldset>
      <div className="actions-inline">
        <button className="app-button" disabled={busy || stale || !owner}>{busy ? 'Salvando…' : 'Salvar rascunho'}</button>
        {stale && <button type="button" className="ghost-button" onClick={onRefresh}>Recarregar dados e revisar</button>}
      </div>
    </form>
  </Modal>
}

export function LoanActionForm({ operation, loan, context, catalog, user, onClose, onSaved, onRefresh }) {
  const action = loanActions[operation]
  const [justification, setJustification] = useState('')
  const [allocation, setAllocation] = useState(loan.origin_allocation_id || '')
  const [odometer, setOdometer] = useState(context?.minimum_odometer_km ?? '')
  const [condition, setCondition] = useState('')
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState('')
  const sending = useRef(false)
  const blocked = blockedLoanAction(user, loan, action, context)
  const returnRequest = operation === 'request-return'
  const represented = loan[`${action.side}_organization_name`]
  async function confirm(event) {
    event.preventDefault()
    if (sending.current || stale || blocked) return
    if (returnRequest && !catalog.allocations.some((item) => item.id === allocation && item.organization_id === loan.origin_organization_id)) {
      setError('Selecione uma lotação de retorno na lista de resultados.')
      return
    }
    sending.current = true; setBusy(true); setError('')
    try {
      const { data } = await vehicleLoansAPI.act(loan.id, operation, {
        expected_version: loan.version, acting_organization_id: loan[`${action.side}_organization_id`],
        ...(justification.trim() ? { justification: justification.trim() } : {}),
        ...(returnRequest ? { return_allocation_id: allocation, return_odometer_km: odometer, return_condition: condition.trim() } : {}),
      })
      onSaved(data)
    } catch (err) {
      setError(getApiErrorMessage(err))
      if (err.response?.status === 409) setStale(true)
    } finally { sending.current = false; setBusy(false) }
  }
  return <Modal open title={action.label} onClose={onClose} canClose={!busy}>
    <form className="loan-form" onSubmit={confirm}>
      <p><strong>{loan.vehicle_plate}</strong> · {loan.origin_organization_name} → {loan.recipient_organization_name}</p>
      <p>Secretaria representada: <strong>{represented}</strong></p>
      {operation === 'accept' && <p>Ao confirmar, o veículo passa a ser operado pela recebedora e permanece pertencendo à origem.</p>}
      {operation === 'accept-return' && <p>Ao confirmar, a responsabilidade operacional volta à origem. O histórico do empréstimo será preservado.</p>}
      {action.reason && <p>A justificativa ficará registrada no histórico desta ação.</p>}
      {blocked && <p role="alert" className="loan-notice">{blocked}</p>}
      {error && <p role="alert" className="loan-error">{error}</p>}
      <fieldset disabled={busy || stale || Boolean(blocked)}>
        {returnRequest && <>
          <VehicleLoanSelect label="Lotação de retorno" value={allocation} onChange={setAllocation}
            options={catalog.allocations.filter((item) => item.organization_id === loan.origin_organization_id)}
            disabled={busy || stale || Boolean(blocked)} placeholder="Selecione a lotação de retorno" searchPlaceholder="Buscar lotação de retorno" />
          <label className="loan-field">Odômetro de devolução (km)<input className="app-input" type="number" required min={context?.minimum_odometer_km ?? 0} step="0.1" value={odometer} onChange={(e) => setOdometer(e.target.value)} /></label>
          <p>Referência mínima: {context?.minimum_odometer_km ?? '—'} km. Confira o valor no veículo.</p>
          <label className="loan-field">Condições de devolução<textarea className="app-input" required minLength={3} maxLength={2000} value={condition} onChange={(e) => setCondition(e.target.value)} rows={3} /></label>
        </>}
        <Reason context={`loan_${operation}`} userId={user.id} required={user.role === 'ADMIN' || action.reason} value={justification} onChange={setJustification} />
      </fieldset>
      <button className="app-button" disabled={busy || stale || Boolean(blocked)}>{busy ? 'Processando…' : action.label}</button>
      {stale && <button type="button" className="ghost-button" onClick={onRefresh}>Recarregar dados e revisar</button>}
    </form>
  </Modal>
}
