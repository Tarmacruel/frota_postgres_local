import { useEffect, useRef, useState } from 'react'
import { possessionAPI } from '../api/possession'
import DriverSelect from './DriverSelect'
import InitialTripFields from './InitialTripFields'
import SearchableSelect from './SearchableSelect'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'
import { getApiErrorCode, getApiErrorDetail, getHttpStatus } from '../utils/httpError'
import { serializeDestination } from '../utils/tripDestination'

const MAX_DOCUMENT_SIZE_BYTES = 12 * 1024 * 1024
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR')
}

function isSecureCaptureContext() {
  if (typeof window === 'undefined') return false
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

function getEvidenceErrorMessage(error) {
  if (!error) return 'Não foi possível capturar a evidência.'

  if (error.code === 1 || error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return 'Permita câmera e localização para registrar a posse.'
  }

  if (error.code === 2 || error.name === 'PositionUnavailableError') {
    return 'Não foi possível obter a localização atual do dispositivo.'
  }

  if (error.code === 3 || error.name === 'TimeoutError') {
    return 'A captura da localização expirou. Tente novamente.'
  }

  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return 'Nenhuma câmera disponível foi encontrada neste dispositivo.'
  }

  if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    return 'A câmera está ocupada por outro aplicativo. Feche-o e tente novamente.'
  }

  return 'Não foi possível capturar foto e localização da posse.'
}

function getCurrentPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

function canvasToJpegBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new Error('Não foi possível gerar a foto da posse.'))
      },
      'image/jpeg',
      0.82,
    )
  })
}

