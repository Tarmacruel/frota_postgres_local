import { createDestinationDraft } from '../utils/tripDestination'

export default function TripDestinationEditor({ destinations, onChange, idPrefix, disabled = false }) {
  function updateDestination(index, field, value) {
    onChange(destinations.map((destination, currentIndex) => (
      currentIndex === index ? { ...destination, [field]: value } : destination
    )))
  }

  function removeDestination(index) {
    onChange(destinations.filter((_, currentIndex) => currentIndex !== index))
  }

  function moveDestination(index, direction) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= destinations.length) return
    const reordered = [...destinations]
    const [destination] = reordered.splice(index, 1)
    reordered.splice(nextIndex, 0, destination)
    onChange(reordered)
  }

  return (
    <section className="trip-destination-editor" aria-labelledby={`${idPrefix}-destinations-title`}>
      <div className="trip-section-heading">
        <div>
          <h4 id={`${idPrefix}-destinations-title`}>Destinos</h4>
          <p>Organize as paradas na ordem operacional. Endereço e observação são opcionais.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onChange([...destinations, createDestinationDraft()])}
          disabled={disabled || destinations.length >= 50}
        >
          Adicionar destino
        </button>
      </div>

      {destinations.length === 0 ? (
        <p className="trip-empty-copy">Nenhum destino informado. O contrato permite iniciar a rota sem paradas cadastradas.</p>
      ) : (
        <ol className="trip-destination-drafts">
          {destinations.map((destination, index) => {
            const descriptionId = `${idPrefix}-destination-${index}-description`
            const addressId = `${idPrefix}-destination-${index}-address`
            const observationId = `${idPrefix}-destination-${index}-observation`
            return (
              <li key={destination._key} className="trip-destination-draft">
                <div className="trip-destination-index" aria-hidden="true">{index + 1}</div>
                <div className="trip-destination-fields">
                  <div className="form-field">
                    <label htmlFor={descriptionId}>Descrição do destino {index + 1}</label>
                    <input
                      id={descriptionId}
                      className="app-input"
                      value={destination.description}
                      onChange={(event) => updateDestination(index, 'description', event.target.value)}
                      maxLength={300}
                      required
                      disabled={disabled}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={addressId}>Endereço ou referência</label>
                    <input
                      id={addressId}
                      className="app-input"
                      value={destination.address_reference}
                      onChange={(event) => updateDestination(index, 'address_reference', event.target.value)}
                      maxLength={500}
                      disabled={disabled}
                    />
                  </div>
                  <div className="form-field trip-destination-observation">
                    <label htmlFor={observationId}>Observação</label>
                    <textarea
                      id={observationId}
                      className="app-textarea"
                      rows="2"
                      value={destination.observation}
                      onChange={(event) => updateDestination(index, 'observation', event.target.value)}
                      maxLength={2000}
                      disabled={disabled}
                    />
                  </div>
                </div>
                <div className="trip-destination-actions" aria-label={`Reordenar destino ${index + 1}`}>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => moveDestination(index, -1)}
                    disabled={disabled || index === 0}
                    aria-label={`Mover destino ${index + 1} para cima`}
                  >
                    Mover para cima
                  </button>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => moveDestination(index, 1)}
                    disabled={disabled || index === destinations.length - 1}
                    aria-label={`Mover destino ${index + 1} para baixo`}
                  >
                    Mover para baixo
                  </button>
                  <button
                    type="button"
                    className="mini-button danger"
                    onClick={() => removeDestination(index)}
                    disabled={disabled}
                    aria-label={`Remover destino ${index + 1}`}
                  >
                    Remover
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
