import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DriverSelect from '../components/DriverSelect'
import Modal from '../components/Modal'
import DriverBadge from '../components/DriverBadge'
import Pagination from '../components/Pagination'
import PossessionForm from '../components/PossessionForm'
import SearchableSelect from '../components/SearchableSelect'
import api from '../api/client'
import { possessionAPI } from '../api/possession'
import { VEHICLE_LIST_LIMIT } from '../constants/pagination'
import { useAuth } from '../context/AuthContext'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import { toDateTimeLocalValue } from '../utils/datetime'
import {
  previewPossessionTermDocument,
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
    observation: record?.observation || '',
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
  const { canCreate, canEdit, isAdmin } = useAuth()
  const canCreatePossession = canCreate('possession')
  const canEditPossession = canEdit('possession')
  const [searchParams, setSearchParams] = useSearchParams()
  const [vehicles, setVehicles] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [viewFilter, setViewFilter] = useState('ATIVAS')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [endingRecord, setEndingRecord] = useState(null)
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
  const [editReturnDocumentFile, setEditReturnDocumentFile] = useState(null)
  const [editReturnDocumentError, setEditReturnDocumentError] = useState('')
  const [endReturnDocumentFile, setEndReturnDocumentFile] = useState(null)
  const [endReturnDocumentError, setEndReturnDocumentError] = useState('')
  const [editPhotoFiles, setEditPhotoFiles] = useState([])
  const [editPhotoError, setEditPhotoError] = useState('')
  const [photoRecord, setPhotoRecord] = useState(null)
  const [locationRecord, setLocationRecord] = useState(null)
  const [termRecord, setTermRecord] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const editDocumentInputRef = useRef(null)
  const editReturnDocumentInputRef = useRef(null)
  const endReturnDocumentInputRef = useRef(null)
  const editPhotoInputRef = useRef(null)
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

  const exportColumns = [
    { header: 'Veículo', value: (record) => record.vehicle_plate },
    { header: 'Secretaria', value: (record) => getRecordOrganizationName(record) },
    { header: 'Condutor', value: (record) => record.driver_name },
    { header: 'Documento', value: (record) => record.driver_document || '-' },
    { header: 'Contato', value: (record) => record.driver_contact || '-' },
    { header: 'Início', value: (record) => formatDate(record.start_date) },
    { header: 'Fim', value: (record) => formatDate(record.end_date) },
    { header: 'Status', value: (record) => (record.is_active ? 'ATIVA' : 'ENCERRADA') },
    { header: 'Km inicial', value: (record) => record.start_odometer_km ?? '-' },
    { header: 'Km final', value: (record) => record.end_odometer_km ?? '-' },
    { header: 'Km rodados', value: (record) => record.kilometers_driven ?? '-' },
    { header: 'Termo empréstimo', value: (record) => (record.loan_term_available ?? record.document_available) ? 'Anexado' : 'Pendente' },
    { header: 'Termo devolução', value: (record) => record.return_term_available ? 'Anexado' : record.is_active ? 'Aguardando devolução' : 'Pendente' },
    { header: 'Observação', value: (record) => record.observation || 'Sem observação' },
  ]

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

      return matchesSearch && matchesOrganization
    })
  }, [organizationFilter, records, search, vehicles])

  const focusedRecord = focusRecordId ? records.find((record) => record.id === focusRecordId) || null : null
  const filteredRecords = focusedRecord ? [focusedRecord] : baseFilteredRecords
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / 10))
  const paginatedRecords = focusedRecord ? filteredRecords : filteredRecords.slice((currentPage - 1) * 10, currentPage * 10)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, organizationFilter, vehicleFilter, viewFilter, focusRecordId, records.length])

  function buildFilterSummary() {
    return [
      { label: 'Status', value: viewOptions.find((option) => option.value === viewFilter)?.label || 'Todas' },
      ...(organizationFilter ? [{
        label: 'Secretaria',
        value: organizationFilter === unassignedOrganizationFilter
          ? 'Sem secretaria'
          : organizationFilterOptions.find((option) => option.value === organizationFilter)?.label || 'Selecionada',
      }] : []),
      ...(vehicleFilter ? [{ label: 'Veículo', value: vehicles.find((vehicle) => vehicle.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
      ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
    ]
  }

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

  function openEndModal(record) {
    setEndingRecord(record)
    setEndForm(buildEndState(record))
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
    setEditReturnDocumentFile(null)
    setEditReturnDocumentError('')
    setEditPhotoFiles([])
    setEditPhotoError('')
    if (editDocumentInputRef.current) {
      editDocumentInputRef.current.value = ''
    }
    if (editReturnDocumentInputRef.current) {
      editReturnDocumentInputRef.current.value = ''
    }
    if (editPhotoInputRef.current) {
      editPhotoInputRef.current.value = ''
    }
  }

  function closeEndModal() {
    setEndingRecord(null)
    setEndForm(buildEndState(null))
    setEndReturnDocumentFile(null)
    setEndReturnDocumentError('')
    if (endReturnDocumentInputRef.current) {
      endReturnDocumentInputRef.current.value = ''
    }
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
    setEditReturnDocumentFile(null)
    setEditReturnDocumentError('')
    setEditPhotoFiles([])
    setEditPhotoError('')
    if (editDocumentInputRef.current) {
      editDocumentInputRef.current.value = ''
    }
    if (editReturnDocumentInputRef.current) {
      editReturnDocumentInputRef.current.value = ''
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
      setEditDocumentError('Anexe PDF, imagem, DOC ou DOCX no termo de empréstimo.')
      if (editDocumentInputRef.current) {
        editDocumentInputRef.current.value = ''
      }
      return
    }

    if (nextFile.size > MAX_DOCUMENT_SIZE_BYTES) {
      setEditDocumentFile(null)
      setEditDocumentError('O documento precisa ter no maximo 12 MB.')
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

  function handleEditReturnDocumentChange(event) {
    const nextFile = event.target.files?.[0] || null
    if (!nextFile) {
      setEditReturnDocumentFile(null)
      setEditReturnDocumentError('')
      return
    }

    if (!ALLOWED_DOCUMENT_TYPES.includes(nextFile.type)) {
      setEditReturnDocumentFile(null)
      setEditReturnDocumentError('Anexe PDF, imagem, DOC ou DOCX no termo de devolução.')
      if (editReturnDocumentInputRef.current) {
        editReturnDocumentInputRef.current.value = ''
      }
      return
    }

    if (nextFile.size > MAX_DOCUMENT_SIZE_BYTES) {
      setEditReturnDocumentFile(null)
      setEditReturnDocumentError('O termo de devolução precisa ter no maximo 12 MB.')
      if (editReturnDocumentInputRef.current) {
        editReturnDocumentInputRef.current.value = ''
      }
      return
    }

    setEditReturnDocumentFile(nextFile)
    setEditReturnDocumentError('')
  }

  function clearEditReturnDocument() {
    setEditReturnDocumentFile(null)
    setEditReturnDocumentError('')
    if (editReturnDocumentInputRef.current) {
      editReturnDocumentInputRef.current.value = ''
    }
  }

  function handleEndReturnDocumentChange(event) {
    const nextFile = event.target.files?.[0] || null
    if (!nextFile) {
      setEndReturnDocumentFile(null)
      setEndReturnDocumentError('')
      return
    }

    if (!ALLOWED_DOCUMENT_TYPES.includes(nextFile.type)) {
      setEndReturnDocumentFile(null)
      setEndReturnDocumentError('Anexe PDF, imagem, DOC ou DOCX no termo de devolução.')
      if (endReturnDocumentInputRef.current) {
        endReturnDocumentInputRef.current.value = ''
      }
      return
    }

    if (nextFile.size > MAX_DOCUMENT_SIZE_BYTES) {
      setEndReturnDocumentFile(null)
      setEndReturnDocumentError('O termo de devolução precisa ter no maximo 12 MB.')
      if (endReturnDocumentInputRef.current) {
        endReturnDocumentInputRef.current.value = ''
      }
      return
    }

    setEndReturnDocumentFile(nextFile)
    setEndReturnDocumentError('')
  }

  function clearEndReturnDocument() {
    setEndReturnDocumentFile(null)
    setEndReturnDocumentError('')
    if (endReturnDocumentInputRef.current) {
      endReturnDocumentInputRef.current.value = ''
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
      setEditPhotoError('Cada foto adicional deve ter no maximo 8 MB.')
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
    if (!endingRecord) return
    if (!canEditPossession) {
      setError('Você não tem permissão para encerrar posses.')
      return
    }

    try {
      setEnding(true)
      setError('')
      const payload = new FormData()
      if (endForm.end_date) payload.append('end_date', new Date(endForm.end_date).toISOString())
      if (endForm.end_odometer_km !== '') payload.append('end_odometer_km', String(Number(endForm.end_odometer_km)))
      if (endForm.observation) payload.append('observation', endForm.observation)
      if (endReturnDocumentFile) payload.append('return_term_document', endReturnDocumentFile, endReturnDocumentFile.name)
      await possessionAPI.end(endingRecord.id, payload)
      setFeedback('Posse encerrada com sucesso.')
      closeEndModal()
      await loadPossessions()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível encerrar a posse.'))
    } finally {
      setEnding(false)
    }
  }

  async function handleEditPossession(event) {
    event.preventDefault()
    if (!editingRecord) return
    if (!canEditPossession) {
      setError('Você não tem permissão para editar posses.')
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
      if (editReturnDocumentFile) {
        payload.append('return_term_document', editReturnDocumentFile, editReturnDocumentFile.name)
      }
      editPhotoFiles.forEach((file) => {
        payload.append('new_photos', file, file.name)
      })

      await possessionAPI.update(editingRecord.id, payload)
      setFeedback('Registro de posse atualizado com justificativa e auditoria.')
      closeEditModal()
      await loadPossessions()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível atualizar a posse.'))
    } finally {
      setSavingEdit(false)
    }
  }

  async function handlePreviewPdf() {
    if (filteredRecords.length === 0) {
      setFeedback('Não há registros de posse filtrados para pré-visualizar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: 'Frota PMTF - Posses de veículos',
        fileName: 'frota-pmtf-posses',
        subtitle: 'Relatório das posses filtradas no painel operacional.',
        columns: exportColumns,
        rows: filteredRecords,
        filters: buildFilterSummary(),
      })
      setFeedback('Pré-visualização do PDF de posses aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível gerar o PDF dos condutores.'))
    }
  }

  async function handleExportXlsx() {
    if (filteredRecords.length === 0) {
      setFeedback('Não há registros de posse filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-posses',
        sheetName: 'Posses',
        columns: exportColumns,
        rows: filteredRecords,
        filters: buildFilterSummary(),
      })
      setFeedback('Exportação de posses em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível exportar os condutores em XLSX.'))
    }
  }

  async function handlePreviewTerm(record, termType) {
    try {
      setError('')
      await previewPossessionTermDocument(record, termType)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível gerar o PDF do termo.'))
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

  const activeCount = filteredRecords.filter((item) => item.is_active).length

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Posses de veículos</h2>
          <p className="section-copy">Controle quem está com cada veículo, anexe evidências e mantenha um histórico simples de transferências.</p>
        </div>
        <div className="actions-inline">
          {canCreatePossession ? (
            <button className="app-button" type="button" onClick={() => setIsCreateModalOpen(true)}>
              Nova posse
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Pré-visualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
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
              placeholder="Buscar por placa, secretaria, condutor ou contato"
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

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
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
                            Termo de empréstimo: {record.loan_term_name || record.document_name || 'Anexado'} | {formatTimestamp(record.loan_term_uploaded_at || record.document_uploaded_at)}
                          </span>
                        ) : (
                          <span className="muted">Sem termo de empréstimo anexado</span>
                        )}
                        {record.return_term_available ? (
                          <span className="muted">
                            Termo de devolução: {record.return_term_name || 'Anexado'} | {formatTimestamp(record.return_term_uploaded_at)}
                          </span>
                        ) : (
                          <span className="muted">{record.is_active ? 'Termo de devolução aguardando encerramento' : 'Sem termo de devolução anexado'}</span>
                        )}
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
                        {canEditPossession ? (
                          <button type="button" className="mini-button" onClick={() => openEditModal(record)}>
                            Editar
                          </button>
                        ) : null}
                        {record.is_active && canEditPossession ? (
                          <button type="button" className="mini-button" onClick={() => openEndModal(record)}>
                            Encerrar
                          </button>
                        ) : null}
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

      <Modal
        open={isCreateModalOpen}
        title="Nova posse"
        description="Ao registrar um novo condutor, qualquer posse ativa do mesmo veículo será encerrada automaticamente. Foto e localização são opcionais, você pode capturar várias fotos, e o termo de empréstimo pode ser anexado no mesmo fluxo."
        onClose={() => setIsCreateModalOpen(false)}
      >
        <PossessionForm
          vehicles={vehicles}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={async (message) => {
            setFeedback(message)
            await loadPossessions()
          }}
        />
      </Modal>

      <Modal
        open={Boolean(editingRecord)}
        title="Editar posse"
        description={editingRecord ? `Edição administrativa de ${editingRecord.driver_name} no veículo ${editingRecord.vehicle_plate}. A justificativa é obrigatória, entra na auditoria e também pode substituir termos e fotos complementares.` : ''}
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
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="edit-possession-reason">Justificativa da edição</label>
            <textarea
              id="edit-possession-reason"
              className="app-textarea"
              rows="3"
              placeholder="Explique por que este registro precisa ser corrigido."
              value={editForm.edit_reason}
              onChange={(event) => setEditForm({ ...editForm, edit_reason: event.target.value })}
            />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="edit-possession-document-file">Termo de empréstimo assinado</label>
            <div className="evidence-shell">
              <div className="evidence-copy">
                <strong>Anexe ou substitua o termo de empréstimo da posse, se necessário.</strong>
                <span>{(editingRecord?.loan_term_available ?? editingRecord?.document_available) ? `Termo atual: ${editingRecord.loan_term_name || editingRecord.document_name || 'Documento anexado'}.` : 'Ainda não há termo de empréstimo anexado neste registro.'}</span>
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
            <label htmlFor="edit-possession-return-document-file">Termo de devolução assinado</label>
            <div className="evidence-shell">
              <div className="evidence-copy">
                <strong>Anexe ou substitua o termo de devolução da posse, se necessário.</strong>
                <span>{editingRecord?.return_term_available ? `Termo atual: ${editingRecord.return_term_name || 'Documento anexado'}.` : 'Ainda não há termo de devolução anexado neste registro.'}</span>
              </div>
              <input
                ref={editReturnDocumentInputRef}
                id="edit-possession-return-document-file"
                type="file"
                className="app-input"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleEditReturnDocumentChange}
              />
              {editReturnDocumentError ? <div className="alert alert-error evidence-alert">{editReturnDocumentError}</div> : null}
              {editReturnDocumentFile ? (
                <div className="camera-stage-footer">
                  <div className="stack">
                    <strong>{editReturnDocumentFile.name}</strong>
                    <span className="muted">Tipo: {editReturnDocumentFile.type || 'Arquivo compativel'} | Tamanho: {formatFileSize(editReturnDocumentFile.size)}</span>
                  </div>
                  <button className="ghost-button" type="button" onClick={clearEditReturnDocument}>Remover anexo</button>
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
              {savingEdit ? 'Salvando...' : 'Salvar edição'}
            </button>
            <button className="ghost-button" type="button" onClick={closeEditModal}>Cancelar</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(endingRecord)}
        title="Encerrar posse"
        description={endingRecord ? `Finalize a posse ativa de ${endingRecord.driver_name} no veículo ${endingRecord.vehicle_plate}.` : ''}
        onClose={closeEndModal}
      >
        <form onSubmit={handleEndPossession} className="form-grid modal-form-grid">
          <div className="form-field">
            <label htmlFor="end-possession-date">Data de encerramento</label>
            <input
              id="end-possession-date"
              type="datetime-local"
              className="app-input"
              value={endForm.end_date}
              onChange={(event) => setEndForm({ ...endForm, end_date: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="end-possession-odometer">Odômetro final (km)</label>
            <input
              id="end-possession-odometer"
              type="number"
              min="0"
              step="0.1"
              className="app-input"
              value={endForm.end_odometer_km}
              onChange={(event) => setEndForm({ ...endForm, end_odometer_km: event.target.value })}
            />
          </div>

          <div className="form-field modal-field-span">
            <label htmlFor="end-possession-note">Observação</label>
            <textarea
              id="end-possession-note"
              className="app-textarea"
              rows="4"
              value={endForm.observation}
              onChange={(event) => setEndForm({ ...endForm, observation: event.target.value })}
            />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="end-possession-return-document">Termo de devolução assinado</label>
            <div className="evidence-shell">
              <div className="evidence-copy">
                <strong>Anexe o termo de devolução assinado no encerramento da posse.</strong>
                <span>O arquivo fica vinculado ao registro encerrado para consulta posterior.</span>
              </div>
              <input
                ref={endReturnDocumentInputRef}
                id="end-possession-return-document"
                type="file"
                className="app-input"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleEndReturnDocumentChange}
              />
              {endReturnDocumentError ? <div className="alert alert-error evidence-alert">{endReturnDocumentError}</div> : null}
              {endReturnDocumentFile ? (
                <div className="camera-stage-footer">
                  <div className="stack">
                    <strong>{endReturnDocumentFile.name}</strong>
                    <span className="muted">Tipo: {endReturnDocumentFile.type || 'Arquivo compativel'} | Tamanho: {formatFileSize(endReturnDocumentFile.size)}</span>
                  </div>
                  <button className="ghost-button" type="button" onClick={clearEndReturnDocument}>Remover anexo</button>
                </div>
              ) : (
                <span className="helper-text">Aceita PDF, imagem, DOC e DOCX. O anexo e opcional.</span>
              )}
            </div>
          </div>
          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={ending}>
              {ending ? 'Salvando...' : 'Encerrar posse'}
            </button>
            <button className="ghost-button" type="button" onClick={closeEndModal}>Cancelar</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(termRecord)}
        title="Termos da posse"
        description={termRecord ? `Documentos gerados e anexos assinados da posse de ${termRecord.driver_name} no veículo ${termRecord.vehicle_plate}.` : ''}
        onClose={closeTermModal}
      >
        {termRecord ? (
          <div className="evidence-gallery-grid">
            <article className="evidence-meta-card">
              <strong>Termo de empréstimo</strong>
              <div className="stack">
                <span className="muted">Código: {termRecord.loan_term_validation_code || '-'}</span>
                <span className="muted">
                  Anexo assinado: {(termRecord.loan_term_available ?? termRecord.document_available) ? (termRecord.loan_term_name || termRecord.document_name || 'Documento anexado') : 'Pendente'}
                </span>
              </div>
              <div className="actions-inline">
                <button type="button" className="app-button" onClick={() => handlePreviewTerm(termRecord, 'loan')}>
                  Gerar empréstimo
                </button>
                <button type="button" className="secondary-button" onClick={() => handleCopyTermLink(termRecord, 'loan')}>
                  Copiar link empréstimo
                </button>
                {(termRecord.loan_term_available ?? termRecord.document_available) ? (
                  <button type="button" className="ghost-button" onClick={() => openProtectedFile(termRecord.loan_term_url || termRecord.document_url)}>
                    Abrir anexo empréstimo
                  </button>
                ) : null}
              </div>
            </article>

            {!termRecord.is_active ? (
              <article className="evidence-meta-card">
                <strong>Termo de devolução</strong>
                <div className="stack">
                  <span className="muted">Código: {termRecord.return_term_validation_code || '-'}</span>
                  <span className="muted">
                    Anexo assinado: {termRecord.return_term_available ? (termRecord.return_term_name || 'Documento anexado') : 'Pendente'}
                  </span>
                </div>
                <div className="actions-inline">
                  <button type="button" className="app-button" onClick={() => handlePreviewTerm(termRecord, 'return')}>
                    Gerar devolução
                  </button>
                  <button type="button" className="secondary-button" onClick={() => handleCopyTermLink(termRecord, 'return')}>
                    Copiar link devolução
                  </button>
                  {termRecord.return_term_available ? (
                    <button type="button" className="ghost-button" onClick={() => openProtectedFile(termRecord.return_term_url)}>
                      Abrir anexo devolução
                    </button>
                  ) : null}
                </div>
              </article>
            ) : (
              <article className="evidence-meta-card">
                <strong>Termo de devolução</strong>
                <span className="muted">Disponível após o encerramento da posse.</span>
              </article>
            )}
          </div>
        ) : null}
      </Modal>

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
