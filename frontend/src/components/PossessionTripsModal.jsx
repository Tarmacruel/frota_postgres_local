import { useEffect, useRef, useState } from 'react'
import { possessionAPI } from '../api/possession'
import { getApiErrorMessage } from '../utils/apiError'
import { getHttpStatus, getValidationFieldErrors } from '../utils/httpError'
import { toDateTimeLocalValue } from '../utils/datetime'
import { createDestinationDraft, serializeDestination } from '../utils/tripDestination'
import Modal from './Modal'
import TripDestinationEditor from './TripDestinationEditor'
import TripTimeline from './TripTimeline'

const PAGE_LIMIT = 10

function buildTripForm({ origin = '', odometer = '' } = {}) {
  return {
    origin,
    purpose: '',
    departure_at: toDateTimeLocalValue(new Date()),
    start_odometer_km: odometer ?? '',
    observation: '',
    destinations: [],
  }
}

function buildEndForm(trip) {
  return {
    return_at: toDateTimeLocalValue(new Date()),
    end_odometer_km: trip?.end_odometer_km ?? trip?.start_odometer_km ?? '',
    observation: trip?.observation || '',
  }
}

function apiStatusMessage(error, fallback) {
  const status = getHttpStatus(error)
  if (status === 401) return 'Sua sessão expirou. Entre novamente para continuar.'
  if (status === 403) return 'Seu perfil não possui permissão para esta ação.'
  if (status === 409) return getApiErrorMessage(error, 'O estado da posse ou da rota mudou. Os dados foram atualizados.')
  if (status === 422) return getApiErrorMessage(error, 'Revise os campos informados.')
  return getApiErrorMessage(error, fallback)
}

