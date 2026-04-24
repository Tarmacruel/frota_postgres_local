import { useMemo, useRef, useState } from 'react'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'

const MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024
const ALLOWED_RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export default function FuelSupplyOrderConfirmForm({ order, onClose, onSuccess }) {
  const [form, setForm] = useState({
    odometer_km: order?.suggested_odometer_km || '',
    liters: order?.requested_liters || '',
    total_amount: '',
    supplied_at: toDateTimeLocalValue(new Date().toISOString()),
    notes: '',
  })
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptError, setReceiptError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const receiptRef = useRef(null)

  const submitLabel = useMemo(() => (submitting ? 'Confirmando...' : 'Confirmar abastecimento'), [submitting])

  function handleReceiptChange(event) {
    const file = event.target.files?.[0] || null
    if (!file) {
      setReceiptFile(null)
      setReceiptError('')
      return
    }

    if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) {
      setReceiptFile(null)
      setReceiptError('Comprovante deve ser PDF, JPG, PNG ou WEBP.')
      if (receiptRef.current) receiptRef.current.value = ''
      return
    }

    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      setReceiptFile(null)
      setReceiptError('Comprovante deve ter no maximo 8 MB.')
      if (receiptRef.current) receiptRef.current.value = ''
      return
    }

    setReceiptFile(file)
    setReceiptError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!form.odometer_km || Number(form.odometer_km) < 0) {
      setError('Informe um odometro valido.')
      return
    }
    if (!form.liters || Number(form.liters) <= 0) {
      setError('Informe os litros abastecidos.')
      return
    }
    if (!form.supplied_at) {
      setError('Informe a data/hora real do abastecimento.')
      return
    }
    if (!receiptFile) {
      setReceiptError('Envie o comprovante para confirmar o abastecimento.')
      return
    }

    try {
      setSubmitting(true)
      const payload = new FormData()
      payload.append('odometer_km', String(Number(form.odometer_km)))
      payload.append('liters', String(Number(form.liters)))
      payload.append('supplied_at', new Date(form.supplied_at).toISOString())
      if (form.total_amount) payload.append('total_amount', String(Number(form.total_amount)))
      if (form.notes) payload.append('notes', form.notes)
      payload.append('receipt', receiptFile, receiptFile.name)

      await fuelSupplyOrdersAPI.confirmSupply(order.id, payload)
      onSuccess?.('Abastecimento confirmado com sucesso.')
      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel confirmar o abastecimento.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      {error ? <div className="alert alert-error modal-field-span">{error}</div> : null}

      <div className="form-field">
        <label>Odometro real (km)</label>
        <input type="number" min="0" step="0.1" className="app-input" value={form.odometer_km} onChange={(event) => setForm((current) => ({ ...current, odometer_km: event.target.value }))} required />
      </div>

      <div className="form-field">
        <label>Litros abastecidos</label>
        <input type="number" min="0" step="0.01" className="app-input" value={form.liters} onChange={(event) => setForm((current) => ({ ...current, liters: event.target.value }))} required />
      </div>

      <div className="form-field">
        <label>Valor total (R$)</label>
        <input type="number" min="0" step="0.01" className="app-input" value={form.total_amount} onChange={(event) => setForm((current) => ({ ...current, total_amount: event.target.value }))} />
      </div>

      <div className="form-field">
        <label>Data/hora real</label>
        <input type="datetime-local" className="app-input" value={form.supplied_at} onChange={(event) => setForm((current) => ({ ...current, supplied_at: event.target.value }))} required />
      </div>

      <div className="form-field modal-field-span">
        <label>Comprovante</label>
        <input ref={receiptRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={handleReceiptChange} required />
        {receiptError ? <small className="form-error">{receiptError}</small> : null}
      </div>

      <div className="form-field modal-field-span">
        <label>Observacoes</label>
        <textarea className="app-textarea" rows="3" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
      </div>

      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting}>{submitLabel}</button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}
