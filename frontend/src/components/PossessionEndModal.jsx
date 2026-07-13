import { useRef } from 'react'
import Modal from './Modal'

export default function PossessionEndModal({
  record,
  context,
  form,
  ending,
  error,
  onChange,
  onClose,
  onSubmit,
}) {
  const dateInputRef = useRef(null)
  if (!record) return null

  const ready = Boolean(
    context
    && form.end_date
    && form.end_odometer_km !== ''
    && form.vehicle_condition_notes.trim().length >= 3
    && form.declaration_accepted,
  )

  return (
    <Modal
      open
      title="Encerrar posse e registrar devolução"
      description={`Posse nº ${context?.possession_public_number ?? record.public_number} · ${record.vehicle_plate} · ${record.driver_name}`}
      onClose={onClose}
      canClose={!ending}
      initialFocusRef={dateInputRef}
    >
      <form onSubmit={onSubmit} className="form-grid modal-form-grid possession-return-form">
        <div className="possession-return-context modal-field-span" aria-label="Contexto da devolução">
          <span>Entrega: {new Date(record.start_date).toLocaleString('pt-BR')}</span>
          <span>Hodômetro mínimo: {Number(context?.minimum_end_odometer_km || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} km</span>
          <span>Status das rotas: {context?.has_open_trip ? 'há rota em andamento' : 'nenhuma rota em andamento'}</span>
        </div>

        <div className="form-field">
          <label htmlFor="end-possession-date">Data e hora da devolução</label>
          <input
            ref={dateInputRef}
            id="end-possession-date"
            type="datetime-local"
            className="app-input"
            value={form.end_date}
            onChange={(event) => onChange({ end_date: event.target.value })}
            disabled={ending}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="end-possession-odometer">Hodômetro final (km)</label>
          <input
            id="end-possession-odometer"
            type="number"
            min={context?.minimum_end_odometer_km || 0}
            step="0.1"
            className="app-input"
            value={form.end_odometer_km}
            onChange={(event) => onChange({ end_odometer_km: event.target.value })}
            disabled={ending}
            required
          />
        </div>

        <div className="form-field modal-field-span">
          <label htmlFor="end-possession-condition">Condições do veículo na devolução</label>
          <textarea
            id="end-possession-condition"
            className="app-textarea"
            rows="4"
            minLength="3"
            maxLength="4000"
            value={form.vehicle_condition_notes}
            onChange={(event) => onChange({ vehicle_condition_notes: event.target.value })}
            disabled={ending}
            required
          />
          <span className="helper-text">Registre avarias, ressalvas ou “Sem ressalvas”, conforme a conferência realizada.</span>
        </div>

        <section className="possession-return-declaration modal-field-span" aria-labelledby="return-declaration-title">
          <div className="possession-return-declaration-heading">
            <strong id="return-declaration-title">Declaração de devolução</strong>
            <span>Versão {context?.declaration?.version}</span>
          </div>
          <p>{context?.declaration?.text}</p>
          <label className="checkbox-line possession-return-acceptance">
            <input
              type="checkbox"
              checked={form.declaration_accepted}
              onChange={(event) => onChange({ declaration_accepted: event.target.checked })}
              disabled={ending}
            />
            <span>Li integralmente e confirmo a declaração acima.</span>
          </label>
        </section>

        <div className="modal-field-span" role="status" aria-live="polite">
          {ending ? <span className="helper-text">Registrando confirmação e encerramento em uma única operação…</span> : null}
          {error ? <div className="alert alert-error">{error}</div> : null}
        </div>

        <div className="actions-inline modal-actions modal-field-span">
          <button className="app-button" type="submit" disabled={ending || !ready || context?.has_open_trip}>
            {ending ? 'Confirmando…' : 'Confirmar devolução e encerrar posse'}
          </button>
          <button className="ghost-button" type="button" onClick={onClose} disabled={ending}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