export default function PossessionTripsModal({
  possession,
  suggestedOrigin = '',
  initialAction = 'timeline',
  canCreate,
  canEdit,
  onClose,
  onStateChange,
  onUnauthorized,
}) {
  const [trips, setTrips] = useState([])
  const [activeTrip, setActiveTrip] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, has_next: false, has_prev: false })
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('timeline')
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [tripForm, setTripForm] = useState(buildTripForm())
  const [destinationDrafts, setDestinationDrafts] = useState([createDestinationDraft()])
  const [endForm, setEndForm] = useState(buildEndForm(null))
  const [cancelReason, setCancelReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const abortRef = useRef(null)
  const firstFieldRef = useRef(null)
  const submittingRef = useRef(false)

  const openTrip = activeTrip

  function notifyState(nextTrips, nextPagination, extra = {}) {
    onStateChange?.({
      openTrip: extra.openTrip ?? nextTrips.find((trip) => trip.status === 'EM_ANDAMENTO') ?? null,
      total: nextPagination.total,
      loading: false,
      error: '',
      ...extra,
    })
  }

  async function handleUnauthorized(error) {
    if (getHttpStatus(error) !== 401) return false
    await onUnauthorized?.()
    return true
  }

  async function loadTrips(page = 1, { announce = false, requestedAction = 'timeline' } = {}) {
    if (!possession) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError('')
    try {
      const response = await possessionAPI.listTrips(
        possession.id,
        { page, limit: PAGE_LIMIT },
        { signal: controller.signal },
      )
      const nextTrips = response.data.data
      const nextPagination = response.data.pagination
      let nextOpenTrip = nextTrips.find((trip) => trip.status === 'EM_ANDAMENTO') || null
      if (page > 1) {
        const openResponse = await possessionAPI.listTrips(
          possession.id,
          { page: 1, limit: 1, status: 'EM_ANDAMENTO' },
          { signal: controller.signal },
        )
        nextOpenTrip = openResponse.data.data[0] || null
      }
      setTrips(nextTrips)
      setActiveTrip(nextOpenTrip)
      setPagination(nextPagination)
      notifyState(nextTrips, nextPagination, { openTrip: nextOpenTrip })
      if (announce) setFeedback('Rotas atualizadas com o estado mais recente do servidor.')

      const action = requestedAction
      if (action === 'create' && canCreate && possession.is_active && !nextOpenTrip) {
        const latestTrip = nextTrips[0]
        setTripForm(buildTripForm({
          origin: suggestedOrigin,
          odometer: latestTrip?.end_odometer_km ?? possession.start_odometer_km ?? '',
        }))
        setView('create')
      } else if (['add', 'end', 'cancel'].includes(action) && nextOpenTrip && canEdit) {
        openAction(action, nextOpenTrip)
      } else {
        setView('timeline')
      }
    } catch (requestError) {
      if (controller.signal.aborted) return
      if (await handleUnauthorized(requestError)) {
        setError('Sua sessão expirou. Entre novamente para continuar.')
        return
      }
      const message = apiStatusMessage(requestError, 'Não foi possível carregar as rotas desta posse.')
      setError(message)
      onStateChange?.({ openTrip: null, total: 0, loading: false, error: message })
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    if (!possession) return undefined
    setTrips([])
    setActiveTrip(null)
    setPagination({ page: 1, pages: 1, total: 0, has_next: false, has_prev: false })
    setView('timeline')
    setSelectedTrip(null)
    setError('')
    setFeedback('')
    setFieldErrors({})
    loadTrips(1, { requestedAction: initialAction })
    return () => abortRef.current?.abort()
  // A troca de posse/ação reinicializa deliberadamente o workspace; loadTrips lê o snapshot desses props.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [possession?.id, initialAction])

  useEffect(() => {
    if (view === 'timeline') return undefined
    const timeoutId = window.setTimeout(() => firstFieldRef.current?.focus(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [view])

  function openAction(action, trip = null) {
    setSelectedTrip(trip)
    setError('')
    setFeedback('')
    setFieldErrors({})
    if (action === 'create') {
      const latestTrip = trips[0]
      setTripForm(buildTripForm({
        origin: suggestedOrigin,
        odometer: latestTrip?.end_odometer_km ?? possession?.start_odometer_km ?? '',
      }))
    }
    if (action === 'add') setDestinationDrafts([createDestinationDraft()])
    if (action === 'end') setEndForm(buildEndForm(trip))
    if (action === 'cancel') setCancelReason('')
    setView(action)
  }

  function returnToTimeline() {
    setView('timeline')
    setSelectedTrip(null)
    setError('')
    setFeedback('')
    setFieldErrors({})
  }

  async function submitMutation(operation, successMessage) {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    setFeedback('')
    setFieldErrors({})
    try {
      await operation()
      setFeedback(successMessage)
      setView('timeline')
      setSelectedTrip(null)
      await loadTrips(1)
      setFeedback(successMessage)
    } catch (requestError) {
      if (await handleUnauthorized(requestError)) {
        setError('Sua sessão expirou. Entre novamente para continuar.')
        return
      }
      const status = getHttpStatus(requestError)
      if (status === 422) setFieldErrors(getValidationFieldErrors(requestError))
      const message = apiStatusMessage(requestError, 'Não foi possível concluir a operação da rota.')
      setError(message)
      if (status === 409) {
        await loadTrips(1, { announce: true })
        setError(message)
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  function handleCreateTrip(event) {
    event.preventDefault()
    if (!tripForm.origin.trim() || !tripForm.purpose.trim() || !tripForm.departure_at || tripForm.start_odometer_km === '') {
      setError('Preencha origem, finalidade, saída e hodômetro inicial da rota.')
      return
    }
    if (tripForm.destinations.some((destination) => !destination.description.trim())) {
      setError('Preencha a descrição de todos os destinos adicionados.')
      return
    }
    submitMutation(
      () => possessionAPI.createTrip(possession.id, {
        origin: tripForm.origin.trim(),
        purpose: tripForm.purpose.trim(),
        departure_at: new Date(tripForm.departure_at).toISOString(),
        start_odometer_km: String(tripForm.start_odometer_km),
        observation: tripForm.observation.trim() || null,
        destinations: tripForm.destinations.map(serializeDestination),
      }),
      'Rota iniciada. A posse permanece ativa.',
    )
  }

  function handleAddDestinations(event) {
    event.preventDefault()
    if (!selectedTrip || destinationDrafts.length === 0 || destinationDrafts.some((item) => !item.description.trim())) {
      setError('Inclua ao menos um destino com descrição.')
      return
    }
    submitMutation(
      () => possessionAPI.addTripDestinations(possession.id, selectedTrip.id, {
        destinations: destinationDrafts.map(serializeDestination),
      }),
      'Destino(s) incluído(s) na rota em andamento.',
    )
  }

  function handleEndTrip(event) {
    event.preventDefault()
    if (!selectedTrip || !endForm.return_at || endForm.end_odometer_km === '') {
      setError('Informe data/hora do retorno e hodômetro final.')
      return
    }
    submitMutation(
      () => possessionAPI.endTrip(possession.id, selectedTrip.id, {
        return_at: new Date(endForm.return_at).toISOString(),
        end_odometer_km: String(endForm.end_odometer_km),
        observation: endForm.observation.trim() || null,
      }),
      'Retorno registrado. Apenas a rota foi encerrada; a posse continua ativa.',
    )
  }

  function handleCancelTrip(event) {
    event.preventDefault()
    if (!selectedTrip || cancelReason.trim().length < 8) {
      setError('Informe uma justificativa com pelo menos 8 caracteres.')
      return
    }
    submitMutation(
      () => possessionAPI.cancelTrip(possession.id, selectedTrip.id, { reason: cancelReason.trim() }),
      'Rota cancelada com justificativa. O histórico foi preservado e a posse continua ativa.',
    )
  }

  const title = view === 'create'
    ? 'Iniciar rota'
    : view === 'add'
      ? 'Adicionar destinos'
      : view === 'end'
        ? 'Registrar retorno da rota'
        : view === 'cancel'
          ? 'Cancelar rota'
          : `Rotas da posse ${possession ? `#${possession.public_number}` : ''}`

  return (
    <Modal
      open={Boolean(possession)}
      title={title}
      description={possession ? `${possession.vehicle_plate} · ${possession.driver_name}` : ''}
      onClose={onClose}
      canClose={!submitting}
    >
      <div className="trip-workspace">
        <div className="sr-status" aria-live="polite" aria-atomic="true">
          {error || feedback || (loading ? 'Carregando rotas.' : '')}
        </div>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        {feedback ? <div className="alert alert-info" role="status">{feedback}</div> : null}

        {view === 'timeline' ? (
          <>
            <div className="trip-workspace-summary">
              <div>
                <span className="trip-eyebrow">Estado atual</span>
                <strong>{openTrip ? `Rota ${openTrip.sequence_number} em andamento` : possession?.is_active ? 'Sem rota em andamento' : 'Posse encerrada'}</strong>
                <small>{pagination.total} rota(s) registrada(s)</small>
              </div>
              <div className="actions-inline">
                {possession?.is_active && canCreate && !openTrip && !loading ? (
                  <button type="button" className="app-button" onClick={() => openAction('create')}>
                    Iniciar rota
                  </button>
                ) : null}
                <button type="button" className="ghost-button" onClick={() => loadTrips(pagination.page, { announce: true })} disabled={loading}>
                  {loading ? 'Atualizando...' : 'Atualizar rotas'}
                </button>
              </div>
            </div>

            {loading && trips.length === 0 ? <div className="empty-state">Carregando linha do tempo...</div> : (
              <TripTimeline
                trips={trips}
                canEdit={canEdit && possession?.is_active}
                onAddDestination={(trip) => openAction('add', trip)}
                onEnd={(trip) => openAction('end', trip)}
                onCancel={(trip) => openAction('cancel', trip)}
              />
            )}

            {pagination.pages > 1 ? (
              <nav className="trip-pagination" aria-label="Paginação das rotas">
                <button type="button" className="ghost-button" disabled={!pagination.has_prev || loading} onClick={() => loadTrips(pagination.page - 1)}>
                  Rotas mais recentes
                </button>
                <span>Página {pagination.page} de {pagination.pages}</span>
                <button type="button" className="ghost-button" disabled={!pagination.has_next || loading} onClick={() => loadTrips(pagination.page + 1)}>
                  Rotas mais antigas
                </button>
              </nav>
            ) : null}
          </>
        ) : null}

        {view === 'create' ? (
          <form className="form-grid modal-form-grid" onSubmit={handleCreateTrip}>
            <p className="trip-action-context modal-field-span">A rota será vinculada à posse ativa. O retorno futuro encerrará apenas esta rota.</p>
            <div className="form-field">
              <label htmlFor="trip-create-origin">Origem</label>
              <input ref={firstFieldRef} id="trip-create-origin" className="app-input" value={tripForm.origin} onChange={(event) => setTripForm({ ...tripForm, origin: event.target.value })} maxLength={255} aria-describedby={fieldErrors.origin ? 'trip-create-origin-error' : undefined} />
              {fieldErrors.origin ? <span id="trip-create-origin-error" className="field-error">{fieldErrors.origin}</span> : null}
            </div>
            <div className="form-field">
              <label htmlFor="trip-create-purpose">Finalidade</label>
              <input id="trip-create-purpose" className="app-input" value={tripForm.purpose} onChange={(event) => setTripForm({ ...tripForm, purpose: event.target.value })} maxLength={500} />
            </div>
            <div className="form-field">
              <label htmlFor="trip-create-departure">Saída</label>
              <input id="trip-create-departure" type="datetime-local" className="app-input" value={tripForm.departure_at} onChange={(event) => setTripForm({ ...tripForm, departure_at: event.target.value })} />
            </div>
            <div className="form-field">
              <label htmlFor="trip-create-odometer">Hodômetro inicial (km)</label>
              <input id="trip-create-odometer" type="number" min="0" step="0.1" className="app-input" value={tripForm.start_odometer_km} onChange={(event) => setTripForm({ ...tripForm, start_odometer_km: event.target.value })} />
            </div>
            <div className="form-field modal-field-span">
              <label htmlFor="trip-create-observation">Observação</label>
              <textarea id="trip-create-observation" className="app-textarea" rows="3" value={tripForm.observation} onChange={(event) => setTripForm({ ...tripForm, observation: event.target.value })} maxLength={2000} />
            </div>
            <TripDestinationEditor idPrefix="trip-create" destinations={tripForm.destinations} onChange={(destinations) => setTripForm({ ...tripForm, destinations })} disabled={submitting} />
            <div className="actions-inline modal-actions">
              <button type="submit" className="app-button" disabled={submitting}>{submitting ? 'Iniciando...' : 'Iniciar rota'}</button>
              <button type="button" className="ghost-button" onClick={returnToTimeline} disabled={submitting}>Voltar às rotas</button>
            </div>
          </form>
        ) : null}

        {view === 'add' ? (
          <form className="form-grid modal-form-grid" onSubmit={handleAddDestinations}>
            <p className="trip-action-context modal-field-span">Os novos destinos serão acrescentados ao final da rota {selectedTrip?.sequence_number}, sem alterar paradas anteriores.</p>
            <div ref={firstFieldRef} tabIndex={-1} className="modal-field-span">
              <TripDestinationEditor idPrefix="trip-add" destinations={destinationDrafts} onChange={setDestinationDrafts} disabled={submitting} />
            </div>
            <div className="actions-inline modal-actions">
              <button type="submit" className="app-button" disabled={submitting}>{submitting ? 'Adicionando...' : 'Adicionar destino(s)'}</button>
              <button type="button" className="ghost-button" onClick={returnToTimeline} disabled={submitting}>Voltar às rotas</button>
            </div>
          </form>
        ) : null}

        {view === 'end' ? (
          <form className="form-grid modal-form-grid" onSubmit={handleEndTrip}>
            <div className="trip-return-notice modal-field-span" role="note">
              <strong>Esta ação encerra apenas a rota.</strong>
              <span>A posse continuará ativa e poderá receber uma nova rota depois.</span>
            </div>
            <div className="form-field">
              <label htmlFor="trip-end-return">Data e hora do retorno</label>
              <input ref={firstFieldRef} id="trip-end-return" type="datetime-local" className="app-input" value={endForm.return_at} onChange={(event) => setEndForm({ ...endForm, return_at: event.target.value })} />
            </div>
            <div className="form-field">
              <label htmlFor="trip-end-odometer">Hodômetro final (km)</label>
              <input id="trip-end-odometer" type="number" min={selectedTrip?.start_odometer_km || 0} step="0.1" className="app-input" value={endForm.end_odometer_km} onChange={(event) => setEndForm({ ...endForm, end_odometer_km: event.target.value })} />
            </div>
            <div className="form-field modal-field-span">
              <label htmlFor="trip-end-observation">Observação do retorno</label>
              <textarea id="trip-end-observation" className="app-textarea" rows="3" value={endForm.observation} onChange={(event) => setEndForm({ ...endForm, observation: event.target.value })} maxLength={2000} />
            </div>
            <div className="actions-inline modal-actions">
              <button type="submit" className="app-button" disabled={submitting}>{submitting ? 'Registrando...' : 'Registrar retorno da rota'}</button>
              <button type="button" className="ghost-button" onClick={returnToTimeline} disabled={submitting}>Voltar às rotas</button>
            </div>
          </form>
        ) : null}

        {view === 'cancel' ? (
          <form className="form-grid modal-form-grid" onSubmit={handleCancelTrip}>
            <div className="trip-critical-notice modal-field-span" role="note">
              <strong>O cancelamento não apaga a rota.</strong>
              <span>Destinos e histórico serão preservados com a justificativa informada.</span>
            </div>
            <div className="form-field modal-field-span">
              <label htmlFor="trip-cancel-reason">Justificativa do cancelamento</label>
              <textarea ref={firstFieldRef} id="trip-cancel-reason" className="app-textarea" rows="4" minLength={8} maxLength={1000} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} aria-describedby="trip-cancel-help" />
              <span id="trip-cancel-help" className="helper-text">Entre 8 e 1.000 caracteres. A justificativa será auditada.</span>
            </div>
            <div className="actions-inline modal-actions">
              <button type="submit" className="app-button danger-button" disabled={submitting || cancelReason.trim().length < 8}>{submitting ? 'Cancelando...' : 'Confirmar cancelamento da rota'}</button>
              <button type="button" className="ghost-button" onClick={returnToTimeline} disabled={submitting}>Voltar às rotas</button>
            </div>
          </form>
        ) : null}
      </div>
    </Modal>
  )
}
