import { useEffect, useRef, useState } from 'react'
import { possessionAPI } from '../api/possession'
import DriverSelect from './DriverSelect'
import SearchableSelect from './SearchableSelect'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'

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
  if (!error) return 'Nao foi possivel capturar a evidencia obrigatoria.'

  if (error.code === 1 || error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return 'Permita camera e localizacao para registrar a posse.'
  }

  if (error.code === 2 || error.name === 'PositionUnavailableError') {
    return 'Nao foi possivel obter a localizacao atual do dispositivo.'
  }

  if (error.code === 3 || error.name === 'TimeoutError') {
    return 'A captura da localizacao expirou. Tente novamente.'
  }

  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return 'Nenhuma camera disponivel foi encontrada neste dispositivo.'
  }

  if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    return 'A camera esta ocupada por outro aplicativo. Feche-o e tente novamente.'
  }

  return 'Nao foi possivel capturar foto e localizacao da posse.'
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
        reject(new Error('Nao foi possivel gerar a foto da posse.'))
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

export default function PossessionForm({ vehicles, onClose, onSuccess }) {
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
  const [captureError, setCaptureError] = useState('')
  const [captureState, setCaptureState] = useState('idle')
  const [capturedPhotos, setCapturedPhotos] = useState([])
  const [draftPhotoBlob, setDraftPhotoBlob] = useState(null)
  const [draftPreviewUrl, setDraftPreviewUrl] = useState('')
  const [draftCaptureLocation, setDraftCaptureLocation] = useState(null)
  const [draftPhotoCapturedAt, setDraftPhotoCapturedAt] = useState('')
  const [signedDocument, setSignedDocument] = useState(null)
  const [documentError, setDocumentError] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const documentInputRef = useRef(null)
  const capturedPhotosRef = useRef([])
  const draftPreviewUrlRef = useRef('')
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
    const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotacao'
    const ownershipLabel = vehicle.ownership_type === 'LOCADO' ? 'Locado' : vehicle.ownership_type === 'CEDIDO' ? 'Cedido' : 'Proprio'
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
      setSignedDocument(null)
      setDocumentError('')
      return
    }

    if (!ALLOWED_DOCUMENT_TYPES.includes(nextFile.type)) {
      setSignedDocument(null)
      setDocumentError('Anexe PDF, imagem, DOC ou DOCX para arquivar o termo assinado.')
      if (documentInputRef.current) {
        documentInputRef.current.value = ''
      }
      return
    }

    if (nextFile.size > MAX_DOCUMENT_SIZE_BYTES) {
      setSignedDocument(null)
      setDocumentError('O documento anexado deve ter no maximo 12 MB.')
      if (documentInputRef.current) {
        documentInputRef.current.value = ''
      }
      return
    }

    setSignedDocument(nextFile)
    setDocumentError('')
  }

  function clearDocument() {
    setSignedDocument(null)
    setDocumentError('')
    if (documentInputRef.current) {
      documentInputRef.current.value = ''
    }
  }

  async function startEvidenceCapture() {
    if (!secureCaptureContext) {
      setCaptureError('A captura obrigatoria exige acesso em https ou localhost.')
      return
    }

    if (!navigator.geolocation || !navigator.mediaDevices?.getUserMedia) {
      setCaptureError('Este dispositivo nao oferece suporte completo a camera e localizacao.')
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
      setCaptureError('Localizacao e camera precisam estar ativas antes da captura.')
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
        throw new Error('Nao foi possivel preparar a foto capturada.')
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
      setCaptureError('Foto e localizacao precisam ser capturadas antes de continuar.')
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

    if (!form.vehicle_id) {
      setError('Selecione um veiculo para continuar.')
      return
    }

    if (!form.driver_id) {
      setError('Selecione um condutor cadastrado para registrar a posse.')
      return
    }

    if (capturedPhotos.length === 0) {
      setCaptureError('Foto e localizacao sao obrigatorias para registrar a posse.')
      return
    }

    try {
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
      if (signedDocument) {
        payload.append('signed_document', signedDocument, signedDocument.name)
      }

      await possessionAPI.create(payload)
      onSuccess?.('Posse registrada com sucesso. Se havia posse ativa, ela foi encerrada automaticamente.')
      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel registrar a posse.'))
    } finally {
      setSubmitting(false)
    }
  }

  const captureButtonLabel =
    captureState === 'requesting'
      ? 'Solicitando acesso...'
      : capturedPhotos.length > 0
        ? 'Adicionar outra foto'
        : 'Capturar foto e localizacao'

  return (
    <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
      {error ? <div className="alert alert-error modal-field-span">{error}</div> : null}

      <div className="form-field">
        <label>Veiculo</label>
        <SearchableSelect
          value={form.vehicle_id}
          onChange={(value) => setForm({ ...form, vehicle_id: value })}
          options={vehicles.map(buildVehicleOption)}
          placeholder="Selecione o veiculo"
          searchPlaceholder="Buscar veiculo por placa, modelo, chassi ou lotacao"
          emptyLabel="Nenhum veiculo disponivel."
        />
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
        <label htmlFor="possession-start-odometer">Odometro inicial (km)</label>
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
          placeholder="Telefone ou contato rapido"
          value={form.driver_contact}
          readOnly
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

      <div className="form-field modal-field-span">
        <label>Evidencia obrigatoria</label>
        <div className="evidence-shell">
          <div className="evidence-copy">
            <strong>Foto e localizacao sao obrigatorias para registrar a posse.</strong>
            <span>Use a camera do dispositivo para registrar quantas fotos forem necessarias das partes do veiculo.</span>
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
                <span className="muted">Enquadre o veiculo e capture a evidencia atual.</span>
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
                <img src={draftPreviewUrl} alt="Foto capturada do veiculo" className="evidence-image" />
              </div>
              <div className="evidence-meta-card">
                <strong>Revise a evidencia capturada</strong>
                <div className="stack">
                  <span><strong>Horario:</strong> {formatDateTime(draftPhotoCapturedAt)}</span>
                  <span>
                    <strong>Localizacao:</strong> {draftCaptureLocation ? `${draftCaptureLocation.latitude.toFixed(6)}, ${draftCaptureLocation.longitude.toFixed(6)}` : '-'}
                  </span>
                  <span>
                    <strong>Precisao:</strong> {draftCaptureLocation ? `${Math.round(draftCaptureLocation.accuracy_meters)} m` : '-'}
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
        <label htmlFor="signed-document">Documento assinado</label>
        <div className="evidence-shell">
          <div className="evidence-copy">
            <strong>Anexe o termo assinado pelo responsavel, se ele ja estiver pronto.</strong>
            <span>O arquivo fica vinculado ao registro de posse para consulta posterior no modulo de condutores.</span>
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

          {signedDocument ? (
            <div className="camera-stage-footer">
              <div className="stack">
                <strong>{signedDocument.name}</strong>
                <span className="muted">Tipo: {signedDocument.type || 'Arquivo compativel'} | Tamanho: {formatFileSize(signedDocument.size)}</span>
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
        <button className="app-button" type="submit" disabled={submitting || vehicles.length === 0 || capturedPhotos.length === 0 || !form.driver_id}>
          {submitting ? 'Salvando...' : 'Registrar posse'}
        </button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}