import { useRef, useState } from 'react'
import JustificationField from './JustificationField'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { getApiErrorMessage } from '../utils/apiError'

export default function FuelSupplyOrderCancelForm({ order, onSaved, onClose, onBusy }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sending = useRef(false)
  async function submit(event) {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setBusy(true); onBusy(true); setError('')
    try {
      await fuelSupplyOrdersAPI.cancel(order.id, { reason: reason.trim() || null })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível cancelar a ordem de abastecimento.'))
      return
    } finally { sending.current = false; setBusy(false); onBusy(false) }
    onSaved()
  }
  return <form onSubmit={submit}>
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    <label htmlFor="order-cancel-reason">Motivo do cancelamento (opcional)</label>
    <JustificationField context="order_cancel" id="order-cancel-reason" className="app-textarea" rows={3}
      maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />
    <div className="actions-inline modal-actions">
      <button type="button" className="ghost-button" disabled={busy} onClick={onClose}>Voltar</button>
      <button type="submit" className="app-button" disabled={busy}>{busy ? 'Cancelando...' : 'Confirmar cancelamento'}</button>
    </div>
  </form>
}
