const statusLabels = {
  EM_ANDAMENTO: 'Em andamento',
  ENCERRADA: 'Encerrada',
  CANCELADA: 'Cancelada',
}

function formatDateTime(value) {
  if (!value) return 'Não registrado'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Não registrado' : date.toLocaleString('pt-BR')
}

function formatOdometer(value) {
  return value === null || value === undefined ? 'Não registrado' : `${value} km`
}

export default function TripTimeline({ trips, canEdit, onAddDestination, onEnd, onCancel }) {
  if (trips.length === 0) {
    return (
      <div className="trip-empty-state">
        <strong>Nenhuma rota registrada</strong>
        <p>Esta posse pode ser um registro legado ou ainda não teve saídas operacionais. Nenhuma rota foi criada artificialmente.</p>
      </div>
    )
  }

  return (
    <ol className="trip-timeline" aria-label="Linha do tempo das rotas, da mais recente para a mais antiga">
      {trips.map((trip) => {
        const isOpen = trip.status === 'EM_ANDAMENTO'
        const restricted = Boolean(trip.operational_details_restricted)
        return (
          <li key={trip.id} className={`trip-timeline-item trip-status-${trip.status}`}>
            <div className="trip-timeline-marker" aria-hidden="true">{trip.sequence_number}</div>
            <article className="trip-timeline-content" aria-labelledby={`trip-${trip.id}-title`}>
              <header className="trip-timeline-heading">
                <div>
                  <span className="trip-eyebrow">Rota {trip.sequence_number}</span>
                  <h4 id={`trip-${trip.id}-title`}>{trip.purpose}</h4>
                </div>
                <span className={`status-badge trip-status-badge trip-status-${trip.status}`}>
                  {statusLabels[trip.status] || trip.status}
                </span>
              </header>

              {restricted ? (
                <p className="trip-restricted-note">Detalhes operacionais restritos para este perfil. O backend omitiu origem, destinos e observações.</p>
              ) : null}

              <dl className="trip-facts">
                <div><dt>Origem</dt><dd>{restricted ? 'Restrito' : trip.origin}</dd></div>
                <div><dt>Saída</dt><dd>{formatDateTime(trip.departure_at)}</dd></div>
                <div><dt>Retorno</dt><dd>{formatDateTime(trip.return_at)}</dd></div>
                <div><dt>Hodômetro inicial</dt><dd>{formatOdometer(trip.start_odometer_km)}</dd></div>
                <div><dt>Hodômetro final</dt><dd>{formatOdometer(trip.end_odometer_km)}</dd></div>
                <div><dt>Quilômetros</dt><dd>{formatOdometer(trip.kilometers_driven)}</dd></div>
              </dl>

              {!restricted && trip.destinations.length > 0 ? (
                <div className="trip-destinations-readonly">
                  <strong>Destinos em ordem</strong>
                  <ol>
                    {trip.destinations.map((destination) => (
                      <li key={destination.id}>
                        <span>{destination.sequence_number}</span>
                        <div>
                          <strong>{destination.description}</strong>
                          {destination.address_reference ? <small>{destination.address_reference}</small> : null}
                          {destination.observation ? <small>{destination.observation}</small> : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : !restricted ? <p className="muted">Sem destinos cadastrados nesta rota.</p> : null}

              {!restricted && trip.observation ? <p className="trip-observation"><strong>Observação:</strong> {trip.observation}</p> : null}
              {!restricted && trip.cancellation_reason ? <p className="trip-cancellation"><strong>Justificativa do cancelamento:</strong> {trip.cancellation_reason}</p> : null}

              {isOpen && canEdit ? (
                <div className="trip-operational-actions" aria-label={`Ações da rota ${trip.sequence_number}`}>
                  <button type="button" className="secondary-button" onClick={() => onAddDestination(trip)}>
                    Adicionar destino
                  </button>
                  <button type="button" className="app-button" onClick={() => onEnd(trip)}>
                    Registrar retorno da rota
                  </button>
                  <button type="button" className="ghost-button danger-text" onClick={() => onCancel(trip)}>
                    Cancelar rota
                  </button>
                </div>
              ) : null}
            </article>
          </li>
        )
      })}
    </ol>
  )
}
