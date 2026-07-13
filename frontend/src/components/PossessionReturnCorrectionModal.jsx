import { useRef } from 'react'
import Modal from './Modal'

export default function PossessionReturnCorrectionModal({ record, context, form, saving, error, onChange, onClose, onSubmit }) {
  const odometerRef = useRef(null)
  if (!record || !context) return null
  const current = context.current_confirmation
  const ready = form.end_odometer_km !== ''
    && form.vehicle_condition_notes.trim().length >= 3
    && form.correction_reason.trim().length >= 8
    && form.declaration_accepted

  return (
    <Modal
      open
      title="Retificar confirmação de devolução"
      description={`Posse nº ${context.possession_public_number} · versão atual ${current?.version ?? '—'}`}
      onClose={onClose}
      canClose={!saving}
      initialFocusRef={odometerRef}
    >
      <form onSubmit={onSubmit} className="form-grid modal-form-grid possession-return-form">
        <div className="alert alert-warning modal-field-span">
          A versão atual não será alterada nem apagada. A correção criará uma nova versão e registrará a justificativa na auditoria.
        </div>
        <div className="form-field">
          <label htmlFor="correction-end-odometer">Hodômetro final corrigido (km)</label>
          <input ref={odometerRef} id="correction-end-odometer" className="app-input" type="number" min={context.minimum_end_odometer_km} step="0.1" required value={form.end_odometer_km} onChange={(event) => onChange({ end_odometer_km: event.target.value })} disabled={saving} />
        </div>
        <div className="form-field modal-field-span">
          <label htmlFor="correction-condition">Condições do veículo corrigidas</label>
          <textarea id="correction-condition" className="app-textarea" rows="4" minLength="3" maxLength="4000" required value={form.vehicle_condition_notes} onChange={(event) => onChange({ vehicle_condition_notes: event.target.value })} disabled={saving} />
        </div>
        <div className="form-field modal-field-span">
          <label htmlFor="correction-reason">Justificativa administrativa</label>
          <textarea id="correction-reason" className="app-textarea" rows="3" minLength="8" maxLength="1000" required value={form.correction_reason} onChange={(event) => onChange({ correction_reason: event.target.value })} disabled={saving} />
        </div>
        <section className="possession-return-declaration modal-field-span" aria-labelledby="correction-declaration-title">
          <div className="possession-return-declaration-heading"><strong id="correction-declaration-title">Declaração v{context.declaration.version}</strong></div>
          <p>{context.declaration.text}</p>
          <label className="checkbox-line possession-return-acceptance">
            <input type="checkbox" checked={form.declaration_accepted} onChange={(event) => onChange({ declaration_accepted: event.target.checked })} disabled={saving} />
            <span>Li integralmente e confirmo a declaração para esta nova versão.</span>
          </label>
        </section>
        <div className="modal-field-span" role="status" aria-live="polite">
          {saving ? <span className="helper-text">Criando nova versão…</span> : null}
          {error ? <div className="alert alert-error">{error}</div> : null}
        </div>
        <div className="actions-inline modal-actions modal-field-span">
          <button type="submit" className="app-button" disabled={saving || !ready}>{saving ? 'Salvando…' : 'Criar nova versão'}</button>
          <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
