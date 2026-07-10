import { useMemo, useRef, useState } from 'react'
import SearchableSelect from './SearchableSelect'
import { fuelSuppliesAPI } from '../api/fuelSupplies'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'
import { ADDITIVE_TYPE_OPTIONS, FUEL_TYPE_OPTIONS, resolveOptionValue } from '../utils/fuelSupplyDetails'

const MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024
const ALLOWED_RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

function buildVehicleOption(vehicle) {
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação'
  return {
    value: vehicle.id,
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: locationLabel,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, locationLabel].filter(Boolean).join(' '),
  }
}

function buildDriverOption(driver) {
  return {
    value: driver.id,
    label: driver.nome_completo,
    description: driver.documento || 'Sem documento',
    keywords: [driver.nome_completo, driver.documento, driver.contato].filter(Boolean).join(' '),
  }
}

function buildFuelStationOption(station) {
  return {
    value: station.id,
    label: station.name,
    description: [station.address, station.phone].filter(Boolean).join(' | '),
    keywords: [station.name, station.cnpj, station.address, station.phone].filter(Boolean).join(' '),
  }
}

export default function FuelSupplyForm({ vehicles, drivers, organizations, fuelStations, onClose, onSuccess }) {
  const [form, setForm] = useState({
    vehicle_id: '',
    driver_id: '',
    organization_id: '',
    supplied_at: toDateTimeLocalValue(new Date().toISOString()),
    odometer_km: '',
    liters: '',
    total_amount: '',
    fuel_type: '',
    fuel_type_other: '',
    fuel_station_id: '',
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

  const submitLabel = useMemo(() => (submitting ? 'Registrando...' : 'Registrar abastecimento'), [submitting])

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
    const fuelType = resolveOptionValue(form.fuel_type, form.fuel_type_other)
    const additiveType = form.additive_enabled ? resolveOptionValue(form.additive_type, form.additive_type_other) : ''

    if (!form.vehicle_id) {
      setError('Selecione um veículo para registrar o abastecimento.')
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
    if (!receiptFile) {
      setReceiptError('O comprovante é obrigatório para registrar o abastecimento.')
      return
    }

    try {
      setSubmitting(true)
      setError('')
      const payload = new FormData()
      payload.append('vehicle_id', form.vehicle_id)
      if (form.driver_id) payload.append('driver_id', form.driver_id)
      if (form.organization_id) payload.append('organization_id', form.organization_id)
      if (form.supplied_at) payload.append('supplied_at', new Date(form.supplied_at).toISOString())
      payload.append('odometer_km', String(Number(form.odometer_km)))
      payload.append('liters', String(Number(form.liters)))
      payload.append('total_amount', String(Number(form.total_amount)))
      payload.append('fuel_type', fuelType)
      if (form.fuel_station_id) payload.append('fuel_station_id', form.fuel_station_id)
      if (additiveType) payload.append('additive_type', additiveType)
      if (form.additive_enabled && form.additive_quantity_liters) {
        payload.append('additive_quantity_liters', String(Number(form.additive_quantity_liters)))
      }
      if (form.notes) payload.append('notes', form.notes)
      payload.append('receipt', receiptFile, receiptFile.name)

      const { data } = await fuelSuppliesAPI.create(payload)
      const alerts = data.alerts?.length ? ` Alertas: ${data.alerts.join(' | ')}` : ''
      onSuccess?.(`Abastecimento registrado com sucesso.${alerts}`)
      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível registrar o abastecimento.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      {error ? <div className="alert alert-error modal-field-span">{error}</div> : null}
      <div className="form-field">
        <label>Veículo</label>
        <SearchableSelect value={form.vehicle_id} onChange={(value) => setForm({ ...form, vehicle_id: value })} options={vehicles.map(buildVehicleOption)} placeholder="Selecione o veículo" searchPlaceholder="Buscar veículo" />
      </div>
      <div className="form-field">
        <label>Condutor</label>
        <SearchableSelect value={form.driver_id} onChange={(value) => setForm({ ...form, driver_id: value })} options={[{ value: '', label: 'Não informado' }, ...drivers.map(buildDriverOption)]} placeholder="Selecione o condutor" searchPlaceholder="Buscar condutor" />
      </div>
      <div className="form-field">
        <label>Órgão</label>
        <SearchableSelect value={form.organization_id} onChange={(value) => setForm({ ...form, organization_id: value })} options={[{ value: '', label: 'Não informado' }, ...organizations.map((org) => ({ value: org.id, label: org.name }))]} placeholder="Selecione o órgão" searchPlaceholder="Buscar órgão" />
      </div>
      <div className="form-field">
        <label>Data/hora</label>
        <input type="datetime-local" className="app-input" value={form.supplied_at} onChange={(event) => setForm({ ...form, supplied_at: event.target.value })} />
      </div>
      <div className="form-field">
        <label>Odômetro (km)</label>
        <input type="number" min="0" step="0.1" className="app-input" value={form.odometer_km} onChange={(event) => setForm({ ...form, odometer_km: event.target.value })} required />
      </div>
      <div className="form-field">
        <label>Litros</label>
        <input type="number" min="0" step="0.01" className="app-input" value={form.liters} onChange={(event) => setForm({ ...form, liters: event.target.value })} required />
      </div>
      <div className="form-field">
        <label>Valor total abastecido (R$)</label>
        <input type="number" min="0" step="0.01" className="app-input" value={form.total_amount} onChange={(event) => setForm({ ...form, total_amount: event.target.value })} required />
      </div>
      <div className="form-field">
        <label>Tipo de combustível</label>
        <select className="app-select" value={form.fuel_type} onChange={(event) => setForm({ ...form, fuel_type: event.target.value })} required>
          <option value="">Selecione</option>
          {FUEL_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      {form.fuel_type === 'Outro' ? (
        <div className="form-field modal-field-span">
          <label>Outro combustível</label>
          <input className="app-input" value={form.fuel_type_other} onChange={(event) => setForm({ ...form, fuel_type_other: event.target.value })} maxLength={80} required />
        </div>
      ) : null}
      <div className="form-field">
        <label>Posto</label>
        <SearchableSelect value={form.fuel_station_id} onChange={(value) => setForm({ ...form, fuel_station_id: value })} options={[{ value: '', label: 'Não informado' }, ...fuelStations.map(buildFuelStationOption)]} placeholder="Selecione o posto" searchPlaceholder="Buscar posto" />
      </div>
      <div className="form-field">
        <label className="checkbox-line">
          <input type="checkbox" checked={form.additive_enabled} onChange={(event) => setForm({ ...form, additive_enabled: event.target.checked, additive_type: '', additive_type_other: '', additive_quantity_liters: '' })} />
          <span>Houve aditivo</span>
        </label>
      </div>
      {form.additive_enabled ? (
        <>
          <div className="form-field">
            <label>Aditivo</label>
            <select className="app-select" value={form.additive_type} onChange={(event) => setForm({ ...form, additive_type: event.target.value })} required>
              <option value="">Selecione</option>
              {ADDITIVE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Quantidade do aditivo (L)</label>
            <input type="number" min="0" step="0.01" className="app-input" value={form.additive_quantity_liters} onChange={(event) => setForm({ ...form, additive_quantity_liters: event.target.value })} />
          </div>
          {form.additive_type === 'Outro' ? (
            <div className="form-field modal-field-span">
              <label>Outro aditivo</label>
              <input className="app-input" value={form.additive_type_other} onChange={(event) => setForm({ ...form, additive_type_other: event.target.value })} maxLength={80} required />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="form-field modal-field-span">
        <label>Comprovante (obrigatório)</label>
        <input ref={receiptRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={handleReceiptChange} required />
        {receiptError ? <small className="form-error">{receiptError}</small> : null}
      </div>

      <div className="form-field modal-field-span">
        <label>Observações</label>
        <textarea className="app-textarea" rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </div>

      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting}>{submitLabel}</button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}
