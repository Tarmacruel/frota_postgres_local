import { useMemo, useState } from 'react'
import SearchableSelect from './SearchableSelect'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'

function buildDefaultDeadline() {
  const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000)
  return toDateTimeLocalValue(deadline.toISOString())
}

function buildFuelStationOption(station) {
  return {
    value: station.id,
    label: station.name,
    description: [station.address, station.phone].filter(Boolean).join(' | '),
    keywords: [station.name, station.cnpj, station.address, station.phone].filter(Boolean).join(' '),
  }
}

function vehicleDescription(vehicle) {
  return [vehicle.plate, vehicle.brand, vehicle.model].filter(Boolean).join(' · ')
}

function vehicleLocation(vehicle) {
  return vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação'
}

function parseOptionalLiters(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return { value: null }

  const numeric = Number(normalized.replace(',', '.'))
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { error: 'Informe litros previstos maiores que zero ou deixe o campo em branco.' }
  }

  return { value: numeric }
}

export default function FuelSupplyOrderBatchCreateForm({ vehicles = [], organizations = [], fuelStations = [], onClose, onSuccess }) {
  const [form, setForm] = useState({
    organization_id: '',
    fuel_station_id: '',
    expires_at: buildDefaultDeadline(),
    default_requested_liters: '',
    notes: '',
  })
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([])
  const [vehicleOverrides, setVehicleOverrides] = useState({})
  const [vehicleQuery, setVehicleQuery] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const filteredVehicles = useMemo(() => {
    const term = vehicleQuery.trim().toLowerCase()
    if (!term) return vehicles
    return vehicles.filter((vehicle) => [
      vehicle.plate,
      vehicle.brand,
      vehicle.model,
      vehicleLocation(vehicle),
    ].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [vehicleQuery, vehicles])

  const selectedVehicles = useMemo(
    () => vehicles.filter((vehicle) => selectedVehicleIds.includes(vehicle.id)),
    [selectedVehicleIds, vehicles],
  )

  const selectedOrganization = useMemo(
    () => organizations.find((organization) => organization.id === form.organization_id),
    [form.organization_id, organizations],
  )

  const selectedStation = useMemo(
    () => fuelStations.find((station) => station.id === form.fuel_station_id),
    [form.fuel_station_id, fuelStations],
  )

  function getEffectiveLiters(vehicleId) {
    return Object.hasOwn(vehicleOverrides, vehicleId)
      ? vehicleOverrides[vehicleId]
      : form.default_requested_liters
  }

  function toggleVehicle(vehicleId) {
    setSelectedVehicleIds((current) => {
      if (current.includes(vehicleId)) return current.filter((id) => id !== vehicleId)
      return [...current, vehicleId]
    })
    setVehicleOverrides((current) => {
      if (!Object.hasOwn(current, vehicleId)) return current
      const { [vehicleId]: _removed, ...remaining } = current
      return remaining
    })
    setReviewing(false)
  }

  function setVehicleLiters(vehicleId, value) {
    setVehicleOverrides((current) => ({ ...current, [vehicleId]: value }))
    setReviewing(false)
  }

  function resetVehicleLiters(vehicleId) {
    setVehicleOverrides((current) => {
      const { [vehicleId]: _removed, ...remaining } = current
      return remaining
    })
    setReviewing(false)
  }

  function validateForm() {
    if (selectedVehicleIds.length < 2) {
      return 'Selecione pelo menos dois veículos para emitir ordens em lote.'
    }
    if (!form.fuel_station_id) {
      return 'Selecione o posto responsável pelas ordens.'
    }
    if (!form.expires_at) {
      return 'Informe o prazo limite das ordens.'
    }
    const deadlineTime = new Date(form.expires_at).getTime()
    if (!Number.isFinite(deadlineTime) || deadlineTime <= Date.now()) {
      return 'O prazo das ordens deve estar no futuro.'
    }

    const defaultLiters = parseOptionalLiters(form.default_requested_liters)
    if (defaultLiters.error) return defaultLiters.error

    for (const vehicle of selectedVehicles) {
      const liters = parseOptionalLiters(getEffectiveLiters(vehicle.id))
      if (liters.error) return `${vehicle.plate || 'Veículo selecionado'}: ${liters.error}`
    }

    return ''
  }

  function handleReview(event) {
    event.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setReviewing(true)
  }

  async function handleCreate(event) {
    event.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      setReviewing(false)
      return
    }

    try {
      setSubmitting(true)
      setError('')

      const payload = {
        items: selectedVehicles.map((vehicle) => {
          const item = { vehicle_id: vehicle.id }
          const requestedLiters = parseOptionalLiters(getEffectiveLiters(vehicle.id)).value
          if (requestedLiters !== null) item.requested_liters = requestedLiters
          return item
        }),
        fuel_station_id: form.fuel_station_id,
        expires_at: new Date(form.expires_at).toISOString(),
      }
      if (form.organization_id) payload.organization_id = form.organization_id
      if (form.notes.trim()) payload.notes = form.notes.trim()

      const { data } = await fuelSupplyOrdersAPI.createBatch(payload)
      const createdCount = Number(data?.created_count) || selectedVehicles.length
      onSuccess?.({
        message: `${createdCount} ${createdCount === 1 ? 'ordem foi emitida' : 'ordens foram emitidas'} com sucesso. Cada veículo possui seu próprio comprovante.`,
        orders: Array.isArray(data?.orders) ? data.orders : [],
      })
      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível emitir as ordens de abastecimento em lote.'))
    } finally {
      setSubmitting(false)
    }
  }

  const reviewItems = selectedVehicles.map((vehicle) => ({
    vehicle,
    liters: parseOptionalLiters(getEffectiveLiters(vehicle.id)).value,
  }))

  return (
    <form onSubmit={reviewing ? handleCreate : handleReview} className="form-grid modal-form-grid fuel-batch-form">
      {error ? <div className="alert alert-error modal-field-span" role="alert">{error}</div> : null}

      {!reviewing ? (
        <>
          <section className="fuel-batch-vehicle-picker modal-field-span" data-tour="fuel-batch-vehicles" aria-labelledby="fuel-batch-vehicles-title">
            <div className="fuel-batch-section-heading">
              <div>
                <label id="fuel-batch-vehicles-title" htmlFor="fuel-batch-vehicle-search">Veículos</label>
                <p>Selecione os veículos que receberão ordens independentes.</p>
              </div>
              <strong className="focus-inline" aria-live="polite">{selectedVehicleIds.length} selecionado{selectedVehicleIds.length === 1 ? '' : 's'}</strong>
            </div>
            <input
              id="fuel-batch-vehicle-search"
              type="search"
              className="app-input"
              value={vehicleQuery}
              onChange={(event) => setVehicleQuery(event.target.value)}
              placeholder="Buscar por placa, marca, modelo ou lotação"
            />
            <div className="fuel-batch-selection-list" role="group" aria-label="Veículos para as ordens em lote">
              {filteredVehicles.length === 0 ? <p className="muted">Nenhum veículo encontrado para a busca.</p> : null}
              {filteredVehicles.map((vehicle) => {
                const selected = selectedVehicleIds.includes(vehicle.id)
                const checkboxId = `fuel-batch-vehicle-${vehicle.id}`
                return (
                  <label key={vehicle.id} className={`fuel-batch-vehicle-option${selected ? ' is-selected' : ''}`} htmlFor={checkboxId}>
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleVehicle(vehicle.id)}
                    />
                    <span>
                      <strong>{vehicleDescription(vehicle)}</strong>
                      <small>{vehicleLocation(vehicle)}</small>
                    </span>
                  </label>
                )
              })}
            </div>
          </section>

          <div className="form-field">
            <label>Posto</label>
            <SearchableSelect
              value={form.fuel_station_id}
              onChange={(value) => {
                setForm((current) => ({ ...current, fuel_station_id: value }))
                setReviewing(false)
              }}
              options={fuelStations.map(buildFuelStationOption)}
              placeholder="Selecione o posto"
              searchPlaceholder="Buscar posto"
              ariaLabel="Posto responsável"
            />
          </div>

          <div className="form-field">
            <label>Órgão solicitante</label>
            <SearchableSelect
              value={form.organization_id}
              onChange={(value) => {
                setForm((current) => ({ ...current, organization_id: value }))
                setReviewing(false)
              }}
              options={[{ value: '', label: 'Não informado' }, ...organizations.map((organization) => ({ value: organization.id, label: organization.name }))]}
              placeholder="Selecione o órgão"
              searchPlaceholder="Buscar órgão"
              ariaLabel="Órgão solicitante"
            />
          </div>

          <div className="form-field">
            <label htmlFor="fuel-batch-deadline">Prazo limite</label>
            <input
              id="fuel-batch-deadline"
              type="datetime-local"
              className="app-input"
              value={form.expires_at}
              onChange={(event) => {
                setForm((current) => ({ ...current, expires_at: event.target.value }))
                setReviewing(false)
              }}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="fuel-batch-default-liters">Litros previstos padrão</label>
            <input
              id="fuel-batch-default-liters"
              type="number"
              min="0"
              step="0.01"
              className="app-input"
              value={form.default_requested_liters}
              onChange={(event) => {
                setForm((current) => ({ ...current, default_requested_liters: event.target.value }))
                setReviewing(false)
              }}
              placeholder="Opcional"
            />
          </div>

          <section className="fuel-batch-liters modal-field-span" data-tour="fuel-batch-liters" aria-labelledby="fuel-batch-liters-title">
            <div className="fuel-batch-section-heading">
              <div>
                <h4 id="fuel-batch-liters-title">Litros por veículo</h4>
                <p>O padrão é aplicado a todos; ajuste apenas os veículos que precisarem de outro limite.</p>
              </div>
            </div>
            {selectedVehicles.length === 0 ? <p className="muted">Selecione veículos acima para informar limites individuais.</p> : null}
            {selectedVehicles.length > 0 ? (
              <div className="fuel-batch-liters-list">
                {selectedVehicles.map((vehicle) => {
                  const overridden = Object.hasOwn(vehicleOverrides, vehicle.id)
                  return (
                    <div className="fuel-batch-liters-row" key={vehicle.id}>
                      <div>
                        <strong>{vehicleDescription(vehicle)}</strong>
                        <small>{overridden ? 'Valor individual' : 'Usando valor padrão'}</small>
                      </div>
                      <div className="fuel-batch-liters-input">
                        <label className="sr-only" htmlFor={`fuel-batch-liters-${vehicle.id}`}>Litros previstos para {vehicle.plate || vehicleDescription(vehicle)}</label>
                        <input
                          id={`fuel-batch-liters-${vehicle.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          className="app-input"
                          value={getEffectiveLiters(vehicle.id)}
                          onChange={(event) => setVehicleLiters(vehicle.id, event.target.value)}
                          placeholder="Opcional"
                        />
                        {overridden ? (
                          <button className="mini-button" type="button" onClick={() => resetVehicleLiters(vehicle.id)}>Usar padrão</button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </section>

          <div className="form-field modal-field-span">
            <label htmlFor="fuel-batch-notes">Observações</label>
            <textarea
              id="fuel-batch-notes"
              className="app-textarea"
              rows="3"
              value={form.notes}
              onChange={(event) => {
                setForm((current) => ({ ...current, notes: event.target.value }))
                setReviewing(false)
              }}
              placeholder="Informações compartilhadas com o posto e com a equipe solicitante."
            />
          </div>

          <div className="actions-inline modal-actions" data-tour="fuel-batch-review">
            <button className="app-button" type="submit" disabled={submitting}>Revisar {selectedVehicleIds.length} {selectedVehicleIds.length === 1 ? 'ordem' : 'ordens'}</button>
            <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </>
      ) : (
        <section className="fuel-batch-review modal-field-span" data-tour="fuel-batch-review" aria-labelledby="fuel-batch-review-title">
          <div className="fuel-batch-section-heading">
            <div>
              <h4 id="fuel-batch-review-title">Revise antes de emitir</h4>
              <p>Será criada uma ordem separada para cada veículo selecionado.</p>
            </div>
            <strong className="focus-inline">{selectedVehicles.length} ordens</strong>
          </div>
          <dl className="fuel-batch-review-details">
            <div><dt>Posto</dt><dd>{selectedStation?.name || '-'}</dd></div>
            <div><dt>Órgão</dt><dd>{selectedOrganization?.name || 'Não informado'}</dd></div>
            <div><dt>Prazo</dt><dd>{new Date(form.expires_at).toLocaleString('pt-BR')}</dd></div>
            {form.notes.trim() ? <div className="fuel-batch-review-notes"><dt>Observações</dt><dd>{form.notes.trim()}</dd></div> : null}
          </dl>
          <ul className="fuel-batch-review-list" aria-label="Ordens que serão emitidas">
            {reviewItems.map(({ vehicle, liters }) => (
              <li key={vehicle.id}>
                <span>
                  <strong>{vehicleDescription(vehicle)}</strong>
                  <small>{vehicleLocation(vehicle)}</small>
                </span>
                <span>{liters === null ? 'Litros não informados' : `${liters.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`}</span>
              </li>
            ))}
          </ul>
          <div className="actions-inline modal-actions">
            <button className="secondary-button" type="button" onClick={() => setReviewing(false)} disabled={submitting}>Voltar e editar</button>
            <button className="app-button" type="submit" data-tour="fuel-batch-submit" disabled={submitting}>
              {submitting ? 'Emitindo ordens...' : `Emitir ${selectedVehicles.length} ${selectedVehicles.length === 1 ? 'ordem' : 'ordens'}`}
            </button>
          </div>
        </section>
      )}
    </form>
  )
}
