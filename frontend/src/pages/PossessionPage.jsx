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
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import { toDateTimeLocalValue } from '../utils/datetime'

const viewOptions = [
  { value: 'ATIVAS', label: 'Ativas' },
  { value: 'TODAS', label: 'Todas' },
  { value: 'ENCERRADAS', label: 'Encerradas' },
]

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
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotacao'
  const ownershipLabel = vehicle.ownership_type === 'LOCADO' ? 'Locado' : vehicle.ownership_type === 'CEDIDO' ? 'Cedido' : 'Proprio'
  return {
    value: vehicle.id,
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: `${ownershipLabel} | ${locationLabel}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.chassis_number, locationLabel].filter(Boolean).join(' '),
  }
}

function normalizeUploadList(fileList) {
  return Array.from(fileList || [])
}

export default function PossessionPage() {
  const { canWrite, isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [vehicles, setVehicles] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
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
  const [editPhotoFiles, setEditPhotoFiles] = useState([])
  const [editPhotoError, setEditPhotoError] = useState('')
  const [photoRecord, setPhotoRecord] = useState(null)
  const [locationRecord, setLocationRecord] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const editDocumentInputRef = useRef(null)
  const editPhotoInputRef = useRef(null)
  const focusRecordId = searchParams.get('focus')

  const exportColumns = [
    { header: 'Veiculo', value: (record) => record.vehicle_plate },
    { header: 'Condutor', value: (record) => record.driver_name },
    { header: 'Documento', value: (record) => record.driver_document || '-' },
    { header: 'Contato', value: (record) => record.driver_contact || '-' },
    { header: 'Inicio', value: (record) => formatDate(record.start_date) },
    { header: 'Fim', value: (record) => formatDate(record.end_date) },
    { header: 'Status', value: (record) => (record.is_active ? 'ATIVA' : 'ENCERRADA') },
    { header: 'Km inicial', value: (record) => record.start_odometer_km ?? '-' },
    { header: 'Km final', value: (record) => record.end_odometer_km ?? '-' },
    { header: 'Km rodados', value: (record) => record.kilometers_driven ?? '-' },
    { header: 'Observacao', value: (record) => record.observation || 'Sem observacao' },
  ]

  async function loadVehicles() {
    const { data } = await api.get('/vehicles')
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
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar as posses.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function loadPage() {
      try {
        await loadVehicles()
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar os veiculos.'))
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
      if (!term) return true
      return [record.vehicle_plate, record.driver_name, record.driver_document, record.driver_contact, record.observation]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    })
  }, [records, search])

  const focusedRecord = focusRecordId ? records.find((record) => record.id === focusRecordId) || null : null
  const filteredRecords = focusedRecord ? [focusedRecord] : baseFilteredRecords
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / 10))
  const paginatedRecords = focusedRecord ? filteredRecords : filteredRecords.slice((currentPage - 1) * 10, currentPage * 10)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, vehicleFilter, viewFilter, focusRecordId, records.length])

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

  function handleEditDocumentChange(event) {
    const nextFile = event.target.files?.[0] || null
    if (!nextFile) {
      setEditDocumentFile(null)
      setEditDocumentError('')
      return
    }

    if (!ALLOWED_DOCUMENT_TYPES.includes(nextFile.type)) {
      setEditDocumentFile(null)
      setEditDocumentError('Anexe PDF, imagem, DOC ou DOCX no documento da posse.')
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

    try {
      setEnding(true)
      setError('')
      await possessionAPI.end(endingRecord.id, {
        end_date: endForm.end_date ? new Date(endForm.end_date).toISOString() : null,
        end_odometer_km: endForm.end_odometer_km === '' ? null : Number(endForm.end_odometer_km),
        observation: endForm.observation || null,
      })
      setFeedback('Posse encerrada com sucesso.')
      closeEndModal()
      await loadPossessions()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel encerrar a posse.'))
    } finally {
      setEnding(false)
    }
  }

  async function handleEditPossession(event) {
    event.preventDefault()
    if (!editingRecord) return

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
        payload.append('signed_document', editDocumentFile, editDocumentFile.name)
      }
      editPhotoFiles.forEach((file) => {
        payload.append('new_photos', file, file.name)
      })

      await possessionAPI.update(editingRecord.id, payload)
      setFeedback('Registro de posse atualizado com justificativa e auditoria.')
      closeEditModal()
      await loadPossessions()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel atualizar a posse.'))
    } finally {
      setSavingEdit(false)
    }
  }

  async function handlePreviewPdf() {
    if (filteredRecords.length === 0) {
      setFeedback('Nao ha registros de posse filtrados para previsualizar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: 'Frota PMTF - Posses de veiculos',
        fileName: 'frota-pmtf-posses',
        subtitle: 'Relatorio das posses filtradas no painel operacional.',
        columns: exportColumns,
        rows: filteredRecords,
        filters: [
          { label: 'Status', value: viewOptions.find((option) => option.value === viewFilter)?.label || 'Todas' },
          ...(vehicleFilter ? [{ label: 'Veiculo', value: vehicles.find((vehicle) => vehicle.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Pre-visualizacao do PDF de posses aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel gerar o PDF dos condutores.'))
    }
  }

  async function handleExportXlsx() {
    if (filteredRecords.length === 0) {
      setFeedback('Nao ha registros de posse filtrados para exportar.')
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
        filters: [
          { label: 'Status', value: viewOptions.find((option) => option.value === viewFilter)?.label || 'Todas' },
          ...(vehicleFilter ? [{ label: 'Veiculo', value: vehicles.find((vehicle) => vehicle.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Exportacao de posses em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar os condutores em XLSX.'))
    }
  }

  const activeCount = filteredRecords.filter((item) => item.is_active).length

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Posses de veiculos</h2>
          <p className="section-copy">Controle quem esta com cada veiculo, anexe evidencias e mantenha um historico simples de transferencias.</p>
        </div>
        <div className="actions-inline">
          {canWrite ? (
            <button className="app-button" type="button" onClick={() => setIsCreateModalOpen(true)}>
              Nova posse
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Previsualizar PDF</button>
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
              placeholder="Buscar por placa, condutor ou contato"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <SearchableSelect
              value={vehicleFilter}
              onChange={setVehicleFilter}
              options={[{ value: '', label: 'Todos os veiculos' }, ...vehicles.map(buildVehicleOption)]}
              placeholder="Filtrar veiculo"
              searchPlaceholder="Buscar veiculo por placa, modelo, chassi ou lotacao"
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
                <th>Veiculo</th>
                <th>Condutor</th>
                <th>Inicio</th>
                <th>Fim</th>
                <th>Observacao</th>
                <th>Status</th>
                <th>Km inicial</th>
                <th>Km final</th>
                <th>Km rodados</th>
                <th>Acoes</th>
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
                    <td data-label="Veiculo"><strong>{record.vehicle_plate}</strong></td>
                    <td data-label="Condutor">
                      <DriverBadge
                        name={record.driver_name}
                        document={record.driver_document}
                        contact={record.driver_contact}
                      />
                    </td>
                    <td data-label="Inicio">{formatDate(record.start_date)}</td>
                    <td data-label="Fim">{formatDate(record.end_date)}</td>
                    <td data-label="Observacao">
                      <div className="stack">
                        <span>{record.observation || 'Sem observacao'}</span>
                        {record.photo_available ? (
                          <span className="muted">
                            {record.photo_count} foto(s) vinculada(s){record.photo_captured_at ? ` | primeira em ${formatTimestamp(record.photo_captured_at)}` : ''}
                          </span>
                        ) : (
                          <span className="muted">Sem evidencia (legado)</span>
                        )}
                        {record.document_available ? (
                          <span className="muted">
                            Documento anexado: {record.document_name || 'Documento assinado'} | {formatTimestamp(record.document_uploaded_at)}
                          </span>
                        ) : (
                          <span className="muted">Sem documento anexado</span>
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
                    <td data-label="Acoes">
                      <div className="actions-inline">
                        {record.photo_available ? (
                          <button type="button" className="mini-button" onClick={() => setPhotoRecord(record)}>
                            Ver fotos
                          </button>
                        ) : (
                          <span className="muted">Legado</span>
                        )}
                        {record.document_available ? (
                          <button type="button" className="mini-button" onClick={() => openProtectedFile(record.document_url)}>
                            Documento
                          </button>
                        ) : null}
                        {isAdmin ? (
                          <button type="button" className="mini-button" onClick={() => openEditModal(record)}>
                            Editar
                          </button>
                        ) : null}
                        {record.is_active ? (
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
        description="Ao registrar um novo condutor, qualquer posse ativa do mesmo veiculo sera encerrada automaticamente. Foto e localizacao sao obrigatorias, voce pode capturar varias fotos, e o termo assinado pode ser anexado no mesmo fluxo."
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
        description={editingRecord ? `Edicao administrativa de ${editingRecord.driver_name} no veiculo ${editingRecord.vehicle_plate}. A justificativa e obrigatoria, entra na auditoria e agora tambem pode incluir documento e fotos complementares.` : ''}
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
            <label htmlFor="edit-possession-start">Inicio</label>
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
            <label htmlFor="edit-possession-start-odometer">Odometro inicial (km)</label>
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
            <label htmlFor="edit-possession-end-odometer">Odometro final (km)</label>
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
            <label htmlFor="edit-possession-observation">Observacao</label>
            <textarea
              id="edit-possession-observation"
              className="app-textarea"
              rows="4"
              value={editForm.observation}
              onChange={(event) => setEditForm({ ...editForm, observation: event.target.value })}
            />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="edit-possession-reason">Justificativa da edicao</label>
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
            <label htmlFor="edit-possession-document-file">Documento assinado</label>
            <div className="evidence-shell">
              <div className="evidence-copy">
                <strong>Anexe ou substitua o documento da posse, se necessario.</strong>
                <span>{editingRecord?.document_available ? `Documento atual: ${editingRecord.document_name || 'Documento anexado'}.` : 'Ainda nao ha documento anexado neste registro.'}</span>
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
                <strong>Inclua fotos complementares do veiculo quando a correcao exigir mais evidencias.</strong>
                <span>{editingRecord?.photo_available ? `${editingRecord.photo_count} foto(s) ja vinculada(s) a esta posse.` : 'Nenhuma foto vinculada ainda a este registro.'}</span>
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
              {savingEdit ? 'Salvando...' : 'Salvar edicao'}
            </button>
            <button className="ghost-button" type="button" onClick={closeEditModal}>Cancelar</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(endingRecord)}
        title="Encerrar posse"
        description={endingRecord ? `Finalize a posse ativa de ${endingRecord.driver_name} no veiculo ${endingRecord.vehicle_plate}.` : ''}
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
            <label htmlFor="end-possession-odometer">Odometro final (km)</label>
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
            <label htmlFor="end-possession-note">Observacao</label>
            <textarea
              id="end-possession-note"
              className="app-textarea"
              rows="4"
              value={endForm.observation}
              onChange={(event) => setEndForm({ ...endForm, observation: event.target.value })}
            />
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
        open={Boolean(photoRecord)}
        title="Fotos da posse"
        description={photoRecord ? `Evidencias registradas para ${photoRecord.driver_name} no veiculo ${photoRecord.vehicle_plate}.` : ''}
        onClose={closePhotoModal}
      >
        {photoRecord ? (
          <div className="evidence-gallery-grid">
            {(photoRecord.photos || []).map((photo, index) => (
              <article key={photo.id || `legacy-${index}`} className="evidence-thumb-card evidence-thumb-card-large">
                <img src={photo.url} alt={`Foto ${index + 1} da posse do veiculo ${photoRecord.vehicle_plate}`} className="evidence-thumb-image" />
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
                <span><strong>Veiculo:</strong> {locationRecord.record.vehicle_plate}</span>
                <span><strong>Latitude/Longitude:</strong> {formatCoordinates(locationRecord.photo.capture_location)}</span>
                <span><strong>Precisao:</strong> {Math.round(locationRecord.photo.capture_location.accuracy_meters)} m</span>
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
