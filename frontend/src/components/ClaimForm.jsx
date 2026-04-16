import { useState } from 'react'
import { claimsAPI } from '../api/claims'
import DriverSelect from './DriverSelect'
import SearchableSelect from './SearchableSelect'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'

const typeOptions = ['COLISAO', 'ROUBO', 'FURTO', 'AVARIA', 'OUTRO']
const statusOptions = ['ABERTO', 'EM_ANALISE', 'ENCERRADO']

function vehicleOption(vehicle) {
  const location = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotacao'
  return {
    value: vehicle.id,
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: `${vehicle.ownership_type} | ${location}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.chassis_number, location].filter(Boolean).join(' '),
  }
}

export default function ClaimForm({ vehicles, initialData = null, onSuccess, onClose }) {
  const [form, setForm] = useState({
    vehicle_id: initialData?.vehicle_id || '',
    driver_id: initialData?.driver_id || '',
    data_ocorrencia: initialData?.data_ocorrencia ? toDateTimeLocalValue(initialData.data_ocorrencia) : toDateTimeLocalValue(new Date()),
    tipo: initialData?.tipo || 'COLISAO',
    descricao: initialData?.descricao || '',
    local: initialData?.local || '',
    boletim_ocorrencia: initialData?.boletim_ocorrencia || '',
    valor_estimado: initialData?.valor_estimado || '',
    status: initialData?.status || 'ABERTO',
    justificativa_encerramento: initialData?.justificativa_encerramento || '',
    anexos: Array.isArray(initialData?.anexos) ? initialData.anexos.join('\n') : '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      const payload = {
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id || null,
        data_ocorrencia: new Date(form.data_ocorrencia).toISOString(),
        tipo: form.tipo,
        descricao: form.descricao,
        local: form.local,
        boletim_ocorrencia: form.boletim_ocorrencia || null,
        valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : null,
        status: form.status,
        justificativa_encerramento: form.justificativa_encerramento || null,
        anexos: form.anexos
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
      }

      if (initialData?.id) {
        await claimsAPI.update(initialData.id, payload)
        onSuccess?.('Sinistro atualizado com sucesso.')
      } else {
        await claimsAPI.create(payload)
        onSuccess?.('Sinistro registrado com sucesso.')
      }
      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o sinistro.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      {error ? <div className="alert alert-error modal-field-span">{error}</div> : null}

      <div className="form-field modal-field-span">
        <label>Veiculo</label>
        <SearchableSelect
          value={form.vehicle_id}
          onChange={(value) => setForm({ ...form, vehicle_id: value })}
          options={vehicles.map(vehicleOption)}
          placeholder="Selecione o veiculo envolvido"
          searchPlaceholder="Buscar por placa, modelo ou chassi"
        />
      </div>

      <div className="form-field">
        <label>Condutor</label>
        <DriverSelect
          value={form.driver_id}
          onChange={(driver) => setForm({ ...form, driver_id: driver?.id || '' })}
          placeholder="Condutor no momento do sinistro"
        />
      </div>

      <div className="form-field">
        <label htmlFor="claim-date">Data e hora</label>
        <input id="claim-date" type="datetime-local" className="app-input" value={form.data_ocorrencia} onChange={(event) => setForm({ ...form, data_ocorrencia: event.target.value })} />
      </div>

      <div className="form-field">
        <label htmlFor="claim-type">Tipo</label>
        <select id="claim-type" className="app-select" value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}>
          {typeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="claim-status">Status</label>
        <select id="claim-status" className="app-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>

      <div className="form-field modal-field-span">
        <label htmlFor="claim-description">Descricao</label>
        <textarea id="claim-description" className="app-textarea" rows="4" value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} />
      </div>

      <div className="form-field modal-field-span">
        <label htmlFor="claim-location">Local</label>
        <input id="claim-location" className="app-input" value={form.local} onChange={(event) => setForm({ ...form, local: event.target.value })} />
      </div>

      <div className="form-field">
        <label htmlFor="claim-bo">Boletim de ocorrencia</label>
        <input id="claim-bo" className="app-input" value={form.boletim_ocorrencia} onChange={(event) => setForm({ ...form, boletim_ocorrencia: event.target.value })} />
      </div>

      <div className="form-field">
        <label htmlFor="claim-value">Valor estimado</label>
        <input id="claim-value" type="number" min="0" step="0.01" className="app-input" value={form.valor_estimado} onChange={(event) => setForm({ ...form, valor_estimado: event.target.value })} />
      </div>

      <div className="form-field modal-field-span">
        <label htmlFor="claim-justification">Justificativa de encerramento</label>
        <textarea id="claim-justification" className="app-textarea" rows="3" value={form.justificativa_encerramento} onChange={(event) => setForm({ ...form, justificativa_encerramento: event.target.value })} />
      </div>

      <div className="form-field modal-field-span">
        <label htmlFor="claim-attachments">Anexos (URLs ou referencias, uma por linha)</label>
        <textarea id="claim-attachments" className="app-textarea" rows="3" value={form.anexos} onChange={(event) => setForm({ ...form, anexos: event.target.value })} />
      </div>

      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting || !form.vehicle_id}>
          {submitting ? 'Salvando...' : initialData?.id ? 'Atualizar sinistro' : 'Registrar sinistro'}
        </button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}