import TripDestinationEditor from './TripDestinationEditor'

export default function InitialTripFields({ enabled, onEnabledChange, trip, onChange, disabled = false }) {
  return (
    <section className="initial-trip-section modal-field-span">
      <label className="trip-toggle" htmlFor="possession-initial-trip-enabled">
        <input
          id="possession-initial-trip-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          disabled={disabled}
        />
        <span>
          <strong>Rota inicial — opcional</strong>
          <small>Registre a primeira saída na mesma operação atômica da posse.</small>
        </span>
      </label>

      {enabled ? (
        <div className="initial-trip-fields" role="region" aria-label="Dados da rota inicial">
          <div className="form-field">
            <label htmlFor="initial-trip-origin">Origem</label>
            <input
              id="initial-trip-origin"
              className="app-input"
              value={trip.origin}
              onChange={(event) => onChange({ ...trip, origin: event.target.value })}
              maxLength={255}
              required
              disabled={disabled}
            />
          </div>
          <div className="form-field">
            <label htmlFor="initial-trip-purpose">Finalidade</label>
            <input
              id="initial-trip-purpose"
              className="app-input"
              value={trip.purpose}
              onChange={(event) => onChange({ ...trip, purpose: event.target.value })}
              maxLength={500}
              required
              disabled={disabled}
            />
          </div>
          <div className="form-field">
            <label htmlFor="initial-trip-departure">Saída</label>
            <input
              id="initial-trip-departure"
              type="datetime-local"
              className="app-input"
              value={trip.departure_at}
              onChange={(event) => onChange({ ...trip, departure_at: event.target.value })}
              required
              disabled={disabled}
            />
          </div>
          <div className="form-field">
            <label htmlFor="initial-trip-odometer">Hodômetro inicial da rota (km)</label>
            <input
              id="initial-trip-odometer"
              type="number"
              min="0"
              step="0.1"
              className="app-input"
              value={trip.start_odometer_km}
              onChange={(event) => onChange({ ...trip, start_odometer_km: event.target.value })}
              required
              disabled={disabled}
            />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="initial-trip-observation">Observação da rota</label>
            <textarea
              id="initial-trip-observation"
              className="app-textarea"
              rows="3"
              value={trip.observation}
              onChange={(event) => onChange({ ...trip, observation: event.target.value })}
              maxLength={2000}
              disabled={disabled}
            />
            <span className="helper-text">Evite nomes, documentos ou contatos que não sejam necessários à operação.</span>
          </div>
          <TripDestinationEditor
            idPrefix="initial-trip"
            destinations={trip.destinations}
            onChange={(destinations) => onChange({ ...trip, destinations })}
            disabled={disabled}
          />
        </div>
      ) : null}
    </section>
  )
}
