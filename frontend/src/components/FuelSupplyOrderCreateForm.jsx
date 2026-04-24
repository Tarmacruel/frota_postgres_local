import { useMemo, useState } from 'react'
import SearchableSelect from './SearchableSelect'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'
import { formatCurrencyInput, parseCurrencyInput } from '../utils/fuelSupplyOrders'

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

function buildFuelStationOption(station) {
  return {
    value: station.id,
    label: station.name,
    description: station.address,
    keywords: [station.name, station.cnpj, station.address].filter(Boolean).join(' '),
  }
}

function buildDefaultDeadline() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return toDateTimeLocalValue(tomorrow.toISOString())
}

export default function FuelSupplyOrderCreateForm({ vehicles, drivers, organizations, fuelStations, onClose, onSuccess }) {
  const [form, setForm] = useState({
    vehicle_id: '',
    driver_id: '',
    organization_id: '',
    fuel_station_id: '',
    expires_at: buildDefaultDeadline(),
    requested_liters: '',
    max_amount: '',
    notes: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submitLabel = useMemo(() => (submitting ? 'Criando ordem...' : 'Criar ordem'), [submitting])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!form.vehicle_id) {
      setError('Selecione um veiculo para emitir a ordem.')
      return
    }

    if (!form.fuel_station_id) {
      setError('Selecione o posto responsavel pela ordem.')
      return
    }

    if (!form.expires_at) {
      setError('Informe o prazo limite da ordem.')
      return
    }

    if (new Date(form.expires_at).getTime() <= Date.now()) {
      setError('O prazo da ordem deve estar no futuro.')
      return
    }

      try {
      setSubmitting(true)
      const parsedMaxAmount = parseCurrencyInput(form.max_amount)
      const payload = {
        vehicle_id: form.vehicle_id,
        expires_at: new Date(form.expires_at).toISOString(),
        fuel_station_id: form.fuel_station_id,
      }
      if (form.driver_id) payload.driver_id = form.driver_id
      if (form.organization_id) payload.organization_id = form.organization_id
      if (form.requested_liters) payload.requested_liters = Number(form.requested_liters)
      if (parsedMaxAmount !== null) payload.max_amount = parsedMaxAmount
      if (form.notes.trim()) payload.notes = form.notes.trim()

      const { data } = await fuelSupplyOrdersAPI.create(payload)
      onSuccess?.({
        message: 'Ordem de abastecimento criada com sucesso.',
        order: data,
      })
      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel criar a ordem de abastecimento.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      {error ? <div className="alert alert-error modal-field-span">{error}</div> : null}

      <div className="form-field">
        <label>Veiculo</label>
        <SearchableSelect
          value={form.vehicle_id}
          onChange={(value) => setForm((current) => ({ ...current, vehicle_id: value }))}
          options={vehicles.map(buildVehicleOption)}
          placeholder="Selecione o veiculo"
          searchPlaceholder="Buscar veiculo"
        />
      </div>

      <div className="form-field">
        <label>Posto</label>
        <SearchableSelect
          value={form.fuel_station_id}
          onChange={(value) => setForm((current) => ({ ...current, fuel_station_id: value }))}
          options={fuelStations.map(buildFuelStationOption)}
          placeholder="Selecione o posto"
          searchPlaceholder="Buscar posto"
        />
      </div>

      <div className="form-field">
        <label>Condutor</label>
        <SearchableSelect
          value={form.driver_id}
          onChange={(value) => setForm((current) => ({ ...current, driver_id: value }))}
          options={[{ value: '', label: 'Nao informado' }, ...drivers.map(buildDriverOption)]}
          placeholder="Selecione o condutor"
          searchPlaceholder="Buscar condutor"
        />
      </div>

      <div className="form-field">
        <label>Orgao solicitante</label>
        <SearchableSelect
          value={form.organization_id}
          onChange={(value) => setForm((current) => ({ ...current, organization_id: value }))}
          options={[{ value: '', label: 'Nao informado' }, ...organizations.map((org) => ({ value: org.id, label: org.name }))]}
          placeholder="Selecione o orgao"
          searchPlaceholder="Buscar orgao"
        />
      </div>

      <div className="form-field">
        <label>Prazo limite</label>
        <input
          type="datetime-local"
          className="app-input"
          value={form.expires_at}
          onChange={(event) => setForm((current) => ({ ...current, expires_at: event.target.value }))}
          required
        />
      </div>

      <div className="form-field">
        <label>Litros previstos</label>
        <input
          type="number"
          min="0"
          step="0.01"
          className="app-input"
          value={form.requested_liters}
          onChange={(event) => setForm((current) => ({ ...current, requested_liters: event.target.value }))}
        />
      </div>

      <div className="form-field">
        <label>Valor maximo (R$)</label>
        <input
          type="text"
          inputMode="numeric"
          className="app-input"
          value={form.max_amount}
          onChange={(event) => setForm((current) => ({ ...current, max_amount: formatCurrencyInput(event.target.value) }))}
          placeholder="R$ 0,00"
        />
      </div>

      <div className="form-field modal-field-span">
        <label>Observacoes</label>
        <textarea
          className="app-textarea"
          rows="4"
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          placeholder="Informacoes adicionais para o posto e para a equipe solicitante."
        />
      </div>

      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting}>
          {submitLabel}
        </button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}
