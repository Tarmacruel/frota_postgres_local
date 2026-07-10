import { useMemo, useState } from 'react'
import { maintenanceAPI } from '../api/maintenance'
import SearchableSelect from './SearchableSelect'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'

function buildInitialState(initialData, vehicles) {
  if (initialData) {
    return {
      vehicle_id: initialData.vehicle_id,
      start_date: toDateTimeLocalValue(initialData.start_date),
      end_date: toDateTimeLocalValue(initialData.end_date),
      service_description: initialData.service_description || '',
      parts_replaced: initialData.parts_replaced || '',
      total_cost: initialData.total_cost ?? '',
    }
  }

  return {
    vehicle_id: '',
    start_date: toDateTimeLocalValue(new Date().toISOString()),
    end_date: '',
    service_description: '',
    parts_replaced: '',
    total_cost: '',
  }
}

function buildVehicleOption(vehicle) {
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação'
  return {
    value: vehicle.id,
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: `${vehicle.ownership_type === 'LOCADO' ? 'Locado' : 'Próprio'} | ${locationLabel}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.chassis_number, locationLabel].filter(Boolean).join(' '),
  }
}

export default function MaintenanceForm({ vehicles, initialData = null, onClose, onSuccess }) {
  const isEdit = Boolean(initialData?.id)
  const [form, setForm] = useState(() => buildInitialState(initialData, vehicles))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submitLabel = useMemo(() => {
    if (submitting) return 'Salvando...'
    return isEdit ? 'Atualizar manutenção' : 'Registrar manutenção'
  }, [isEdit, submitting])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!form.vehicle_id) {
      setError('Selecione um veículo para continuar.')
      return
    }

    try {
      setSubmitting(true)
      setError('')

      if (isEdit) {
        await maintenanceAPI.update(initialData.id, {
          end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
          service_description: form.service_description,
          parts_replaced: form.parts_replaced || null,
          total_cost: Number(form.total_cost),
        })
        onSuccess?.('Manutenção atualizada com sucesso.')
      } else {
        await maintenanceAPI.create({
          vehicle_id: form.vehicle_id,
          start_date: new Date(form.start_date).toISOString(),
          end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
          service_description: form.service_description,
          parts_replaced: form.parts_replaced || null,
          total_cost: Number(form.total_cost),
        })
        onSuccess?.('Manutenção registrada com sucesso.')
      }

      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar a manutenção.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      {error ? <div className="alert alert-error modal-field-span">{error}</div> : null}

      <div className="form-field">
        <label>Veículo</label>
        <SearchableSelect
          value={form.vehicle_id}
          onChange={(value) => setForm({ ...form, vehicle_id: value })}
          options={vehicles.map(buildVehicleOption)}
          placeholder="Selecione o veículo"
          searchPlaceholder="Buscar veículo por placa, modelo ou chassi"
          disabled={isEdit}
          emptyLabel="Nenhum veículo disponível."
        />
      </div>

      <div className="form-field">
        <label htmlFor="maintenance-start">Início</label>
        <input
          id="maintenance-start"
          type="datetime-local"
          className="app-input"
          value={form.start_date}
          disabled={isEdit}
          onChange={(event) => setForm({ ...form, start_date: event.target.value })}
        />
      </div>

      <div className="form-field">
        <label htmlFor="maintenance-end">Conclusão</label>
        <input
          id="maintenance-end"
          type="datetime-local"
          className="app-input"
          value={form.end_date}
          onChange={(event) => setForm({ ...form, end_date: event.target.value })}
        />
      </div>

      <div className="form-field">
        <label htmlFor="maintenance-cost">Custo total</label>
        <input
          id="maintenance-cost"
          type="number"
          min="0"
          step="0.01"
          className="app-input"
          placeholder="0,00"
          value={form.total_cost}
          onChange={(event) => setForm({ ...form, total_cost: event.target.value })}
        />
      </div>

      <div className="form-field modal-field-span">
        <label htmlFor="maintenance-description">Serviço realizado</label>
        <textarea
          id="maintenance-description"
          className="app-textarea"
          rows="5"
          placeholder="Descreva o serviço executado e o contexto da manutenção."
          value={form.service_description}
          onChange={(event) => setForm({ ...form, service_description: event.target.value })}
        />
      </div>

      <div className="form-field modal-field-span">
        <label htmlFor="maintenance-parts">Peças trocadas</label>
        <textarea
          id="maintenance-parts"
          className="app-textarea"
          rows="4"
          placeholder="Itens substituídos, observações e referências."
          value={form.parts_replaced}
          onChange={(event) => setForm({ ...form, parts_replaced: event.target.value })}
        />
      </div>

      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting || vehicles.length === 0}>
          {submitLabel}
        </button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}
