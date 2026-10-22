import { useState } from 'react'
import { contractControlAPI } from '../../api/contractControl'
import useContractFunding from '../../hooks/useContractFunding'
import { getApiErrorMessage } from '../../utils/apiError'
import { toDateTimeLocalValue } from '../../utils/datetime'
import ContractFundingFields from './ContractFundingFields'

export default function FuelOrderFundingForm({ order, onClose, onSuccess }) {
  const [liters, setLiters] = useState(order.requested_liters || '')
  const [expiresAt, setExpiresAt] = useState(() => toDateTimeLocalValue(new Date(Math.max(Date.now(), new Date(order.expires_at).getTime())+24*3600*1000).toISOString()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const funding = useContractFunding({ stationId: order.fuel_station_id, liters })
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await contractControlAPI.fundOrder(order.id, { ...funding.payload, requested_liters: liters, expires_at: new Date(expiresAt).toISOString(), justification: reason })
      onSuccess?.('Ordem vinculada ao contrato, com saldo reservado e prazo atualizado.'); onClose?.()
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível reservar o saldo desta ordem.')) }
    finally { setSaving(false) }
  }
  return <form className="contract-form" onSubmit={submit}>
    <p className="contract-form__wide">Esta ordem foi emitida antes do controle contratual. Confira o contrato e o orçamento para liberar sua utilização.</p>
    {error ? <div className="alert alert-error contract-form__wide" role="alert">{error}</div> : null}
    <label>Litros previstos<input className="app-input" type="number" min=".001" step=".001" required value={liters} onChange={(e) => setLiters(e.target.value)} /></label>
    <label>Prazo da ordem<input className="app-input" type="datetime-local" required value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
    <ContractFundingFields funding={funding} />
    <label className="contract-form__wide">Justificativa do vínculo e prazo<textarea className="app-textarea" minLength={10} maxLength={1000} required value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    <div className="actions-inline"><button className="ghost-button" type="button" disabled={saving} onClick={onClose}>Voltar</button><button className="app-button" disabled={saving || !funding.ready}>{saving ? 'Reservando…' : 'Vincular e reservar saldo'}</button></div>
  </form>
}
