import { useMemo, useRef, useState } from 'react'
import SearchableSelect from './SearchableSelect'
import { fuelSuppliesAPI } from '../api/fuelSupplies'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'

const MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024
const ALLOWED_RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

function buildVehicleOption(vehicle) {
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotacao'
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

export default function FuelSupplyForm({ vehicles, drivers, organizations, fuelStations, onClose, onSuccess }) {
  const [form, setForm] = useState({
    vehicle_id: '',
    driver_id: '',
    organization_id: '',
    supplied_at: toDateTimeLocalValue(new Date().toISOString()),
    odometer_km: '',
    liters: '',
    total_amount: '',
    fuel_station_id: '',
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
      setReceiptError('Comprovante deve ter no maximo 8 MB.')
      if (receiptRef.current) receiptRef.current.value = ''
      return
    }

    setReceiptFile(file)
    setReceiptError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.vehicle_id) {
      setError('Selecione um veículo para registrar o abastecimento.')
      return
    }
    if (!receiptFile) {
      setReceiptError('O comprovante e obrigatorio para registrar o abastecimento.')
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
      if (form.total_amount) payload.append('total_amount', String(Number(form.total_amount)))
      if (form.fuel_station_id) payload.append('fuel_station_id', form.fuel_station_id)
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
        <label>Veiculo</label>
        <SearchableSelect value={form.vehicle_id} onChange={(value) => setForm({ ...form, vehicle_id: value })} options={vehicles.map(buildVehicleOption)} placeholder="Selecione o veículo" searchPlaceholder="Buscar veículo" />
      </div>
      <div className="form-field">
        <label>Condutor</label>
        <SearchableSelect value={form.driver_id} onChange={(value) => setForm({ ...form, driver_id: value })} options={[{ value: '', label: 'Não informado' }, ...drivers.map(buildDriverOption)]} placeholder="Selecione o condutor" searchPlaceholder="Buscar condutor" />
      </div>
      <div className="form-field">
        <label>Orgao</label>
        <SearchableSelect value={form.organization_id} onChange={(value) => setForm({ ...form, organization_id: value })} options={[{ value: '', label: 'Não informado' }, ...organizations.map((org) => ({ value: org.id, label: org.name }))]} placeholder="Selecione o órgão" searchPlaceholder="Buscar órgão" />
      </div>
      <div className="form-field">
        <label>Data/hora</label>
        <input type="datetime-local" className="app-input" value={form.supplied_at} onChange={(event) => setForm({ ...form, supplied_at: event.target.value })} />
      </div>
      <div className="form-field">
        <label>Odometro (km)</label>
        <input type="number" min="0" step="0.1" className="app-input" value={form.odometer_km} onChange={(event) => setForm({ ...form, odometer_km: event.target.value })} required />
      </div>
      <div className="form-field">
        <label>Litros</label>
        <input type="number" min="0" step="0.01" className="app-input" value={form.liters} onChange={(event) => setForm({ ...form, liters: event.target.value })} required />
      </div>
      <div className="form-field">
        <label>Valor total (R$)</label>
        <input type="number" min="0" step="0.01" className="app-input" value={form.total_amount} onChange={(event) => setForm({ ...form, total_amount: event.target.value })} />
      </div>
      <div className="form-field">
        <label>Posto</label>
        <SearchableSelect value={form.fuel_station_id} onChange={(value) => setForm({ ...form, fuel_station_id: value })} options={[{ value: '', label: 'Não informado' }, ...fuelStations.map((station) => ({ value: station.id, label: station.name, description: station.address }))]} placeholder="Selecione o posto" searchPlaceholder="Buscar posto" />
      </div>

      <div className="form-field modal-field-span">
        <label>Comprovante (obrigatorio)</label>
        <input ref={receiptRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={handleReceiptChange} required />
        {receiptError ? <small className="form-error">{receiptError}</small> : null}
      </div>

      <div className="form-field modal-field-span">
        <label>Observacoes</label>
        <textarea className="app-textarea" rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </div>

      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting}>{submitLabel}</button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}