function formatFileSize(bytes) {
  if (!bytes) return '-'
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${Math.round(bytes / 1024)} KB`
}

function revokePreviewUrl(url) {
  if (url) {
    URL.revokeObjectURL(url)
  }
}

export default function PossessionForm({ vehicles, onClose, onSuccess, onUnauthorized }) {
  const [form, setForm] = useState({
    vehicle_id: '',
    driver_id: '',
    driver_name: '',
    driver_document: '',
    driver_contact: '',
    start_date: toDateTimeLocalValue(new Date().toISOString()),
    start_odometer_km: '',
    observation: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [initialTripEnabled, setInitialTripEnabled] = useState(false)
  const [initialTrip, setInitialTrip] = useState({
    origin: '',
    purpose: '',
    departure_at: '',
    start_odometer_km: '',
    observation: '',
    destinations: [],
  })
  const [replacementConflict, setReplacementConflict] = useState(null)
  const [replacementConfirmed, setReplacementConfirmed] = useState(false)
  const [replacementReason, setReplacementReason] = useState('')
  const [captureError, setCaptureError] = useState('')
  const [captureState, setCaptureState] = useState('idle')
  const [capturedPhotos, setCapturedPhotos] = useState([])
  const [draftPhotoBlob, setDraftPhotoBlob] = useState(null)
  const [draftPreviewUrl, setDraftPreviewUrl] = useState('')
  const [draftCaptureLocation, setDraftCaptureLocation] = useState(null)
  const [draftPhotoCapturedAt, setDraftPhotoCapturedAt] = useState('')
  const [loanTermDocument, setLoanTermDocument] = useState(null)
  const [documentError, setDocumentError] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const documentInputRef = useRef(null)
  const capturedPhotosRef = useRef([])
  const draftPreviewUrlRef = useRef('')
  const submittingRef = useRef(false)
  const secureCaptureContext = isSecureCaptureContext()

  useEffect(() => {
    if (captureState !== 'preview' || !videoRef.current || !streamRef.current) return undefined

    videoRef.current.srcObject = streamRef.current
    videoRef.current.play().catch(() => {})

    return undefined
  }, [captureState])

  useEffect(() => {
    capturedPhotosRef.current = capturedPhotos
  }, [capturedPhotos])

  useEffect(() => {
    draftPreviewUrlRef.current = draftPreviewUrl
  }, [draftPreviewUrl])

  useEffect(() => {
    return () => {
      stopCameraStream()
      revokePreviewUrl(draftPreviewUrlRef.current)
      capturedPhotosRef.current.forEach((photo) => revokePreviewUrl(photo.previewUrl))
    }
  }, [])

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  function clearDraftEvidence() {
    stopCameraStream()
    setCaptureState('idle')
    setDraftCaptureLocation(null)
    setDraftPhotoCapturedAt('')
    setDraftPhotoBlob(null)
    setCaptureError('')
    revokePreviewUrl(draftPreviewUrl)
    setDraftPreviewUrl('')
  }

  function buildVehicleOption(vehicle) {
    const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação'
    const ownershipLabel = vehicle.ownership_type === 'LOCADO' ? 'Locado' : vehicle.ownership_type === 'CEDIDO' ? 'Cedido' : 'Próprio'
    return {
      value: vehicle.id,
      label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
      description: `${ownershipLabel} | ${locationLabel}`,
      keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.chassis_number, vehicle.current_driver_name, locationLabel]
        .filter(Boolean)
        .join(' '),
    }
  }

  function handleDocumentChange(event) {
    const nextFile = event.target.files?.[0] || null
    if (!nextFile) {
      setLoanTermDocument(null)
      setDocumentError('')
      return
    }

    if (!ALLOWED_DOCUMENT_TYPES.includes(nextFile.type)) {
      setLoanTermDocument(null)
      setDocumentError('Anexe PDF, imagem, DOC ou DOCX para arquivar o documento assinado da entrega.')
      if (documentInputRef.current) {
        documentInputRef.current.value = ''
      }
      return
    }

    if (nextFile.size > MAX_DOCUMENT_SIZE_BYTES) {
      setLoanTermDocument(null)
      setDocumentError('O documento anexado deve ter no máximo 12 MB.')
      if (documentInputRef.current) {
        documentInputRef.current.value = ''
      }
      return
    }

    setLoanTermDocument(nextFile)
    setDocumentError('')
  }

  function clearDocument() {
    setLoanTermDocument(null)
    setDocumentError('')
    if (documentInputRef.current) {
      documentInputRef.current.value = ''
    }
  }

  function handleVehicleChange(value) {
    const selectedVehicle = vehicles.find((vehicle) => vehicle.id === value)
    setForm((current) => ({ ...current, vehicle_id: value }))
    setReplacementConflict(null)
    setReplacementConfirmed(false)
    setReplacementReason('')
    if (initialTripEnabled) {
      setInitialTrip((current) => ({
        ...current,
        origin: selectedVehicle?.current_location?.display_name || '',
      }))
    }
  }

  function handleInitialTripEnabled(enabled) {
    setInitialTripEnabled(enabled)
    if (!enabled) return
    const selectedVehicle = vehicles.find((vehicle) => vehicle.id === form.vehicle_id)
    setInitialTrip((current) => ({
      ...current,
      origin: current.origin || selectedVehicle?.current_location?.display_name || '',
      departure_at: current.departure_at || form.start_date,
      start_odometer_km: current.start_odometer_km || form.start_odometer_km,
    }))
  }

  async function startEvidenceCapture() {
    if (!secureCaptureContext) {
      setCaptureError('A captura exige acesso em https ou localhost.')
      return
    }

    if (!navigator.geolocation || !navigator.mediaDevices?.getUserMedia) {
      setCaptureError('Este dispositivo não oferece suporte completo a câmera e localização.')
      return
    }

    clearDraftEvidence()
    setCaptureError('')
    setCaptureState('requesting')

    try {
      const position = await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      })

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        },
      })

      streamRef.current = stream
      setDraftCaptureLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: position.coords.accuracy,
      })
      setCaptureState('preview')
    } catch (captureIssue) {
      stopCameraStream()
      setCaptureState('idle')
      setDraftCaptureLocation(null)
      setDraftPhotoCapturedAt('')
      setDraftPhotoBlob(null)
      setCaptureError(getEvidenceErrorMessage(captureIssue))
    }
  }

  async function handleTakePhoto() {
    if (!videoRef.current || !draftCaptureLocation) {
      setCaptureError('Localização e câmera precisam estar ativas antes da captura.')
      return
    }

    try {
      const video = videoRef.current
      const sourceWidth = video.videoWidth || 1280
      const sourceHeight = video.videoHeight || 720
      const scale = Math.min(1, 1600 / sourceWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(sourceWidth * scale)
      canvas.height = Math.round(sourceHeight * scale)
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('Não foi possível preparar a foto capturada.')
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await canvasToJpegBlob(canvas)
      const previewUrl = URL.createObjectURL(blob)

      stopCameraStream()
      revokePreviewUrl(draftPreviewUrl)
      setDraftPhotoBlob(blob)
      setDraftPreviewUrl(previewUrl)
      setDraftPhotoCapturedAt(new Date().toISOString())
      setCaptureState('review')
      setCaptureError('')
    } catch (captureIssue) {
      setCaptureError(getEvidenceErrorMessage(captureIssue))
    }
  }

  function confirmCapturedEvidence() {
    if (!draftPhotoBlob || !draftCaptureLocation || !draftPhotoCapturedAt || !draftPreviewUrl) {
      setCaptureError('Foto e localização precisam ser capturadas antes de continuar.')
      return
    }

    setCapturedPhotos((current) => [
      ...current,
      {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${current.length}`,
        blob: draftPhotoBlob,
        previewUrl: draftPreviewUrl,
        capturedAt: draftPhotoCapturedAt,
        captureLocation: draftCaptureLocation,
      },
    ])
    setDraftPhotoBlob(null)
    setDraftPreviewUrl('')
    setDraftPhotoCapturedAt('')
    setDraftCaptureLocation(null)
    setCaptureState('idle')
    setCaptureError('')
  }

  function removeCapturedPhoto(photoId) {
    setCapturedPhotos((current) => {
      const target = current.find((photo) => photo.id === photoId)
      if (target) {
        revokePreviewUrl(target.previewUrl)
      }
      return current.filter((photo) => photo.id !== photoId)
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current) return

    if (!form.vehicle_id) {
      setError('Selecione um veículo para continuar.')
      return
    }

    if (!form.driver_id) {
      setError('Selecione um condutor cadastrado para registrar a posse.')
      return
    }

    if (initialTripEnabled) {
      if (!initialTrip.origin.trim() || !initialTrip.purpose.trim() || !initialTrip.departure_at || initialTrip.start_odometer_km === '') {
        setError('Preencha origem, finalidade, saída e hodômetro da rota inicial.')
        return
      }
      if (initialTrip.destinations.some((destination) => !destination.description.trim())) {
        setError('Preencha a descrição de todos os destinos da rota inicial.')
        return
      }
    }

    if (replacementConflict && (!replacementConfirmed || replacementReason.trim().length < 8)) {
      setError('Confirme conscientemente a substituição e informe uma justificativa com pelo menos 8 caracteres.')
      return
    }

    try {
      submittingRef.current = true
      setSubmitting(true)
      setError('')
      setCaptureError('')

      const payload = new FormData()
      payload.append('vehicle_id', form.vehicle_id)
      if (form.driver_id) payload.append('driver_id', form.driver_id)
      payload.append('driver_name', form.driver_name)
      if (form.driver_document) payload.append('driver_document', form.driver_document)
      if (form.driver_contact) payload.append('driver_contact', form.driver_contact)
      if (form.start_date) payload.append('start_date', new Date(form.start_date).toISOString())
      if (form.start_odometer_km !== '') payload.append('start_odometer_km', String(Number(form.start_odometer_km)))
      if (form.observation) payload.append('observation', form.observation)
      if (initialTripEnabled) {
        payload.append('initial_trip_json', JSON.stringify({
          origin: initialTrip.origin.trim(),
          purpose: initialTrip.purpose.trim(),
          departure_at: new Date(initialTrip.departure_at).toISOString(),
          start_odometer_km: String(initialTrip.start_odometer_km),
          observation: initialTrip.observation.trim() || null,
          destinations: initialTrip.destinations.map(serializeDestination),
        }))
      }
      if (replacementConflict && replacementConfirmed) {
        payload.append('replace_active', 'true')
        payload.append('replacement_reason', replacementReason.trim())
      }
      if (capturedPhotos.length > 0) {
        payload.append(
          'photo_metadata_json',
          JSON.stringify(
            capturedPhotos.map((photo) => ({
              photo_captured_at: photo.capturedAt,
              capture_latitude: photo.captureLocation.latitude,
              capture_longitude: photo.captureLocation.longitude,
              capture_accuracy_meters: photo.captureLocation.accuracy_meters,
            })),
          ),
        )
        capturedPhotos.forEach((photo, index) => {
          payload.append('photos', photo.blob, `posse-${form.vehicle_id}-${index + 1}.jpg`)
        })
      }
      if (loanTermDocument) {
        payload.append('loan_term_document', loanTermDocument, loanTermDocument.name)
      }

      await possessionAPI.create(payload)
      onSuccess?.(replacementConflict
        ? 'Nova posse registrada após substituição explícita e justificada da posse anterior.'
        : initialTripEnabled
          ? 'Posse e rota inicial registradas na mesma operação.'
          : 'Posse registrada sem rota inicial.')
      onClose?.()
    } catch (err) {
      const status = getHttpStatus(err)
      const code = getApiErrorCode(err)
      const detail = getApiErrorDetail(err)
      if (status === 401) {
        setError('Sua sessão expirou. Entre novamente para continuar.')
        await onUnauthorized?.()
      } else if (status === 403) {
        setError('Seu perfil não possui permissão para registrar posses.')
      } else if (status === 409 && code === 'ACTIVE_POSSESSION_EXISTS') {
        setReplacementConflict(detail?.active_possession || {})
        setReplacementConfirmed(false)
        setReplacementReason('')
        setError('Já existe uma posse ativa. Revise os dados abaixo antes de decidir pela substituição.')
      } else if (status === 409) {
        setError(getApiErrorMessage(err, 'O estado do veículo mudou. Atualize os dados e tente novamente.'))
      } else if (status === 422) {
        setError(getApiErrorMessage(err, 'Revise os campos informados antes de registrar a posse.'))
      } else {
        setError(getApiErrorMessage(err, 'Não foi possível registrar a posse.'))
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const captureButtonLabel =
    captureState === 'requesting'
      ? 'Solicitando acesso...'
      : capturedPhotos.length > 0
        ? 'Adicionar outra foto'
        : 'Capturar foto e localização'

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      <div className="sr-status" aria-live="assertive" aria-atomic="true">{error}</div>
      {error ? <div className="alert alert-error modal-field-span" role="alert">{error}</div> : null}

      {replacementConflict ? (
        <section className="replacement-conflict modal-field-span" aria-labelledby="replacement-conflict-title">
          <div>
            <span className="trip-eyebrow">Conflito de posse ativa</span>
            <h4 id="replacement-conflict-title">Substituir a posse atual?</h4>
            <p>A substituição encerrará a responsabilidade anterior na data de início da nova posse. Ela não será repetida automaticamente.</p>
          </div>
          <dl className="replacement-summary">
            <div><dt>Posse atual</dt><dd>#{replacementConflict.public_number || 'sem número'}</dd></div>
            <div><dt>Início</dt><dd>{formatDateTime(replacementConflict.start_date)}</dd></div>
            <div><dt>Veículo</dt><dd>{vehicles.find((vehicle) => vehicle.id === form.vehicle_id)?.plate || 'Selecionado'}</dd></div>
          </dl>
          <label className="critical-confirmation" htmlFor="replacement-confirmed">
            <input id="replacement-confirmed" type="checkbox" checked={replacementConfirmed} onChange={(event) => setReplacementConfirmed(event.target.checked)} disabled={submitting} />
            <span>Confirmo que revisei a posse ativa e desejo substituí-la.</span>
          </label>
          <div className="form-field">
            <label htmlFor="replacement-reason">Justificativa da substituição</label>
            <textarea
              id="replacement-reason"
              className="app-textarea"
              rows="3"
              minLength={8}
              maxLength={1000}
              value={replacementReason}
              onChange={(event) => setReplacementReason(event.target.value)}
              aria-describedby="replacement-reason-help"
              disabled={submitting}
            />
            <span id="replacement-reason-help" className="helper-text">Entre 8 e 1.000 caracteres. A justificativa será auditada.</span>
          </div>
        </section>
      ) : null}

      <div className="form-field">
        <label>Veículo</label>
        <SearchableSelect
          value={form.vehicle_id}
          onChange={handleVehicleChange}
          options={vehicles.map(buildVehicleOption)}
          placeholder="Selecione o veículo"
          searchPlaceholder="Buscar veículo por placa, modelo, chassi ou lotação"
          emptyLabel="Nenhum veículo disponível."
        />
      </div>

      <div className="form-field">
        <label htmlFor="possession-start">Início da posse</label>
        <input
          id="possession-start"
          type="datetime-local"
          className="app-input"
          value={form.start_date}
          onChange={(event) => setForm({ ...form, start_date: event.target.value })}
        />
      </div>

      <div className="form-field">
        <label htmlFor="possession-start-odometer">Odômetro inicial (km)</label>
        <input
          id="possession-start-odometer"
          type="number"
          min="0"
          step="0.1"
          className="app-input"
          value={form.start_odometer_km}
          onChange={(event) => setForm({ ...form, start_odometer_km: event.target.value })}
          placeholder="Informe a quilometragem inicial"
        />
      </div>

      <div className="form-field">
        <label>Condutor cadastrado</label>
        <DriverSelect
          value={form.driver_id}
          onChange={(driver) => setForm({
            ...form,
            driver_id: driver?.id || '',
            driver_name: driver?.nome_completo || '',
            driver_document: driver?.documento || '',
            driver_contact: driver?.contato || '',
          })}
        />
      </div>

      <div className="form-field">
        <label htmlFor="possession-document">Documento</label>
        <input
          id="possession-document"
          className="app-input"
          placeholder="Documento do condutor"
          value={form.driver_document}
          readOnly
        />
      </div>

      <div className="form-field modal-field-span">
        <label htmlFor="possession-contact">Contato</label>
        <input
          id="possession-contact"
          className="app-input"
          placeholder="Telefone ou contato rápido"
          value={form.driver_contact}
          readOnly
        />
      </div>

      <InitialTripFields
        enabled={initialTripEnabled}
        onEnabledChange={handleInitialTripEnabled}
        trip={initialTrip}
        onChange={setInitialTrip}
        disabled={submitting}
      />

      <div className="form-field modal-field-span">
        <label htmlFor="possession-observation">Observação</label>
        <textarea
          id="possession-observation"
          className="app-textarea"
          rows="4"
          placeholder="Contexto da posse, rota ou observações adicionais."
          value={form.observation}
          onChange={(event) => setForm({ ...form, observation: event.target.value })}
        />
      </div>

      <div className="form-field modal-field-span">
        <label>Evidência (opcional)</label>
        <div className="evidence-shell">
          <div className="evidence-copy">
            <strong>Foto e localização são opcionais no registro de posse.</strong>
            <span>Se desejar, use a câmera do dispositivo para registrar evidências das partes do veículo.</span>
          </div>

          {!draftPreviewUrl && captureState !== 'preview' ? (
            <div className="actions-inline">
              <button
                className="secondary-button"
                type="button"
                onClick={startEvidenceCapture}
                disabled={submitting || captureState === 'requesting'}
              >
                {captureButtonLabel}
              </button>
            </div>
          ) : null}

          {captureError ? <div className="alert alert-error evidence-alert">{captureError}</div> : null}

          {captureState === 'preview' ? (
            <div className="evidence-preview-shell">
              <div className="camera-stage">
                <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
              </div>
              <div className="camera-stage-footer">
                <span className="muted">Enquadre o veículo e capture a evidência atual.</span>
                <div className="actions-inline">
                  <button className="app-button" type="button" onClick={handleTakePhoto}>Capturar</button>
                  <button className="ghost-button" type="button" onClick={clearDraftEvidence}>Cancelar</button>
                </div>
              </div>
            </div>
          ) : null}

          {draftPreviewUrl ? (
            <div className="evidence-review-grid">
              <div className="evidence-image-card">
                <img src={draftPreviewUrl} alt="Foto capturada do veículo" className="evidence-image" />
              </div>
              <div className="evidence-meta-card">
                <strong>Revise a evidência capturada</strong>
                <div className="stack">
                  <span><strong>Horário:</strong> {formatDateTime(draftPhotoCapturedAt)}</span>
                  <span>
                    <strong>Localização:</strong> {draftCaptureLocation ? `${draftCaptureLocation.latitude.toFixed(6)}, ${draftCaptureLocation.longitude.toFixed(6)}` : '-'}
                  </span>
                  <span>
                    <strong>Precisão:</strong> {draftCaptureLocation ? `${Math.round(draftCaptureLocation.accuracy_meters)} m` : '-'}
                  </span>
                </div>
                <div className="actions-inline">
                  <button className="app-button" type="button" onClick={confirmCapturedEvidence}>Adicionar ao registro</button>
                  <button className="ghost-button" type="button" onClick={startEvidenceCapture}>Refazer</button>
                </div>
              </div>
            </div>
          ) : null}

          {capturedPhotos.length > 0 ? (
            <div className="evidence-gallery-grid">
              {capturedPhotos.map((photo, index) => (
                <article key={photo.id} className="evidence-thumb-card">
                  <img src={photo.previewUrl} alt={`Foto ${index + 1} da posse`} className="evidence-thumb-image" />
                  <div className="stack">
                    <strong>Foto {index + 1}</strong>
                    <span className="muted">{formatDateTime(photo.capturedAt)}</span>
                    <span className="muted">
                      {photo.captureLocation.latitude.toFixed(6)}, {photo.captureLocation.longitude.toFixed(6)} . {Math.round(photo.captureLocation.accuracy_meters)} m
                    </span>
                  </div>
                  <button className="ghost-button" type="button" onClick={() => removeCapturedPhoto(photo.id)}>
                    Remover
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="form-field modal-field-span">
        <label htmlFor="signed-document">Documento assinado da entrega</label>
        <div className="evidence-shell">
          <div className="evidence-copy">
            <strong>Anexe o documento original assinado na entrega, se ele já estiver pronto.</strong>
            <span>O arquivo fica vinculado ao início da posse para consulta posterior no módulo de condutores.</span>
          </div>

          <input
            ref={documentInputRef}
            id="signed-document"
            type="file"
            className="app-input"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleDocumentChange}
          />

          {documentError ? <div className="alert alert-error evidence-alert">{documentError}</div> : null}

          {loanTermDocument ? (
            <div className="camera-stage-footer">
              <div className="stack">
                <strong>{loanTermDocument.name}</strong>
                <span className="muted">Tipo: {loanTermDocument.type || 'Arquivo compativel'} | Tamanho: {formatFileSize(loanTermDocument.size)}</span>
              </div>
              <div className="actions-inline">
                <button className="ghost-button" type="button" onClick={clearDocument}>Remover anexo</button>
              </div>
            </div>
          ) : (
            <span className="helper-text">Aceita PDF, imagem, DOC e DOCX. O anexo e opcional.</span>
          )}
        </div>
      </div>

      <div className="actions-inline modal-actions">
        <button
          className="app-button"
          type="submit"
          disabled={submitting || vehicles.length === 0 || !form.driver_id || (replacementConflict && (!replacementConfirmed || replacementReason.trim().length < 8))}
        >
          {submitting ? 'Salvando...' : replacementConflict ? 'Confirmar substituição e registrar posse' : 'Registrar posse'}
        </button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}
