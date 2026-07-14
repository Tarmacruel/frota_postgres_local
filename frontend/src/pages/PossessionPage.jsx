import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DriverSelect from '../components/DriverSelect'
import DocumentSignaturePanel from '../components/DocumentSignaturePanel'
import Modal from '../components/Modal'
import DriverBadge from '../components/DriverBadge'
import GuidedTour from '../components/GuidedTour'
import Pagination from '../components/Pagination'
import PossessionForm from '../components/PossessionForm'
import PossessionReportBuilder from '../components/PossessionReportBuilder'
import PossessionEndModal from '../components/PossessionEndModal'
import PossessionReturnCorrectionModal from '../components/PossessionReturnCorrectionModal'
import PossessionTripsModal from '../components/PossessionTripsModal'
import SearchableSelect from '../components/SearchableSelect'
import api from '../api/client'
import { DIGITAL_DOCUMENT_TYPES } from '../api/documentSignatures'
import { possessionAPI } from '../api/possession'
import { VEHICLE_LIST_LIMIT } from '../constants/pagination'
import { useAuth } from '../context/AuthContext'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'
import { getApiErrorCode, getHttpStatus } from '../utils/httpError'
import {
  resolvePossessionTermValidationUrl,
} from '../utils/possessionTermDocument'

const viewOptions = [
  { value: 'ATIVAS', label: 'Ativas' },
  { value: 'TODAS', label: 'Todas' },
  { value: 'ENCERRADAS', label: 'Encerradas' },
]

const unassignedOrganizationFilter = 'SEM_SECRETARIA'

const MAX_DOCUMENT_SIZE_BYTES = 12 * 1024 * 1024
const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function formatDate(value) {
  if (!value) return 'Atual'
  return new Date(value).toLocaleString('pt-BR')
}

