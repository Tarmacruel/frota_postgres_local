import { useState } from 'react'
import { possessionAPI } from '../api/possession'
import { getApiErrorMessage } from '../utils/apiError'

function toDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

export default function PossessionForm({ vehicles, onClose, onSuccess }) {
  const [form, setForm] = useState({
    vehicle_id: vehicles[0]?.id || '',
    driver_name: '',
    driver_document: '',
    driver_contact: '',
    start_date: toDateTimeInput(new Date().toISOString()),
    observation: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    if (!form.vehicle_id) {
      setError('Selecione um veiculo para continuar.')
      return
    }

    try {
      setSubmitting(true)
      setError('')
      await possessionAPI.create({
        vehicle_id: form.vehicle_id,
        driver_name: form.driver_name,
        driver_document: form.driver_document || null,
        driver_contact: form.driver_contact || null,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
        observation: form.observation || null,
      })
      onSuccess?.('Posse registrada com sucesso. Se havia posse ativa, ela foi encerrada automaticamente.')
      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel registrar a posse.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      {error ? <div className="alert alert-error modal-field-span">{error}</div> : null}

      <div className="form-field">
        <label htmlFor="possession-vehicle">Veiculo</label>
        <select
          id="possession-vehicle"
          className="app-select"
          value={form.vehicle_id}
          onChange={(event) => setForm({ ...form, vehicle_id: event.target.value })}
        >
          <option value="">Selecione</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.plate} - {vehicle.brand} {vehicle.model}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="possession-start">Inicio da posse</label>
        <input
          id="possession-start"
          type="datetime-local"
          className="app-input"
          value={form.start_date}
          onChange={(event) => setForm({ ...form, start_date: event.target.value })}
        />
      </div>

      <div className="form-field">
        <label htmlFor="possession-name">Condutor</label>
        <input
          id="possession-name"
          className="app-input"
          placeholder="Nome completo"
          value={form.driver_name}
          onChange={(event) => setForm({ ...form, driver_name: event.target.value })}
        />
      </div>

      <div className="form-field">
        <label htmlFor="possession-document">Documento</label>
        <input
          id="possession-document"
          className="app-input"
          placeholder="CPF ou documento"
          value={form.driver_document}
          onChange={(event) => setForm({ ...form, driver_document: event.target.value })}
        />
      </div>

      <div className="form-field modal-field-span">
        <label htmlFor="possession-contact">Contato</label>
        <input
          id="possession-contact"
          className="app-input"
          placeholder="Telefone ou contato rapido"
          value={form.driver_contact}
          onChange={(event) => setForm({ ...form, driver_contact: event.target.value })}
        />
      </div>

      <div className="form-field modal-field-span">
        <label htmlFor="possession-observation">Observacao</label>
        <textarea
          id="possession-observation"
          className="app-textarea"
          rows="4"
          placeholder="Contexto da posse, rota ou observacoes adicionais."
          value={form.observation}
          onChange={(event) => setForm({ ...form, observation: event.target.value })}
        />
      </div>

      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting || vehicles.length === 0}>
          {submitting ? 'Salvando...' : 'Registrar posse'}
        </button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}
