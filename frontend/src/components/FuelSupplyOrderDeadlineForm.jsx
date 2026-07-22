import { useMemo, useState } from 'react'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'
import { formatOrderNumber } from '../utils/fuelSupplyOrders'

function buildSuggestedDeadline(order) {
  const currentDeadline = new Date(order?.expires_at || 0).getTime()
  const base = Math.max(Date.now(), Number.isNaN(currentDeadline) ? 0 : currentDeadline)
  return toDateTimeLocalValue(new Date(base + 24 * 60 * 60 * 1000).toISOString())
}

export default function FuelSupplyOrderDeadlineForm({ order, onClose, onSuccess }) {
  const isExpired = order?.status === 'EXPIRED' || new Date(order?.expires_at).getTime() <= Date.now()
  const [expiresAt, setExpiresAt] = useState(() => buildSuggestedDeadline(order))
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submitLabel = useMemo(() => {
    if (submitting) return isExpired ? 'Reabrindo...' : 'Prorrogando...'
    return isExpired ? 'Reabrir ordem' : 'Prorrogar prazo'
  }, [isExpired, submitting])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const deadline = new Date(expiresAt)
    if (!expiresAt || Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      setError('Informe um novo prazo futuro válido.')
      return
    }
    if (!isExpired && deadline.getTime() <= new Date(order.expires_at).getTime()) {
      setError('O novo prazo deve ser posterior ao prazo atual.')
      return
    }
    if (reason.trim().length < 10) {
      setError('A justificativa deve ter pelo menos 10 caracteres.')
      return
    }

    try {
      setSubmitting(true)
      await fuelSupplyOrdersAPI.updateDeadline(order.id, {
        expires_at: deadline.toISOString(),
        reason: reason.trim(),
      })
      onSuccess?.(
        isExpired
          ? `Ordem ${formatOrderNumber(order)} reaberta com sucesso.`
          : `Prazo da ordem ${formatOrderNumber(order)} prorrogado com sucesso.`,
      )
      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível ajustar o prazo da ordem.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      {error ? <div className="alert alert-error modal-field-span">{error}</div> : null}
      <div className="alert alert-info modal-field-span">
        {isExpired
          ? 'A ordem voltará para a situação Aberta e poderá ser confirmada até o novo prazo.'
          : 'A ordem permanecerá aberta e receberá um prazo posterior ao atual.'}
      </div>
      <div className="form-field modal-field-span">
        <label htmlFor="deadline-expires-at">Novo prazo</label>
        <input id="deadline-expires-at" type="datetime-local" className="app-input" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required />
      </div>
      <div className="form-field modal-field-span">
        <label htmlFor="deadline-reason">Justificativa</label>
        <textarea id="deadline-reason" className="app-textarea" rows="4" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={1000} required />
        <small className="muted">Situação, prazo anterior, prazo novo e justificativa serão auditados.</small>
      </div>
      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting}>{submitLabel}</button>
        <button className="ghost-button" type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
      </div>
    </form>
  )
}