function dateBoundary(value, boundary) {
  if (!value) return null
  const suffix = boundary === 'end' ? 'T23:59:59.999' : 'T00:00:00.000'
  const date = new Date(`${value}${suffix}`)
  return Number.isNaN(date.getTime()) ? null : date
}
function formatTimestamp(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function formatCoordinates(location) {
  if (!location) return '-'
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
}

function formatFileSize(bytes) {
  if (!bytes) return '-'
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${Math.round(bytes / 1024)} KB`
}

function openProtectedFile(url) {
  if (!url) return
  const previewWindow = window.open(url, '_blank', 'noopener,noreferrer')
  if (!previewWindow) {
    window.location.assign(url)
  }
}

function buildMapEmbedUrl(location) {
  if (!location) return ''
  const delta = 0.003
  const bbox = [
    (location.longitude - delta).toFixed(6),
    (location.latitude - delta).toFixed(6),
    (location.longitude + delta).toFixed(6),
    (location.latitude + delta).toFixed(6),
  ].join('%2C')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${location.latitude.toFixed(6)}%2C${location.longitude.toFixed(6)}`
}

function buildEndState(record) {
  return {
    end_date: toDateTimeLocalValue(new Date()),
    end_odometer_km: record?.end_odometer_km ?? '',
    vehicle_condition_notes: '',
    declaration_accepted: false,
  }
}

function buildVehicleOption(vehicle) {
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação'
  const organizationLabel = vehicle.current_location?.organization_name || 'Sem secretaria'
  const ownershipLabel = vehicle.ownership_type === 'LOCADO' ? 'Locado' : vehicle.ownership_type === 'CEDIDO' ? 'Cedido' : 'Próprio'
  return {
    value: vehicle.id,
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: `${ownershipLabel} | ${organizationLabel} | ${locationLabel}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.chassis_number, organizationLabel, locationLabel].filter(Boolean).join(' '),
  }
}

function normalizeUploadList(fileList) {
  return Array.from(fileList || [])
}

export default function PossessionPage() {
  const { canCreate, canEdit, isAdmin, isProduction, reload } = useAuth()
  const canCreatePossession = canCreate('possession')
  const canEditPossession = canEdit('possession')
  const [tourReplayToken, setTourReplayToken] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const [vehicles, setVehicles] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [startDateFrom, setStartDateFrom] = useState('')
  const [startDateTo, setStartDateTo] = useState('')
  const [viewFilter, setViewFilter] = useState('ATIVAS')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [tripsDialog, setTripsDialog] = useState(null)
  const [tripOverview, setTripOverview] = useState({})
  const [endingRecord, setEndingRecord] = useState(null)
  const [returnContext, setReturnContext] = useState(null)
  const [endError, setEndError] = useState('')
  const [endForm, setEndForm] = useState(buildEndState(null))
  const [ending, setEnding] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [editForm, setEditForm] = useState({
    driver_id: '',
    driver_name: '',
    driver_document: '',
    driver_contact: '',
    start_date: '',
    end_date: '',
    observation: '',
    start_odometer_km: '',
    end_odometer_km: '',
    edit_reason: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editDocumentFile, setEditDocumentFile] = useState(null)
  const [editDocumentError, setEditDocumentError] = useState('')
  const [editPhotoFiles, setEditPhotoFiles] = useState([])
  const [editPhotoError, setEditPhotoError] = useState('')
  const [photoRecord, setPhotoRecord] = useState(null)
  const [locationRecord, setLocationRecord] = useState(null)
  const [termRecord, setTermRecord] = useState(null)
  const [termBusy, setTermBusy] = useState(false)
  const [correctionRecord, setCorrectionRecord] = useState(null)
  const [correctionContext, setCorrectionContext] = useState(null)
  const [correctionForm, setCorrectionForm] = useState({ end_odometer_km: '', vehicle_condition_notes: '', correction_reason: '', declaration_accepted: false })
  const [correctionSaving, setCorrectionSaving] = useState(false)
  const [correctionError, setCorrectionError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const editDocumentInputRef = useRef(null)
  const editPhotoInputRef = useRef(null)
  const endingSubmitRef = useRef(false)
  const focusRecordId = searchParams.get('focus')
  const { organizations } = useMasterDataCatalog()

  const organizationFilterOptions = useMemo(() => {
    const hasUnassignedVehicles =
      vehicles.some((vehicle) => !vehicle.current_location?.organization_id) || organizationFilter === unassignedOrganizationFilter

    return [
      { value: '', label: 'Todas as secretarias' },
      ...organizations.map((organization) => ({ value: organization.id, label: organization.name })),
      ...(hasUnassignedVehicles ? [{ value: unassignedOrganizationFilter, label: 'Sem secretaria' }] : []),
    ]
  }, [organizationFilter, organizations, vehicles])

  function getRecordVehicle(record) {
    return vehicles.find((vehicle) => vehicle.id === record.vehicle_id) || null
  }

  function getRecordOrganizationId(record) {
    return getRecordVehicle(record)?.current_location?.organization_id || ''
  }

  function getRecordOrganizationName(record) {
    return getRecordVehicle(record)?.current_location?.organization_name || 'Sem secretaria'
  }

  async function loadVehicles() {
    const { data } = await api.get('/vehicles', { params: { limit: VEHICLE_LIST_LIMIT } })
    setVehicles(data)
  }

  async function loadPossessions() {
    try {
      setLoading(true)
      setError('')

      let data = []
      if (viewFilter === 'ATIVAS') {
        const response = await possessionAPI.listActive()
        data = response.data
      } else if (viewFilter === 'ENCERRADAS') {
        const response = await possessionAPI.list({ active: false, vehicle_id: vehicleFilter || undefined })
        data = response.data
      } else {
        const response = await possessionAPI.list({ vehicle_id: vehicleFilter || undefined })
        data = response.data
      }

      if (viewFilter === 'ATIVAS' && vehicleFilter) {
        data = data.filter((item) => item.vehicle_id === vehicleFilter)
      }

      setRecords(data)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar as posses.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function loadPage() {
      try {
        await loadVehicles()
      } catch (err) {
        setError(getApiErrorMessage(err, 'Não foi possível carregar os veículos.'))
      }
    }
    loadPage()
  }, [])

  useEffect(() => {
    loadPossessions()
  }, [vehicleFilter, viewFilter])

  useEffect(() => {
    if (focusRecordId && viewFilter !== 'TODAS') {
      setViewFilter('TODAS')
    }
  }, [focusRecordId, viewFilter])

  useEffect(() => {
    if (!focusRecordId) return
    setSearch('')
    setVehicleFilter('')
    setViewFilter('TODAS')
  }, [focusRecordId])

  const baseFilteredRecords = useMemo(() => {
    const startFrom = dateBoundary(startDateFrom, 'start')
    const startTo = dateBoundary(startDateTo, 'end')

    return records.filter((record) => {
      const term = search.trim().toLowerCase()
      const matchesSearch =
        !term ||
        [record.vehicle_plate, getRecordOrganizationName(record), record.driver_name, record.driver_document, record.driver_contact, record.observation]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(term))
      const recordOrganizationId = getRecordOrganizationId(record)
      const matchesOrganization =
        !organizationFilter ||
        (organizationFilter === unassignedOrganizationFilter ? !recordOrganizationId : recordOrganizationId === organizationFilter)
      let matchesStartDate = true

      if (startFrom || startTo) {
        const recordStartDate = new Date(record.start_date)
        matchesStartDate =
          !Number.isNaN(recordStartDate.getTime()) &&
          (!startFrom || recordStartDate >= startFrom) &&
          (!startTo || recordStartDate <= startTo)
      }

      return matchesSearch && matchesOrganization && matchesStartDate
    })
  }, [organizationFilter, records, search, startDateFrom, startDateTo, vehicles])

  const focusedRecord = focusRecordId ? records.find((record) => record.id === focusRecordId) || null : null
  const filteredRecords = focusedRecord ? [focusedRecord] : baseFilteredRecords
  const reportInitialFilters = useMemo(() => ({
    date_from: startDateFrom ? `${startDateFrom}T00:00` : '',
    date_to: startDateTo ? `${startDateTo}T23:59` : '',
    vehicle_id: vehicleFilter,
    organization_id: organizationFilter && organizationFilter !== unassignedOrganizationFilter ? organizationFilter : '',
    possession_status: viewFilter === 'ATIVAS' ? 'ACTIVE' : viewFilter === 'ENCERRADAS' ? 'CLOSED' : '',
    search: search.trim(),
  }), [organizationFilter, search, startDateFrom, startDateTo, vehicleFilter, viewFilter])
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / 10))
  const paginatedRecords = focusedRecord ? filteredRecords : filteredRecords.slice((currentPage - 1) * 10, currentPage * 10)
  const activePageRecordIds = paginatedRecords.filter((record) => record.is_active).map((record) => record.id).join('|')

  async function loadOpenTripState(record, signal) {
    setTripOverview((current) => ({
      ...current,
      [record.id]: { ...(current[record.id] || {}), loading: true, error: '' },
    }))
    try {
      const response = await possessionAPI.listTrips(
        record.id,
        { page: 1, limit: 1, status: 'EM_ANDAMENTO' },
        { signal },
      )
      const nextState = {
        openTrip: response.data.data[0] || null,
        loading: false,
        loaded: true,
        error: '',
      }
      setTripOverview((current) => ({ ...current, [record.id]: nextState }))
      return nextState
    } catch (requestError) {
      if (signal?.aborted) return null
      const message = getHttpStatus(requestError) === 401
        ? 'Sua sessão expirou. Entre novamente para continuar.'
        : getApiErrorMessage(requestError, 'Não foi possível verificar se há rota em andamento.')
      setTripOverview((current) => ({
        ...current,
        [record.id]: { openTrip: null, loading: false, loaded: false, error: message },
      }))
      if (getHttpStatus(requestError) === 401) {
        setError(message)
        await reload?.()
      }
      return null
    }
  }

  useEffect(() => {
    if (!activePageRecordIds) return undefined
    const controller = new AbortController()
    paginatedRecords
      .filter((record) => record.is_active)
      .forEach((record) => loadOpenTripState(record, controller.signal))
    return () => controller.abort()
  // O identificador agregado muda apenas quando o conjunto visível de posses ativas muda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageRecordIds])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, organizationFilter, vehicleFilter, startDateFrom, startDateTo, viewFilter, focusRecordId, records.length])

  function patchSearchParams(updates) {
    const next = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        next.delete(key)
      } else {
        next.set(key, value)
      }
    })
    setSearchParams(next)
  }

  function clearFocus() {
    patchSearchParams({ focus: null })
  }

  async function openEndModal(record) {
    let currentTripState = tripOverview[record.id]
    if (!currentTripState?.loaded && !currentTripState?.loading) {
      currentTripState = await loadOpenTripState(record)
    }
    if (!currentTripState?.loaded) {
      setError(currentTripState?.error || 'Aguarde a verificação das rotas antes de encerrar a posse.')
      return
    }
    if (currentTripState.openTrip) {
      setError('A posse não pode ser encerrada enquanto houver rota em andamento. Registre o retorno ou cancele a rota primeiro.')
      setTripsDialog({ possession: record, action: 'timeline' })
      return
    }
    try {
      const { data } = await possessionAPI.getReturnContext(record.id)
      if (data.has_open_trip) {
        setError('O servidor bloqueou o encerramento porque existe uma rota em andamento.')
        openTrips(record)
        return
      }
      setReturnContext(data)
      setEndError('')
      setEndingRecord(record)
      setEndForm({
        ...buildEndState(record),
        end_odometer_km: data.minimum_end_odometer_km ?? record.end_odometer_km ?? '',
      })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar a declaração oficial de devolução.'))
    }
  }

  async function handleUnauthorized() {
    setTripsDialog(null)
    setIsCreateModalOpen(false)
    closeEndModal()
    await reload?.()
  }

  function openTrips(record, action = 'timeline') {
    setError('')
    setFeedback('')
    setTripsDialog({ possession: record, action })
  }

  function openEditModal(record) {
    setEditingRecord(record)
    setEditForm({
      driver_id: record.driver_id || '',
      driver_name: record.driver_name || '',
      driver_document: record.driver_document || '',
      driver_contact: record.driver_contact || '',
      start_date: toDateTimeLocalValue(record.start_date),
      end_date: toDateTimeLocalValue(record.end_date),
      observation: record.observation || '',
      start_odometer_km: record.start_odometer_km ?? '',
      end_odometer_km: record.end_odometer_km ?? '',
      edit_reason: '',
    })
    setEditDocumentFile(null)
    setEditDocumentError('')
    setEditPhotoFiles([])
    setEditPhotoError('')
    if (editDocumentInputRef.current) {
      editDocumentInputRef.current.value = ''
    }
    if (editPhotoInputRef.current) {
      editPhotoInputRef.current.value = ''
    }
  }

  function closeEndModal() {
    setEndingRecord(null)
    setReturnContext(null)
    setEndError('')
    setEndForm(buildEndState(null))
  }

  function closeEditModal() {
    setEditingRecord(null)
    setEditForm({
      driver_id: '',
      driver_name: '',
      driver_document: '',
      driver_contact: '',
      start_date: '',
      end_date: '',
      observation: '',
      start_odometer_km: '',
      end_odometer_km: '',
      edit_reason: '',
    })
    setEditDocumentFile(null)
    setEditDocumentError('')
    setEditPhotoFiles([])
    setEditPhotoError('')
    if (editDocumentInputRef.current) {
      editDocumentInputRef.current.value = ''
    }
    if (editPhotoInputRef.current) {
      editPhotoInputRef.current.value = ''
    }
  }

  function closePhotoModal() {
    setPhotoRecord(null)
  }

  function closeLocationModal() {
    setLocationRecord(null)
  }

  function closeTermModal() {
    setTermRecord(null)
  }

  function handleEditDocumentChange(event) {
    const nextFile = event.target.files?.[0] || null
    if (!nextFile) {
      setEditDocumentFile(null)
      setEditDocumentError('')
      return
    }

    if (!ALLOWED_DOCUMENT_TYPES.includes(nextFile.type)) {
      setEditDocumentFile(null)
      setEditDocumentError('Anexe PDF, imagem, DOC ou DOCX no documento assinado da entrega.')
      if (editDocumentInputRef.current) {
        editDocumentInputRef.current.value = ''
      }
      return
    }

    if (nextFile.size > MAX_DOCUMENT_SIZE_BYTES) {
      setEditDocumentFile(null)
      setEditDocumentError('O documento precisa ter no máximo 12 MB.')
      if (editDocumentInputRef.current) {
        editDocumentInputRef.current.value = ''
      }
      return
    }

    setEditDocumentFile(nextFile)
    setEditDocumentError('')
  }

  function clearEditDocument() {
    setEditDocumentFile(null)
    setEditDocumentError('')
    if (editDocumentInputRef.current) {
      editDocumentInputRef.current.value = ''
    }
  }

  function handleEditPhotoChange(event) {
    const selectedFiles = normalizeUploadList(event.target.files)
    if (!selectedFiles.length) {
      setEditPhotoFiles([])
      setEditPhotoError('')
      return
    }

    const invalidType = selectedFiles.find((file) => !ALLOWED_PHOTO_TYPES.includes(file.type))
    if (invalidType) {
      setEditPhotoFiles([])
      setEditPhotoError('As fotos adicionais devem estar em JPG, PNG ou WEBP.')
      if (editPhotoInputRef.current) {
        editPhotoInputRef.current.value = ''
      }
      return
    }

    const oversized = selectedFiles.find((file) => file.size > MAX_PHOTO_SIZE_BYTES)
    if (oversized) {
      setEditPhotoFiles([])
      setEditPhotoError('Cada foto adicional deve ter no máximo 8 MB.')
      if (editPhotoInputRef.current) {
        editPhotoInputRef.current.value = ''
      }
      return
    }

    setEditPhotoFiles(selectedFiles)
    setEditPhotoError('')
  }

  function clearEditPhotos() {
    setEditPhotoFiles([])
    setEditPhotoError('')
    if (editPhotoInputRef.current) {
      editPhotoInputRef.current.value = ''
    }
  }

  async function handleEndPossession(event) {
    event.preventDefault()
    if (!endingRecord || endingSubmitRef.current) return
    if (!canEditPossession) {
      setError('Você não tem permissão para encerrar posses.')
      return
    }

    try {
      endingSubmitRef.current = true
      setEnding(true)
      setError('')
      setEndError('')
      const payload = {
        end_date: new Date(endForm.end_date).toISOString(),
        end_odometer_km: Number(endForm.end_odometer_km),
        vehicle_condition_notes: endForm.vehicle_condition_notes,
        declaration_accepted: endForm.declaration_accepted,
      }
      await possessionAPI.end(endingRecord.id, payload)
      setFeedback('Devolução confirmada e posse encerrada com sucesso.')
      closeEndModal()
      await loadPossessions()
    } catch (err) {
      const status = getHttpStatus(err)
      const code = getApiErrorCode(err)
      if (status === 401) {
        setEndError('Sua sessão expirou. Entre novamente para continuar.')
        await handleUnauthorized()
      } else if (status === 403) {
        setEndError('Seu perfil não possui permissão para encerrar posses.')
      } else if (status === 409 && code === 'POSSESSION_HAS_OPEN_TRIP') {
        const record = endingRecord
        closeEndModal()
        if (record) openTrips(record)
        setError('O servidor bloqueou o encerramento porque existe uma rota em andamento.')
      } else if (status === 409) {
        setEndError(getApiErrorMessage(err, 'O estado da posse mudou. Atualize os dados antes de encerrar.'))
      } else if (status === 422) {
        setEndError(getApiErrorMessage(err, 'Revise os dados e confirme integralmente a declaração.'))
      } else {
        setEndError(getApiErrorMessage(err, 'Não foi possível encerrar a posse.'))
      }
    } finally {
      endingSubmitRef.current = false
      setEnding(false)
    }
  }

  async function handleEditPossession(event) {
    event.preventDefault()
    if (!editingRecord) return
    if (!canEditPossession) {
      setError('Você não tem permissão para retificar posses.')
      return
    }

    try {
      setSavingEdit(true)
      setError('')
      const payload = new FormData()
      if (editForm.driver_id) payload.append('driver_id', editForm.driver_id)
      payload.append('driver_name', editForm.driver_name)
      if (editForm.driver_document) payload.append('driver_document', editForm.driver_document)
      if (editForm.driver_contact) payload.append('driver_contact', editForm.driver_contact)
      payload.append('start_date', new Date(editForm.start_date).toISOString())
      if (editForm.end_date) payload.append('end_date', new Date(editForm.end_date).toISOString())
      if (editForm.observation) payload.append('observation', editForm.observation)
      if (editForm.start_odometer_km !== '') payload.append('start_odometer_km', String(Number(editForm.start_odometer_km)))
      if (editForm.end_odometer_km !== '') payload.append('end_odometer_km', String(Number(editForm.end_odometer_km)))
      payload.append('edit_reason', editForm.edit_reason)
      if (editDocumentFile) {
        payload.append('loan_term_document', editDocumentFile, editDocumentFile.name)
      }
      editPhotoFiles.forEach((file) => {
        payload.append('new_photos', file, file.name)
      })

      await possessionAPI.update(editingRecord.id, payload)
      setFeedback('Registro de posse retificado com justificativa e auditoria.')
      closeEditModal()
      await loadPossessions()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível retificar a posse.'))
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleOfficialTerm(record, disposition) {
    const previewWindow = disposition === 'inline' ? window.open('about:blank', '_blank') : null
    if (previewWindow) previewWindow.opener = null
    try {
      setError('')
      setTermBusy(true)
      const response = await possessionAPI.getOfficialTerm(record.id, disposition)
      const objectUrl = URL.createObjectURL(response.data)
      if (disposition === 'attachment') {
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = `termo-posse-${record.public_number}.pdf`
        document.body.appendChild(link)
        link.click()
        link.remove()
      } else {
        if (previewWindow) previewWindow.location.replace(objectUrl)
        else window.location.assign(objectUrl)
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
      setFeedback(disposition === 'attachment' ? 'Download protegido iniciado.' : 'Pré-visualização protegida aberta.')
    } catch (err) {
      previewWindow?.close()
      setError(getApiErrorMessage(err, 'Não foi possível obter o termo oficial.'))
    } finally {
      setTermBusy(false)
    }
  }

  async function openReturnCorrection(record) {
    try {
      setCorrectionError('')
      const { data } = await possessionAPI.getReturnContext(record.id)
      if (!data.current_confirmation) {
        setError('Esta posse não possui confirmação versionada para retificar.')
        return
      }
      setCorrectionRecord(record)
      setCorrectionContext(data)
      setCorrectionForm({
        end_odometer_km: data.current_confirmation.final_odometer_km,
        vehicle_condition_notes: data.current_confirmation.vehicle_condition_notes,
        correction_reason: '',
        declaration_accepted: false,
      })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar a confirmação atual.'))
    }
  }

  function closeReturnCorrection(force = false) {
    if (correctionSaving && !force) return
    setCorrectionRecord(null)
    setCorrectionContext(null)
    setCorrectionError('')
  }

  async function handleReturnCorrection(event) {
    event.preventDefault()
    if (!correctionRecord || correctionSaving) return
    try {
      setCorrectionSaving(true)
      setCorrectionError('')
      const { data } = await possessionAPI.correctReturnConfirmation(correctionRecord.id, {
        ...correctionForm,
        end_odometer_km: Number(correctionForm.end_odometer_km),
      })
      setFeedback(`Confirmação de devolução retificada na versão ${data.version}; a versão anterior foi preservada.`)
      closeReturnCorrection(true)
      await loadPossessions()
    } catch (err) {
      setCorrectionError(getApiErrorMessage(err, 'Não foi possível criar a nova versão da confirmação.'))
    } finally {
      setCorrectionSaving(false)
    }
  }

  async function handleCopyTermLink(record, termType) {
    const path = termType === 'return'
      ? record.return_term_public_validation_path
      : record.loan_term_public_validation_path
    const publicUrl = resolvePossessionTermValidationUrl(path)
    if (!publicUrl) {
      setFeedback('Link público indisponível para este termo.')
      return
    }

    if (!navigator.clipboard) {
      setFeedback(`Link público: ${publicUrl}`)
      return
    }

    try {
      await navigator.clipboard.writeText(publicUrl)
      setFeedback(`Link público do termo de ${termType === 'return' ? 'devolução' : 'empréstimo'} copiado com sucesso.`)
    } catch {
      setFeedback(`Link público: ${publicUrl}`)
    }
  }

  function handleTermSignatureChanged(termType, summary) {
    if (!termRecord) return
    const nextSignatureSummary = {
      ...(termRecord.signature_summary || {}),
      [termType]: summary,
    }
    setTermRecord({ ...termRecord, signature_summary: nextSignatureSummary })
    setRecords((current) => current.map((record) => (
      record.id === termRecord.id
        ? { ...record, signature_summary: nextSignatureSummary }
        : record
    )))
  }

  function renderTripActions(record) {
    const overview = tripOverview[record.id]
    return (
      <>
        <button type="button" className="mini-button" data-tour="possession-routes" onClick={() => openTrips(record)}>
          Rotas
        </button>
        {record.is_active && (canCreatePossession || canEditPossession) ? (
          overview?.loading || !overview ? (
            <span className="route-state-text" role="status">Verificando rota...</span>
          ) : overview.error ? (
            <button type="button" className="mini-button" onClick={() => loadOpenTripState(record)}>
              Verificar rota novamente
            </button>
          ) : overview.openTrip ? (
            <>
              {canEditPossession ? (
                <>
                  <button type="button" className="mini-button" onClick={() => openTrips(record, 'add')}>Adicionar destino</button>
                  <button type="button" className="mini-button route-return-button" data-tour="possession-route-return" onClick={() => openTrips(record, 'end')}>Registrar retorno</button>
                  <button type="button" className="mini-button route-cancel-button" onClick={() => openTrips(record, 'cancel')}>Cancelar rota</button>
                </>
              ) : null}
              <button type="button" className="mini-button" data-tour="possession-end" disabled title="Registre o retorno ou cancele a rota antes de encerrar a posse.">
                Encerrar posse bloqueado
              </button>
            </>
          ) : (
            <>
              {canCreatePossession ? (
                <button type="button" className="mini-button" data-tour="possession-route-start" onClick={() => openTrips(record, 'create')}>Iniciar rota</button>
              ) : null}
              {canEditPossession ? (
                <button type="button" className="mini-button possession-end-button" data-tour="possession-end" onClick={() => openEndModal(record)}>Encerrar posse</button>
              ) : null}
            </>
          )
        ) : null}
      </>
    )
  }

  const activeCount = filteredRecords.filter((item) => item.is_active).length

  const tourSteps = useMemo(() => ([
    {
      selector: '[data-tour="possession-overview"]',
      title: 'Posse e rota agora são separadas',
      description: 'A posse representa a responsabilidade pelo veículo. Cada saída e retorno fica registrada como uma rota dentro dela.',
    },
    {
      selector: '[data-tour="possession-create"]',
      title: canCreatePossession ? 'Comece com ou sem rota' : 'Consulte o histórico com segurança',
      description: canCreatePossession
        ? 'Ao criar uma posse, a rota inicial é opcional. Se o veículo já estiver em posse, a substituição exige confirmação e justificativa.'
        : 'Seu perfil tem acesso de consulta. Documento, contato e localização seguem o mascaramento definido pelo backend.',
    },
    {
      selectors: ['[data-tour="possession-routes"]', '[data-tour="possession-records"]'],
      title: 'Acompanhe a timeline de rotas',
      description: 'Em Rotas você inicia deslocamentos, inclui destinos e consulta cada etapa na ordem em que ocorreu.',
    },
    {
      selectors: [
        '[data-tour="possession-route-return"]',
        '[data-tour="possession-end"]',
        '[data-tour="possession-route-start"]',
        '[data-tour="possession-routes"]',
        '[data-tour="possession-records"]',
      ],
      title: 'Retorno não encerra a posse',
      description: 'Registrar retorno fecha somente a rota. Encerrar posse finaliza a responsabilidade e exige a declaração de devolução.',
    },
    {
      selector: '[data-tour="possession-reports"]',
      title: 'Relatórios seguem o seu perfil',
      description: 'Use Mais opções para escolher modo, filtros, preset e ordem das colunas. PDF e XLSX são gerados e autorizados pelo backend.',
    },
  ]), [canCreatePossession])

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div data-tour="possession-overview">
          <h2 className="section-title">Posses de veículos</h2>
          <p className="section-copy">Controle quem está com cada veículo, anexe evidências e mantenha um histórico simples de transferências.</p>
        </div>
        <div className="actions-inline">
          {canCreatePossession ? (
            <button data-tour="possession-create" className="app-button" type="button" onClick={() => setIsCreateModalOpen(true)}>
              Nova posse
            </button>
          ) : (
            <span data-tour="possession-create" className="route-state-text">Consulta protegida por perfil</span>
          )}
          <div data-tour="possession-reports">
            <PossessionReportBuilder vehicles={vehicles} initialFilters={reportInitialFilters} />
          </div>
          <button className="secondary-button" type="button" onClick={() => setTourReplayToken((value) => value + 1)}>
            Ver tour rápido
          </button>
        </div>
      </div>

      <div className="toolbar-card">
        <div className="toolbar-row">
          <div className="status-pills">
            {viewOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`status-pill${viewFilter === option.value ? ' active' : ''}`}
                onClick={() => setViewFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="filter-inline">
            <input
              className="app-input"
              placeholder={(isAdmin || isProduction) ? 'Buscar por placa, secretaria, condutor ou contato' : 'Buscar por placa ou número da posse'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <SearchableSelect
              value={organizationFilter}
              onChange={setOrganizationFilter}
              options={organizationFilterOptions}
              placeholder="Filtrar secretaria"
              searchPlaceholder="Buscar secretaria"
            />
            <SearchableSelect
              value={vehicleFilter}
              onChange={setVehicleFilter}
              options={[{ value: '', label: 'Todos os veículos' }, ...vehicles.map(buildVehicleOption)]}
              placeholder="Filtrar veículo"
              searchPlaceholder="Buscar veículo por placa, modelo, chassi ou lotação"
            />
            <label className="form-field filter-date-field">
              <span>Data inicial</span>
              <input
                className="app-input"
                type="date"
                value={startDateFrom}
                onChange={(event) => setStartDateFrom(event.target.value)}
                aria-label="Data inicial do início da posse"
                title="Data inicial do início da posse"
              />
            </label>
            <label className="form-field filter-date-field">
              <span>Data final</span>
              <input
                className="app-input"
                type="date"
                value={startDateTo}
                onChange={(event) => setStartDateTo(event.target.value)}
                aria-label="Data final do início da posse"
                title="Data final do início da posse"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{filteredRecords.length}</strong>
          <span>registros exibidos</span>
        </div>
        <div className="metric-inline">
          <strong>{activeCount}</strong>
          <span>posses ativas</span>
        </div>
      </div>

      {focusedRecord ? (
        <div className="table-focus-banner">
          <div>
            <strong>Mostrando apenas o registro de {focusedRecord.driver_name}</strong>
            <span>Esse foco foi aberto diretamente pela busca global. Reexiba a lista para continuar navegando.</span>
          </div>
          <button className="ghost-button" type="button" onClick={clearFocus}>Reexibir todos</button>
        </div>
      ) : null}

      <div className="sr-status" aria-live="polite" aria-atomic="true">{error || feedback}</div>
      {error ? <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" role="status" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested" data-tour="possession-records">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th>Veículo</th>
                <th>Condutor</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Observação</th>
                <th>Status</th>
                <th>Km inicial</th>
                <th>Km final</th>
                <th>Km rodados</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="muted">Carregando posses...</td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">Nenhum registro de posse encontrado para os filtros atuais.</div>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record) => (
                  <tr key={record.id} className={focusedRecord?.id === record.id ? 'is-focused-row' : ''}>
                    <td data-label="Veículo">
                      <div className="stack">
                        <strong>{record.vehicle_plate}</strong>
                        {record.public_number ? <span className="muted">Posse #{record.public_number}</span> : null}
                        <span className="muted">{getRecordOrganizationName(record)}</span>
                      </div>
                    </td>
                    <td data-label="Condutor">
                      <DriverBadge
                        name={record.driver_name}
                        document={record.driver_document}
                        contact={record.driver_contact}
                      />
                    </td>
                    <td data-label="Início">{formatDate(record.start_date)}</td>
                    <td data-label="Fim">{formatDate(record.end_date)}</td>
                    <td data-label="Observação">
                      <div className="stack">
                        <span>{record.observation || 'Sem observação'}</span>
                        {record.photo_available ? (
                          <span className="muted">
                            {record.photo_count} foto(s) vinculada(s){record.photo_captured_at ? ` | primeira em ${formatTimestamp(record.photo_captured_at)}` : ''}
                          </span>
                        ) : (
                          <span className="muted">Sem evidencia (legado)</span>
                        )}
                        {(record.loan_term_available ?? record.document_available) ? (
                          <span className="muted">
                            Anexo assinado da entrega: {record.loan_term_name || record.document_name || 'Anexado'} | {formatTimestamp(record.loan_term_uploaded_at || record.document_uploaded_at)}
                          </span>
                        ) : (
                          <span className="muted">Sem anexo assinado da entrega</span>
                        )}
                        {record.return_confirmation_available ? (
                          <span className="muted">Devolução confirmada · versão {record.return_confirmation_version}</span>
                        ) : (
                          <span className="muted">{record.is_active ? 'Devolução aguardando encerramento' : 'Registro encerrado sem confirmação versionada'}</span>
                        )}
                        {record.return_term_available ? <span className="muted">Anexo legado de devolução: {record.return_term_name || 'Disponível'}</span> : null}
                        {isAdmin ? <span className="muted">Criado em {formatDate(record.created_at)}</span> : null}
                      </div>
                    </td>
                    <td data-label="Status">
                      <span className={`status-badge ${record.is_active ? 'status-ATIVO' : 'status-INATIVO'}`}>
                        {record.is_active ? 'ATIVA' : 'ENCERRADA'}
                      </span>
                    </td>
                    <td data-label="Km inicial">{record.start_odometer_km ?? '-'}</td>
                    <td data-label="Km final">{record.end_odometer_km ?? '-'}</td>
                    <td data-label="Km rodados">{record.kilometers_driven ?? '-'}</td>
                    <td data-label="Ações">
                      <div className="actions-inline">
                        {record.photo_available ? (
                          <button type="button" className="mini-button" onClick={() => setPhotoRecord(record)}>
                            Ver fotos
                          </button>
                        ) : (
                          <span className="muted">Legado</span>
                        )}
                        <button type="button" className="mini-button" onClick={() => setTermRecord(record)}>
                          Termos
                        </button>
                        {isAdmin && canEditPossession ? (
                          <button type="button" className="mini-button" onClick={() => openEditModal(record)}>
                            Retificar
                          </button>
                        ) : null}
                        {renderTripActions(record)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!focusedRecord ? <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} /> : null}

      <GuidedTour
        steps={tourSteps}
        storageKey="frota-possession-tour-v1"
        replayToken={tourReplayToken}
      />

      <Modal
        open={isCreateModalOpen}
        title="Nova posse"
        description="Registre a posse com ou sem rota inicial. Se já houver posse ativa, o sistema pedirá confirmação consciente e justificativa antes de qualquer substituição. Evidências e documento assinado da entrega continuam opcionais."
        onClose={() => setIsCreateModalOpen(false)}
      >
        <PossessionForm
          vehicles={vehicles}
          onClose={() => setIsCreateModalOpen(false)}
          onUnauthorized={handleUnauthorized}
          onSuccess={async (message) => {
            setFeedback(message)
            await loadPossessions()
          }}
        />
      </Modal>

      <PossessionTripsModal
        possession={tripsDialog?.possession || null}
        suggestedOrigin={tripsDialog ? getRecordVehicle(tripsDialog.possession)?.current_location?.display_name || '' : ''}
        initialAction={tripsDialog?.action || 'timeline'}
        canCreate={canCreatePossession}
        canEdit={canEditPossession}
        onClose={() => setTripsDialog(null)}
        onUnauthorized={handleUnauthorized}
        onStateChange={(nextState) => {
          const possessionId = tripsDialog?.possession?.id
          if (!possessionId) return
          setTripOverview((current) => ({ ...current, [possessionId]: { ...nextState, loaded: !nextState.error } }))
        }}
      />

      <Modal
        open={Boolean(editingRecord)}
        title="Retificar posse"
        description={editingRecord ? `Retificação administrativa de ${editingRecord.driver_name} no veículo ${editingRecord.vehicle_plate}. A justificativa é obrigatória, entra na auditoria e também pode substituir termos e fotos complementares.` : ''}
        onClose={closeEditModal}
      >
        <form onSubmit={handleEditPossession} className="form-grid modal-form-grid">
          <div className="form-field">
            <label>Condutor</label>
            <DriverSelect
              value={editForm.driver_id}
              onChange={(driver) => setEditForm({
                ...editForm,
                driver_id: driver?.id || '',
                driver_name: driver?.nome_completo || '',
                driver_document: driver?.documento || '',
                driver_contact: driver?.contato || '',
              })}
            />
            {!editForm.driver_id && editForm.driver_name ? <span className="helper-text">Registro legado atual: {editForm.driver_name}</span> : null}
          </div>
          <div className="form-field">
            <label htmlFor="edit-possession-document">Documento</label>
            <input
              id="edit-possession-document"
              className="app-input"
              value={editForm.driver_document}
              readOnly
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-possession-contact">Contato</label>
            <input
              id="edit-possession-contact"
              className="app-input"
              value={editForm.driver_contact}
              readOnly
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-possession-start">Início</label>
            <input
              id="edit-possession-start"
              type="datetime-local"
              className="app-input"
              value={editForm.start_date}
              onChange={(event) => setEditForm({ ...editForm, start_date: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-possession-end">Fim</label>
            <input
              id="edit-possession-end"
              type="datetime-local"
              className="app-input"
              value={editForm.end_date}
              onChange={(event) => setEditForm({ ...editForm, end_date: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-possession-start-odometer">Odômetro inicial (km)</label>
            <input
              id="edit-possession-start-odometer"
              type="number"
              min="0"
              step="0.1"
              className="app-input"
              value={editForm.start_odometer_km}
              onChange={(event) => setEditForm({ ...editForm, start_odometer_km: event.target.value })}
            />
          </div>

          <div className="form-field">
            <label htmlFor="edit-possession-end-odometer">Odômetro final (km)</label>
            <input
              id="edit-possession-end-odometer"
              type="number"
              min="0"
              step="0.1"
              className="app-input"
              value={editForm.end_odometer_km}
              onChange={(event) => setEditForm({ ...editForm, end_odometer_km: event.target.value })}
            />
          </div>

          <div className="form-field modal-field-span">
            <label htmlFor="edit-possession-observation">Observação</label>
            <textarea
              id="edit-possession-observation"
              className="app-textarea"
              rows="4"
              value={editForm.observation}
              onChange={(event) => setEditForm({ ...editForm, observation: event.target.value })}
            />
            <span className="helper-text">Informe somente fatos operacionais necessários; não inclua dados pessoais desnecessários.</span>
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="edit-possession-reason">Justificativa da retificação</label>
            <textarea
              id="edit-possession-reason"
              className="app-textarea"
              rows="3"
              placeholder="Explique por que este registro precisa ser retificado."
              value={editForm.edit_reason}
              onChange={(event) => setEditForm({ ...editForm, edit_reason: event.target.value })}
            />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="edit-possession-document-file">Documento assinado da entrega</label>
            <div className="evidence-shell">
              <div className="evidence-copy">
                <strong>Anexe ou substitua o documento original da entrega, se necessário.</strong>
                <span>{(editingRecord?.loan_term_available ?? editingRecord?.document_available) ? `Anexo atual: ${editingRecord.loan_term_name || editingRecord.document_name || 'Documento anexado'}.` : 'Ainda não há documento de entrega anexado neste registro.'}</span>
              </div>
              <input
                ref={editDocumentInputRef}
                id="edit-possession-document-file"
                type="file"
                className="app-input"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleEditDocumentChange}
              />
              {editDocumentError ? <div className="alert alert-error evidence-alert">{editDocumentError}</div> : null}
              {editDocumentFile ? (
                <div className="camera-stage-footer">
                  <div className="stack">
                    <strong>{editDocumentFile.name}</strong>
                    <span className="muted">Tipo: {editDocumentFile.type || 'Arquivo compativel'} | Tamanho: {formatFileSize(editDocumentFile.size)}</span>
                  </div>
                  <button className="ghost-button" type="button" onClick={clearEditDocument}>Remover anexo</button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="edit-possession-photos">Fotos adicionais</label>
            <div className="evidence-shell">
              <div className="evidence-copy">
                <strong>Inclua fotos complementares do veículo quando a correção exigir mais evidências.</strong>
                <span>{editingRecord?.photo_available ? `${editingRecord.photo_count} foto(s) já vinculada(s) a esta posse.` : 'Nenhuma foto vinculada ainda a este registro.'}</span>
              </div>
              <input
                ref={editPhotoInputRef}
                id="edit-possession-photos"
                type="file"
                multiple
                className="app-input"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleEditPhotoChange}
              />
              {editPhotoError ? <div className="alert alert-error evidence-alert">{editPhotoError}</div> : null}
              {editPhotoFiles.length ? (
                <div className="stack">
                  {editPhotoFiles.map((file) => (
                    <span key={`${file.name}-${file.size}`} className="muted">
                      {file.name} | {formatFileSize(file.size)}
                    </span>
                  ))}
                  <div className="actions-inline">
                    <button className="ghost-button" type="button" onClick={clearEditPhotos}>Limpar fotos adicionadas</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={savingEdit || !editForm.start_date || !editForm.edit_reason.trim()}>
              {savingEdit ? 'Salvando...' : 'Salvar retificação'}
            </button>
            <button className="ghost-button" type="button" onClick={closeEditModal}>Cancelar</button>
          </div>
        </form>
      </Modal>

      <PossessionEndModal
        record={endingRecord}
        context={returnContext}
        form={endForm}
        ending={ending}
        error={endError}
        onChange={(patch) => setEndForm((current) => ({ ...current, ...patch }))}
        onClose={closeEndModal}
        onSubmit={handleEndPossession}
      />

      <Modal
        open={Boolean(termRecord)}
        title="Termo de Posse e Responsabilidade"
        description={termRecord ? `Documento único oficial da posse nº ${termRecord.public_number} · ${termRecord.vehicle_plate}.` : ''}
        onClose={closeTermModal}
      >
        {termRecord ? (
          <div className="evidence-gallery-grid">
            <article className="evidence-meta-card official-term-card">
              <strong>Termo único oficial</strong>
              <p className="muted">Documento institucional que reúne a entrega, a responsabilidade, as rotas, os destinos e a devolução vinculados a esta posse.</p>
              <div className="actions-inline">
                <button type="button" className="app-button" disabled={termBusy} onClick={() => handleOfficialTerm(termRecord, 'inline')}>
                  {termBusy ? 'Preparando…' : 'Pré-visualizar PDF'}
                </button>
                {(isAdmin || isProduction) ? (
                  <button type="button" className="secondary-button" disabled={termBusy} onClick={() => handleOfficialTerm(termRecord, 'attachment')}>
                    Baixar PDF oficial
                  </button>
                ) : null}
                {isAdmin && !termRecord.is_active ? (
                  <button type="button" className="ghost-button" disabled={termBusy} onClick={() => openReturnCorrection(termRecord)}>
                    Retificar devolução
                  </button>
                ) : null}
              </div>
              {!(isAdmin || isProduction) ? <span className="helper-text">Seu perfil recebe uma visualização mascarada; o download integral é restrito.</span> : null}
              <DocumentSignaturePanel
                documentType={DIGITAL_DOCUMENT_TYPES.POSSESSION_RESPONSIBILITY_TERM}
                sourceId={termRecord.id}
                summary={termRecord.signature_summary?.responsibility}
                title="Assinatura eletrônica do responsável pela entrega"
                description="Registra a declaração do agente que realizou ou conferiu administrativamente a entrega."
                readOnly={!canEditPossession}
                onChanged={(summary) => handleTermSignatureChanged('responsibility', summary)}
              />
            </article>

            {(termRecord.loan_term_validation_code || termRecord.return_term_validation_code || termRecord.return_term_available) ? (
            <article className="evidence-meta-card legacy-term-card">
              <strong>Registros legados</strong>
              <p className="muted">Códigos públicos, anexos separados e confirmações históricas abaixo permanecem somente para consulta.</p>
              <div className="stack">
                <span className="muted">Código de empréstimo: {termRecord.loan_term_validation_code || '—'}</span>
                <span className="muted">Código de devolução: {termRecord.return_term_validation_code || '—'}</span>
                <span className="muted">
                  Anexo de entrega: {(termRecord.loan_term_available ?? termRecord.document_available) ? (termRecord.loan_term_name || termRecord.document_name || 'Documento anexado') : 'Não disponível'}
                </span>
                <span className="muted">Anexo de devolução: {termRecord.return_term_available ? (termRecord.return_term_name || 'Documento anexado') : 'Não disponível'}</span>
              </div>
              <div className="actions-inline">
                {termRecord.loan_term_public_validation_path ? <button type="button" className="secondary-button" onClick={() => handleCopyTermLink(termRecord, 'loan')}>Copiar link legado de empréstimo</button> : null}
                {termRecord.return_term_public_validation_path ? <button type="button" className="secondary-button" onClick={() => handleCopyTermLink(termRecord, 'return')}>Copiar link legado de devolução</button> : null}
                {(termRecord.loan_term_url || termRecord.document_url) ? (
                  <button type="button" className="ghost-button" onClick={() => openProtectedFile(termRecord.loan_term_url || termRecord.document_url)}>
                    Abrir anexo legado de entrega
                  </button>
                ) : null}
                {termRecord.return_term_url ? <button type="button" className="ghost-button" onClick={() => openProtectedFile(termRecord.return_term_url)}>Abrir anexo legado de devolução</button> : null}
              </div>
              <DocumentSignaturePanel
                documentType={DIGITAL_DOCUMENT_TYPES.POSSESSION_LOAN_TERM}
                sourceId={termRecord.id}
                summary={termRecord.signature_summary?.loan}
                title="Confirmação histórica do termo de empréstimo"
                readOnly
                onChanged={(summary) => handleTermSignatureChanged('loan', summary)}
              />
              {termRecord.return_term_validation_code ? (
                <DocumentSignaturePanel
                  documentType={DIGITAL_DOCUMENT_TYPES.POSSESSION_RETURN_TERM}
                  sourceId={termRecord.id}
                  summary={termRecord.signature_summary?.return}
                  title="Confirmação histórica do termo de devolução"
                  readOnly
                  onChanged={(summary) => handleTermSignatureChanged('return', summary)}
                />
              ) : null}
            </article>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <PossessionReturnCorrectionModal
        record={correctionRecord}
        context={correctionContext}
        form={correctionForm}
        saving={correctionSaving}
        error={correctionError}
        onChange={(patch) => setCorrectionForm((current) => ({ ...current, ...patch }))}
        onClose={closeReturnCorrection}
        onSubmit={handleReturnCorrection}
      />

      <Modal
        open={Boolean(photoRecord)}
        title="Fotos da posse"
        description={photoRecord ? `Evidências registradas para ${photoRecord.driver_name} no veículo ${photoRecord.vehicle_plate}.` : ''}
        onClose={closePhotoModal}
      >
        {photoRecord ? (
          <div className="evidence-gallery-grid">
            {(photoRecord.photos || []).map((photo, index) => (
              <article key={photo.id || `legacy-${index}`} className="evidence-thumb-card evidence-thumb-card-large">
                <img src={photo.url} alt={`Foto ${index + 1} da posse do veículo ${photoRecord.vehicle_plate}`} className="evidence-thumb-image" />
                <div className="stack">
                  <strong>Foto {index + 1}</strong>
                  <span className="muted">Condutor: {photoRecord.driver_name}</span>
                  <span className="muted">Capturada em: {formatTimestamp(photo.captured_at)}</span>
                  <span className="muted">{photo.is_legacy ? 'Foto legada do registro' : 'Foto complementar da posse'}</span>
                </div>
                <div className="actions-inline">
                  <button type="button" className="mini-button" onClick={() => openProtectedFile(photo.url)}>
                    Abrir
                  </button>
                  {isAdmin && photo.capture_location ? (
                    <button type="button" className="mini-button" onClick={() => setLocationRecord({ record: photoRecord, photo })}>
                      Local
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(locationRecord)}
        title="Local da captura"
        description={locationRecord ? `Georreferenciamento da foto registrada para ${locationRecord.record.vehicle_plate}.` : ''}
        onClose={closeLocationModal}
      >
        {locationRecord?.photo?.capture_location ? (
          <div className="evidence-modal-grid">
            <div className="map-frame-card">
              <iframe
                title={`Mapa da posse de ${locationRecord.record.vehicle_plate}`}
                src={buildMapEmbedUrl(locationRecord.photo.capture_location)}
                className="map-frame"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="evidence-meta-card">
              <strong>Coordenadas da captura</strong>
              <div className="stack">
                <span><strong>Veículo:</strong> {locationRecord.record.vehicle_plate}</span>
                <span><strong>Latitude/Longitude:</strong> {formatCoordinates(locationRecord.photo.capture_location)}</span>
                <span><strong>Precisão:</strong> {Math.round(locationRecord.photo.capture_location.accuracy_meters)} m</span>
                <span><strong>Capturada em:</strong> {formatTimestamp(locationRecord.photo.captured_at)}</span>
              </div>
              <a
                href={locationRecord.photo.capture_location.maps_url}
                target="_blank"
                rel="noreferrer"
                className="secondary-button"
              >
                Abrir no mapa
              </a>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
