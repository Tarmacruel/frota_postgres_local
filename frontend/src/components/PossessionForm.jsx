import { useEffect, useRef, useState } from 'react'
import { possessionAPI } from '../api/possession'
import SearchableSelect from './SearchableSelect'
import { getApiErrorMessage } from '../utils/apiError'

function toDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

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

export default function PossessionForm({ vehicles, onClose, onSuccess }) {
  const [form, setForm] = useState({
    vehicle_id: '',
    driver_name: '',
    driver_document: '',
    driver_contact: '',
    start_date: toDateTimeInput(new Date().toISOString()),
    observation: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [captureError, setCaptureError] = useState('')
  const [captureState, setCaptureState] = useState('idle')
  const [capturedPhotoBlob, setCapturedPhotoBlob] = useState(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('')
  const [captureLocation, setCaptureLocation] = useState(null)
  const [photoCapturedAt, setPhotoCapturedAt] = useState('')
  const [evidenceReady, setEvidenceReady] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const secureCaptureContext = isSecureCaptureContext()

  useEffect(() => {
    if (captureState !== 'preview' || !videoRef.current || !streamRef.current) return undefined

    videoRef.current.srcObject = streamRef.current
    videoRef.current.play().catch(() => {})

    return undefined
  }, [captureState])

  useEffect(() => {
    return () => {
      stopCameraStream()
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl)
      }
    }
  }, [photoPreviewUrl])

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  function clearEvidenceState() {
    stopCameraStream()
    setCaptureState('idle')
    setCaptureLocation(null)
    setPhotoCapturedAt('')
    setCapturedPhotoBlob(null)
    setEvidenceReady(false)
    setCaptureError('')
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl)
    }
    setPhotoPreviewUrl('')
  }

  function buildVehicleOption(vehicle) {
    const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotacao'
    return {
      value: vehicle.id,
      label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
      description: `${vehicle.ownership_type === 'LOCADO' ? 'Locado' : 'Proprio'} | ${locationLabel}`,
      keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.chassis_number, vehicle.current_driver_name, locationLabel]
        .filter(Boolean)
        .join(' '),
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

    clearEvidenceState()
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
      setCaptureLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: position.coords.accuracy,
      })
      setCaptureState('preview')
    } catch (captureIssue) {
      stopCameraStream()
      setCaptureState('idle')
      setCaptureLocation(null)
      setPhotoCapturedAt('')
      setCapturedPhotoBlob(null)
      setEvidenceReady(false)
      setCaptureError(getEvidenceErrorMessage(captureIssue))
    }
  }

  async function handleTakePhoto() {
    if (!videoRef.current || !captureLocation) {
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
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl)
      }
      setCapturedPhotoBlob(blob)
      setPhotoPreviewUrl(previewUrl)
      setPhotoCapturedAt(new Date().toISOString())
      setEvidenceReady(false)
      setCaptureState('review')
      setCaptureError('')
    } catch (captureIssue) {
      setCaptureError(getEvidenceErrorMessage(captureIssue))
    }
  }

  function confirmCapturedEvidence() {
    if (!capturedPhotoBlob || !captureLocation) {
      setCaptureError('Foto e localizacao precisam ser capturadas antes de continuar.')
      return
    }

    setEvidenceReady(true)
    setCaptureState('ready')
    setCaptureError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!form.vehicle_id) {
      setError('Selecione um veiculo para continuar.')
      return
    }

    if (!evidenceReady || !capturedPhotoBlob || !captureLocation || !photoCapturedAt) {
      setCaptureError('Foto e localizacao sao obrigatorias para registrar a posse.')
      return
    }

    try {
      setSubmitting(true)
      setError('')
      setCaptureError('')

      const payload = new FormData()
      payload.append('vehicle_id', form.vehicle_id)
      payload.append('driver_name', form.driver_name)
      if (form.driver_document) payload.append('driver_document', form.driver_document)
      if (form.driver_contact) payload.append('driver_contact', form.driver_contact)
      if (form.start_date) payload.append('start_date', new Date(form.start_date).toISOString())
      if (form.observation) payload.append('observation', form.observation)
      payload.append('photo_captured_at', photoCapturedAt)
      payload.append('capture_latitude', String(captureLocation.latitude))
      payload.append('capture_longitude', String(captureLocation.longitude))
      payload.append('capture_accuracy_meters', String(captureLocation.accuracy_meters))
      payload.append('photo', capturedPhotoBlob, `posse-${form.vehicle_id}.jpg`)

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
      : evidenceReady
        ? 'Refazer captura'
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

      <div className="form-field modal-field-span">
        <label>Evidencia obrigatoria</label>
        <div className="evidence-shell">
          <div className="evidence-copy">
            <strong>Foto e localizacao sao obrigatorias para registrar a posse.</strong>
            <span>Use a camera do dispositivo para capturar o veiculo no local da troca.</span>
          </div>

          {!photoPreviewUrl && captureState !== 'preview' ? (
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
                  <button className="ghost-button" type="button" onClick={clearEvidenceState}>Cancelar</button>
                </div>
              </div>
            </div>
          ) : null}

          {photoPreviewUrl ? (
            <div className="evidence-review-grid">
              <div className="evidence-image-card">
                <img src={photoPreviewUrl} alt="Foto capturada do veiculo" className="evidence-image" />
              </div>
              <div className="evidence-meta-card">
                <strong>{evidenceReady ? 'Evidencia pronta para envio' : 'Revise a evidencia capturada'}</strong>
                <div className="stack">
                  <span><strong>Horario:</strong> {formatDateTime(photoCapturedAt)}</span>
                  <span>
                    <strong>Localizacao:</strong> {captureLocation ? `${captureLocation.latitude.toFixed(6)}, ${captureLocation.longitude.toFixed(6)}` : '-'}
                  </span>
                  <span>
                    <strong>Precisao:</strong> {captureLocation ? `${Math.round(captureLocation.accuracy_meters)} m` : '-'}
                  </span>
                </div>
                <div className="actions-inline">
                  {!evidenceReady ? (
                    <>
                      <button className="app-button" type="button" onClick={confirmCapturedEvidence}>Usar foto</button>
                      <button className="ghost-button" type="button" onClick={startEvidenceCapture}>Refazer</button>
                    </>
                  ) : (
                    <button className="ghost-button" type="button" onClick={startEvidenceCapture}>Refazer captura</button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="actions-inline modal-actions">
        <button className="app-button" type="submit" disabled={submitting || vehicles.length === 0 || !evidenceReady}>
          {submitting ? 'Salvando...' : 'Registrar posse'}
        </button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}
