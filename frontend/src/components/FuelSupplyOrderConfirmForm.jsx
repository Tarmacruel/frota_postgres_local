import { useMemo, useRef, useState } from 'react'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'
import { ADDITIVE_TYPE_OPTIONS, FUEL_TYPE_OPTIONS, resolveOptionValue } from '../utils/fuelSupplyDetails'

const MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024
const ALLOWED_RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export default function FuelSupplyOrderConfirmForm({ order, onClose, onSuccess }) {
  const [form, setForm] = useState({
    odometer_km: order?.suggested_odometer_km || '',
    liters: order?.requested_liters || '',
    total_amount: '',
    fuel_type: '',
    fuel_type_other: '',
    supplied_at: toDateTimeLocalValue(new Date().toISOString()),
    additive_enabled: false,
    additive_type: '',
    additive_type_other: '',
    additive_quantity_liters: '',
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
      setReceiptError('Comprovante deve ter no máximo 8 MB.')
      if (receiptRef.current) receiptRef.current.value = ''
      return
    }

    setReceiptFile(file)
    setReceiptError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const fuelType = resolveOptionValue(form.fuel_type, form.fuel_type_other)
    const additiveType = form.additive_enabled ? resolveOptionValue(form.additive_type, form.additive_type_other) : ''

    if (!form.odometer_km || Number(form.odometer_km) < 0) {
      setError('Informe um odômetro válido.')
      return
    }
    if (!form.liters || Number(form.liters) <= 0) {
      setError('Informe os litros abastecidos.')
      return
    }
    if (!form.total_amount || Number(form.total_amount) <= 0) {
      setError('Informe o valor total abastecido.')
      return
    }
    if (!fuelType) {
      setError('Informe o tipo de combustível abastecido.')
      return
    }
    if (form.additive_enabled && !additiveType) {
      setError('Informe o tipo de aditivo utilizado.')
      return
    }
    if (form.additive_enabled && form.additive_quantity_liters && Number(form.additive_quantity_liters) <= 0) {
      setError('Informe uma quantidade de aditivo maior que zero.')
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
      payload.append('total_amount', String(Number(form.total_amount)))
      payload.append('fuel_type', fuelType)
      payload.append('supplied_at', new Date(form.supplied_at).toISOString())
      if (additiveType) payload.append('additive_type', additiveType)
      if (form.additive_enabled && form.additive_quantity_liters) {
        payload.append('additive_quantity_liters', String(Number(form.additive_quantity_liters)))
      }
      if (form.notes) payload.append('notes', form.notes)
      payload.append('receipt', receiptFile, receiptFile.name)

      await fuelSupplyOrdersAPI.confirmSupply(order.id, payload)
      onSuccess?.('Abastecimento confirmado com sucesso.')
      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível confirmar o abastecimento.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      {error ? <div className="alert alert-error modal-field-span">{error}</div> : null}

      <div className="form-field">
        <label>Odômetro real (km)</label>
        <input type="number" min="0" step="0.1" className="app-input" value={form.odometer_km} onChange={(event) => setForm((current) => ({ ...current, odometer_km: event.target.value }))} required />
      </div>

      <div className="form-field">
        <label>Litros abastecidos</label>
        <input type="number" min="0" step="0.01" className="app-input" value={form.liters} onChange={(event) => setForm((current) => ({ ...current, liters: event.target.value }))} required />
      </div>

      <div className="form-field">
        <label>Valor total abastecido (R$)</label>
        <input type="number" min="0" step="0.01" className="app-input" value={form.total_amount} onChange={(event) => setForm((current) => ({ ...current, total_amount: event.target.value }))} required />
      </div>

      <div className="form-field">
        <label>Tipo de combustível</label>
        <select className="app-select" value={form.fuel_type} onChange={(event) => setForm((current) => ({ ...current, fuel_type: event.target.value }))} required>
          <option value="">Selecione</option>
          {FUEL_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      {form.fuel_type === 'Outro' ? (
        <div className="form-field modal-field-span">
          <label>Outro combustível</label>
          <input className="app-input" value={form.fuel_type_other} onChange={(event) => setForm((current) => ({ ...current, fuel_type_other: event.target.value }))} maxLength={80} required />
        </div>
      ) : null}

      <div className="form-field">
        <label>Data/hora real</label>
        <input type="datetime-local" className="app-input" value={form.supplied_at} onChange={(event) => setForm((current) => ({ ...current, supplied_at: event.target.value }))} required />
      </div>

      <div className="form-field">
        <label className="checkbox-line">
          <input type="checkbox" checked={form.additive_enabled} onChange={(event) => setForm((current) => ({ ...current, additive_enabled: event.target.checked, additive_type: '', additive_type_other: '', additive_quantity_liters: '' }))} />
          <span>Houve aditivo</span>
        </label>
      </div>

      {form.additive_enabled ? (
        <>
          <div className="form-field">
            <label>Aditivo</label>
            <select className="app-select" value={form.additive_type} onChange={(event) => setForm((current) => ({ ...current, additive_type: event.target.value }))} required>
              <option value="">Selecione</option>
              {ADDITIVE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Quantidade do aditivo (L)</label>
            <input type="number" min="0" step="0.01" className="app-input" value={form.additive_quantity_liters} onChange={(event) => setForm((current) => ({ ...current, additive_quantity_liters: event.target.value }))} />
          </div>

          {form.additive_type === 'Outro' ? (
            <div className="form-field modal-field-span">
              <label>Outro aditivo</label>
              <input className="app-input" value={form.additive_type_other} onChange={(event) => setForm((current) => ({ ...current, additive_type_other: event.target.value }))} maxLength={80} required />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="form-field modal-field-span">
        <label>Comprovante</label>
        <input ref={receiptRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={handleReceiptChange} required />
        {receiptError ? <small className="form-error">{receiptError}</small> : null}
      </div>

      <div className="form-field modal-field-span">
        <label>Observações</label>
        <textarea className="app-textarea" rows="3" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
      </div>

      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting}>{submitLabel}</button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}
