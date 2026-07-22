import { useMemo, useState } from 'react'
import { fuelSuppliesAPI } from '../api/fuelSupplies'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'
import { ADDITIVE_TYPE_OPTIONS, FUEL_TYPE_OPTIONS, resolveOptionValue } from '../utils/fuelSupplyDetails'

function selectKnownOption(value, options) {
  if (!value) return { selected: '', other: '' }
  if (options.includes(value)) return { selected: value, other: '' }
  return { selected: 'Outro', other: value }
}

export default function FuelSupplyRectifyForm({ record, onClose, onSuccess }) {
  const initialFuel = selectKnownOption(record?.fuel_type, FUEL_TYPE_OPTIONS)
  const initialAdditive = selectKnownOption(record?.additive_type, ADDITIVE_TYPE_OPTIONS)
  const [form, setForm] = useState({
    supplied_at: toDateTimeLocalValue(record?.supplied_at),
    odometer_km: record?.odometer_km ?? '',
    liters: record?.liters ?? '',
    total_amount: record?.total_amount ?? '',
    fuel_type: initialFuel.selected,
    fuel_type_other: initialFuel.other,
    additive_enabled: Boolean(record?.additive_type),
    additive_type: initialAdditive.selected,
    additive_type_other: initialAdditive.other,
    additive_quantity_liters: record?.additive_quantity_liters ?? '',
    notes: record?.notes || '',
    reason: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submitLabel = useMemo(() => (submitting ? 'Salvando retificação...' : 'Salvar retificação'), [submitting])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const fuelType = resolveOptionValue(form.fuel_type, form.fuel_type_other)
    const additiveType = form.additive_enabled ? resolveOptionValue(form.additive_type, form.additive_type_other) : null

    if (!form.supplied_at || !form.odometer_km || Number(form.odometer_km) <= 0) {
      setError('Informe data, hora e odômetro válidos.')
      return
    }
    if (!form.liters || Number(form.liters) <= 0 || !form.total_amount || Number(form.total_amount) <= 0) {
      setError('Litros e valor total devem ser maiores que zero.')
      return
    }
    if (!fuelType) {
      setError('Informe o tipo de combustível.')
      return
    }
    if (form.additive_enabled && !additiveType) {
      setError('Informe o tipo de aditivo.')
      return
    }
    if (form.reason.trim().length < 10) {
      setError('A justificativa deve ter pelo menos 10 caracteres.')
      return
    }

    try {
      setSubmitting(true)
      await fuelSuppliesAPI.rectify(record.id, {
        supplied_at: new Date(form.supplied_at).toISOString(),
        odometer_km: Number(form.odometer_km),
        liters: Number(form.liters),
        total_amount: Number(form.total_amount),
        fuel_type: fuelType,
        additive_type: additiveType,
        additive_quantity_liters: form.additive_enabled && form.additive_quantity_liters
          ? Number(form.additive_quantity_liters)
          : null,
        notes: form.notes.trim() || null,
        reason: form.reason.trim(),
      })
      onSuccess?.(`Abastecimento do veículo ${record.vehicle_plate} retificado com sucesso.`)
      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível retificar o abastecimento.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      {error ? <div className="alert alert-error modal-field-span">{error}</div> : null}
      <div className="alert alert-info modal-field-span">
        O comprovante anexado será preservado. Valores derivados de consumo serão recalculados.
      </div>

      <div className="form-field">
        <label htmlFor="rectify-supplied-at">Data/hora real</label>
        <input id="rectify-supplied-at" type="datetime-local" className="app-input" value={form.supplied_at} onChange={(event) => setForm((current) => ({ ...current, supplied_at: event.target.value }))} required />
      </div>
      <div className="form-field">
        <label htmlFor="rectify-odometer">Odômetro real (km)</label>
        <input id="rectify-odometer" type="number" min="0.1" step="0.1" className="app-input" value={form.odometer_km} onChange={(event) => setForm((current) => ({ ...current, odometer_km: event.target.value }))} required />
      </div>
      <div className="form-field">
        <label htmlFor="rectify-liters">Litros abastecidos</label>
        <input id="rectify-liters" type="number" min="0.01" step="0.01" className="app-input" value={form.liters} onChange={(event) => setForm((current) => ({ ...current, liters: event.target.value }))} required />
      </div>
      <div className="form-field">
        <label htmlFor="rectify-total">Valor total (R$)</label>
        <input id="rectify-total" type="number" min="0.01" step="0.01" className="app-input" value={form.total_amount} onChange={(event) => setForm((current) => ({ ...current, total_amount: event.target.value }))} required />
      </div>
      <div className="form-field">
        <label htmlFor="rectify-fuel">Tipo de combustível</label>
        <select id="rectify-fuel" className="app-select" value={form.fuel_type} onChange={(event) => setForm((current) => ({ ...current, fuel_type: event.target.value }))} required>
          <option value="">Selecione</option>
          {FUEL_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
      {form.fuel_type === 'Outro' ? (
        <div className="form-field">
          <label htmlFor="rectify-fuel-other">Outro combustível</label>
          <input id="rectify-fuel-other" className="app-input" value={form.fuel_type_other} onChange={(event) => setForm((current) => ({ ...current, fuel_type_other: event.target.value }))} maxLength={80} required />
        </div>
      ) : null}

      <div className="form-field modal-field-span">
        <label className="checkbox-line">
          <input type="checkbox" checked={form.additive_enabled} onChange={(event) => setForm((current) => ({ ...current, additive_enabled: event.target.checked, additive_type: '', additive_type_other: '', additive_quantity_liters: '' }))} />
          <span>Houve aditivo</span>
        </label>
      </div>
      {form.additive_enabled ? (
        <>
          <div className="form-field">
            <label htmlFor="rectify-additive">Tipo de aditivo</label>
            <select id="rectify-additive" className="app-select" value={form.additive_type} onChange={(event) => setForm((current) => ({ ...current, additive_type: event.target.value }))} required>
              <option value="">Selecione</option>
              {ADDITIVE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="rectify-additive-quantity">Quantidade do aditivo (L)</label>
            <input id="rectify-additive-quantity" type="number" min="0.01" step="0.01" className="app-input" value={form.additive_quantity_liters} onChange={(event) => setForm((current) => ({ ...current, additive_quantity_liters: event.target.value }))} />
          </div>
          {form.additive_type === 'Outro' ? (
            <div className="form-field modal-field-span">
              <label htmlFor="rectify-additive-other">Outro aditivo</label>
              <input id="rectify-additive-other" className="app-input" value={form.additive_type_other} onChange={(event) => setForm((current) => ({ ...current, additive_type_other: event.target.value }))} maxLength={80} required />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="form-field modal-field-span">
        <label htmlFor="rectify-notes">Observações</label>
        <textarea id="rectify-notes" className="app-textarea" rows="2" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} maxLength={4000} />
      </div>
      <div className="form-field modal-field-span">
        <label htmlFor="rectify-reason">Justificativa da retificação</label>
        <textarea id="rectify-reason" className="app-textarea" rows="3" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} minLength={10} maxLength={1000} required />
        <small className="muted">A justificativa e os valores anterior e novo ficarão registrados na auditoria.</small>
      </div>

      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting}>{submitLabel}</button>
        <button className="ghost-button" type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
      </div>
    </form>
  )
}
