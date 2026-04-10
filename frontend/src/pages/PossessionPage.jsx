import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Modal from '../components/Modal'
import DriverBadge from '../components/DriverBadge'
import PossessionForm from '../components/PossessionForm'
import SearchableSelect from '../components/SearchableSelect'
import api from '../api/client'
import { possessionAPI } from '../api/possession'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'

const viewOptions = [
  { value: 'ATIVAS', label: 'Ativas' },
  { value: 'TODAS', label: 'Todas' },
  { value: 'ENCERRADAS', label: 'Encerradas' },
]

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
    end_date: new Date().toISOString().slice(0, 16),
    observation: record?.observation || '',
  }
}

function buildVehicleOption(vehicle) {
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotacao'
  return {
    value: vehicle.id,
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: `${vehicle.ownership_type === 'LOCADO' ? 'Locado' : 'Proprio'} | ${locationLabel}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.chassis_number, locationLabel].filter(Boolean).join(' '),
  }
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
  const [photoRecord, setPhotoRecord] = useState(null)
  const [locationRecord, setLocationRecord] = useState(null)
  const focusRecordId = searchParams.get('focus')

  const exportColumns = [
    { header: 'Veiculo', value: (record) => record.vehicle_plate },
    { header: 'Condutor', value: (record) => record.driver_name },
    { header: 'Documento', value: (record) => record.driver_document || '-' },
    { header: 'Contato', value: (record) => record.driver_contact || '-' },
    { header: 'Inicio', value: (record) => formatDate(record.start_date) },
    { header: 'Fim', value: (record) => formatDate(record.end_date) },
    { header: 'Status', value: (record) => (record.is_active ? 'ATIVA' : 'ENCERRADA') },
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

  function closeEndModal() {
    setEndingRecord(null)
    setEndForm(buildEndState(null))
  }

  function closePhotoModal() {
    setPhotoRecord(null)
  }

  function closeLocationModal() {
    setLocationRecord(null)
  }

  async function handleEndPossession(event) {
    event.preventDefault()
    if (!endingRecord) return

    try {
      setEnding(true)
      setError('')
      await possessionAPI.end(endingRecord.id, {
        end_date: endForm.end_date ? new Date(endForm.end_date).toISOString() : null,
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

  async function handlePreviewPdf() {
    if (filteredRecords.length === 0) {
      setFeedback('Nao ha registros de posse filtrados para previsualizar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: 'Frota PMTF - Condutores e posse',
        fileName: 'frota-pmtf-condutores',
        subtitle: 'Relatorio dos condutores e posses filtrados no painel operacional.',
        columns: exportColumns,
        rows: filteredRecords,
        filters: [
          { label: 'Status', value: viewOptions.find((option) => option.value === viewFilter)?.label || 'Todas' },
          ...(vehicleFilter ? [{ label: 'Veiculo', value: vehicles.find((vehicle) => vehicle.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Pre-visualizacao do PDF de condutores aberta em nova guia.')
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
        fileName: 'frota-pmtf-condutores',
        sheetName: 'Condutores',
        columns: exportColumns,
        rows: filteredRecords,
        filters: [
          { label: 'Status', value: viewOptions.find((option) => option.value === viewFilter)?.label || 'Todas' },
          ...(vehicleFilter ? [{ label: 'Veiculo', value: vehicles.find((vehicle) => vehicle.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Exportacao de condutores em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar os condutores em XLSX.'))
    }
  }

  const activeCount = filteredRecords.filter((item) => item.is_active).length

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Condutores e posse</h2>
          <p className="section-copy">Controle quem esta com cada veiculo e mantenha um historico simples de transferencias.</p>
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
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="muted">Carregando posses...</td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">Nenhum registro de posse encontrado para os filtros atuais.</div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
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
                          <span className="muted">Foto registrada em {formatTimestamp(record.photo_captured_at)}</span>
                        ) : (
                          <span className="muted">Sem evidencia (legado)</span>
                        )}
                        {isAdmin ? <span className="muted">Criado em {formatDate(record.created_at)}</span> : null}
                      </div>
                    </td>
                    <td data-label="Status">
                      <span className={`status-badge ${record.is_active ? 'status-ATIVO' : 'status-INATIVO'}`}>
                        {record.is_active ? 'ATIVA' : 'ENCERRADA'}
                      </span>
                    </td>
                    <td data-label="Acoes">
                      <div className="actions-inline">
                        {record.photo_available ? (
                          <button type="button" className="mini-button" onClick={() => setPhotoRecord(record)}>
                            Ver foto
                          </button>
                        ) : (
                          <span className="muted">Legado</span>
                        )}
                        {isAdmin && record.capture_location ? (
                          <button type="button" className="mini-button" onClick={() => setLocationRecord(record)}>
                            Local
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

      <Modal
        open={isCreateModalOpen}
        title="Nova posse"
        description="Ao registrar um novo condutor, qualquer posse ativa do mesmo veiculo sera encerrada automaticamente. Foto e localizacao sao obrigatorias."
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
        title="Foto da posse"
        description={photoRecord ? `Evidencia registrada para ${photoRecord.driver_name} no veiculo ${photoRecord.vehicle_plate}.` : ''}
        onClose={closePhotoModal}
      >
        {photoRecord ? (
          <div className="evidence-modal-grid">
            <div className="evidence-image-card">
              <img src={photoRecord.photo_url} alt={`Foto da posse do veiculo ${photoRecord.vehicle_plate}`} className="evidence-image" />
            </div>
            <div className="evidence-meta-card">
              <strong>Detalhes da captura</strong>
              <div className="stack">
                <span><strong>Veiculo:</strong> {photoRecord.vehicle_plate}</span>
                <span><strong>Condutor:</strong> {photoRecord.driver_name}</span>
                <span><strong>Capturada em:</strong> {formatTimestamp(photoRecord.photo_captured_at)}</span>
                <span>
                  <strong>Evidencia:</strong> {photoRecord.photo_available ? 'Foto vinculada ao registro' : 'Sem evidencia'}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(locationRecord)}
        title="Local da captura"
        description={locationRecord ? `Georreferenciamento da foto registrada para ${locationRecord.vehicle_plate}.` : ''}
        onClose={closeLocationModal}
      >
        {locationRecord?.capture_location ? (
          <div className="evidence-modal-grid">
            <div className="map-frame-card">
              <iframe
                title={`Mapa da posse de ${locationRecord.vehicle_plate}`}
                src={buildMapEmbedUrl(locationRecord.capture_location)}
                className="map-frame"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="evidence-meta-card">
              <strong>Coordenadas da captura</strong>
              <div className="stack">
                <span><strong>Veiculo:</strong> {locationRecord.vehicle_plate}</span>
                <span><strong>Latitude/Longitude:</strong> {formatCoordinates(locationRecord.capture_location)}</span>
                <span><strong>Precisao:</strong> {Math.round(locationRecord.capture_location.accuracy_meters)} m</span>
                <span><strong>Capturada em:</strong> {formatTimestamp(locationRecord.photo_captured_at)}</span>
              </div>
              <a
                href={locationRecord.capture_location.maps_url}
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
