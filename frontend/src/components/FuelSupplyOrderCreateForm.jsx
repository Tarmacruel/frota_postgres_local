import { useEffect, useMemo, useState } from 'react'
import SearchableSelect from './SearchableSelect'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'
import useFuelSupplyOrderForm from '../hooks/useFuelSupplyOrderForm'
import useContractFunding from '../hooks/useContractFunding'
import ContractFundingFields from './contracts/ContractFundingFields'
import ContractReturnBanner from './contracts/ContractReturnBanner'
import { contractControlAPI } from '../api/contractControl'

function buildVehicleOption(vehicle) {
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação'
  return {
    value: vehicle.id, tags: vehicle.tags || [],
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: locationLabel,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, locationLabel].filter(Boolean).join(' '),
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

function buildDefaultDeadline() {
  const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000)
  return toDateTimeLocalValue(deadline.toISOString())
}

export default function FuelSupplyOrderCreateForm({ vehicles = [], onVehicleOptionsOpen, organizations = [], fuelStations = [], initialContractId = '', returnTo = '', onClose, onSuccess }) {
  const [context, setContext] = useState({ id: '', contract: null, loading: false, error: '' })
  const [contextRevision, setContextRevision] = useState(0)
  const contextStations = useMemo(() => initialContractId
    ? fuelStations.filter((station) => context.id === initialContractId && context.contract?.providers?.some((provider) => provider.fuel_station_id === station.id && provider.active !== false))
    : fuelStations, [initialContractId, context, fuelStations])
  const [form, setForm] = useFuelSupplyOrderForm(() => ({
    vehicle_id: '',
    fuel_station_id: undefined,
    expires_at: buildDefaultDeadline(),
    requested_liters: '30',
    notes: '',
  }), organizations, contextStations, { autoSelectFirstStation: !initialContractId })
  const [error, setError] = useState('')
  const funding = useContractFunding({ stationId: form.fuel_station_id, liters: form.requested_liters, initialContractId })
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (!initialContractId || funding.enabled !== true) return undefined
    let active = true
    setContext({ id: initialContractId, contract: null, loading: true, error: '' })
    contractControlAPI.eligible({ kind: 'FUEL' }).then(({ data }) => {
      if (!active) return
      const contract = data.find((row) => row.id === initialContractId)
      setContext({ id: initialContractId, contract, loading: false, error: contract ? '' : 'O contrato de origem não está liberado. Volte ao contrato para conferir as pendências.' })
    }).catch((err) => { if (active) setContext({ id: initialContractId, contract: null, loading: false, error: getApiErrorMessage(err, 'Não foi possível consultar os postos do contrato.') }) })
    return () => { active = false }
  }, [initialContractId, funding.enabled, contextRevision])
  const contextual = Boolean(initialContractId && funding.enabled !== false)
  const contextLoading = contextual && (context.id !== initialContractId || context.loading)
  const contextError = contextual && context.id === initialContractId ? context.error : ''
  const stationOptions = funding.enabled === false ? fuelStations : contextStations
  const ready = funding.ready && !contextLoading && !contextError && (!contextual || stationOptions.some((station) => station.id === form.fuel_station_id))

  const submitLabel = useMemo(() => (submitting ? 'Criando ordem...' : 'Criar ordem'), [submitting])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!ready) { setError(contextError || funding.error || 'Confira o contrato, o combustível e a reserva antes de emitir.'); return }

    if (!form.vehicle_id) {
      setError('Selecione um veículo para emitir a ordem.')
      return
    }

    if (!form.fuel_station_id) {
      setError('Selecione o posto responsável pela ordem.')
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
      const payload = {
        ...funding.payload,
        vehicle_id: form.vehicle_id,
        expires_at: new Date(form.expires_at).toISOString(),
        fuel_station_id: form.fuel_station_id,
      }
      if (form.organization_id) payload.organization_id = form.organization_id
      if (form.requested_liters) payload.requested_liters = Number(form.requested_liters)
      if (form.notes.trim()) payload.notes = form.notes.trim()

      const { data } = await fuelSupplyOrdersAPI.create(payload)
      onSuccess?.({
        message: 'Ordem de abastecimento criada com sucesso.',
        order: data,
      })
      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível criar a ordem de abastecimento.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      <ContractReturnBanner returnTo={returnTo} compact saving={submitting} />
      {contextLoading ? <p className="modal-field-span" role="status">Consultando os postos do contrato…</p> : null}
      {contextError ? <div className="alert alert-error modal-field-span" role="alert">{contextError}<button className="ghost-button" type="button" onClick={() => setContextRevision((value) => value + 1)}>Tentar novamente</button></div> : null}
      {contextual && context.contract ? <p className="modal-field-span muted">Contrato {context.contract.number} · {context.contract.supplier_name || 'Postos vinculados ao contrato selecionado'}</p> : null}
      {error ? <div className="alert alert-error modal-field-span" role="alert">{error}{funding.enabled ? <button className="ghost-button" type="button" onClick={funding.refresh}>Atualizar saldo e preço</button> : null}</div> : null}

      <div className="form-field">
        <label>Veículo</label>
        <SearchableSelect
          value={form.vehicle_id} onOpen={onVehicleOptionsOpen}
          onChange={(value) => setForm((current) => ({ ...current, vehicle_id: value }))}
          options={vehicles.filter((vehicle) => vehicle.can_operate_vehicle !== false).map(buildVehicleOption)}
          placeholder="Selecione o veículo"
          searchPlaceholder="Buscar veículo"
          ariaLabel="Veículo"
        />
      </div>

      <div className="form-field">
        <label>Posto</label>
        <SearchableSelect
          value={form.fuel_station_id}
          onChange={(value) => setForm((current) => ({ ...current, fuel_station_id: value }))}
          options={stationOptions.map(buildFuelStationOption)}
          placeholder="Selecione o posto"
          searchPlaceholder="Buscar posto"
          ariaLabel="Posto"
        />
      </div>

      <div className="form-field">
        <label>Órgão solicitante</label>
        <SearchableSelect
          value={form.organization_id}
          onChange={(value) => setForm((current) => ({ ...current, organization_id: value }))}
          options={[{ value: '', label: 'Não informado' }, ...organizations.map((org) => ({ value: org.id, label: org.name }))]}
          placeholder="Selecione o órgão"
          searchPlaceholder="Buscar órgão"
          ariaLabel="Órgão solicitante"
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
        <label htmlFor="fuel-order-requested-liters">Litros previstos</label>
        <input
          id="fuel-order-requested-liters"
          type="number"
          min="0"
          step="0.01"
          className="app-input"
          value={form.requested_liters}
          onChange={(event) => setForm((current) => ({ ...current, requested_liters: event.target.value }))}
        />
      </div>

      <div className="form-field modal-field-span">
        <label>Observações</label>
        <textarea
          className="app-textarea"
          rows="4"
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          placeholder="Informações adicionais para o posto e para a equipe solicitante."
        />
      </div>

      <ContractFundingFields funding={funding} />
      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting || !ready}>
          {submitLabel}
        </button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}
