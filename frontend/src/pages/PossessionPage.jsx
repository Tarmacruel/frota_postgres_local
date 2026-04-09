import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import DriverBadge from '../components/DriverBadge'
import PossessionForm from '../components/PossessionForm'
import api from '../api/client'
import { possessionAPI } from '../api/possession'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToPdf, exportRowsToXlsx } from '../utils/exportData'

const viewOptions = [
  { value: 'ATIVAS', label: 'Ativas' },
  { value: 'TODAS', label: 'Todas' },
  { value: 'ENCERRADAS', label: 'Encerradas' },
]

function formatDate(value) {
  if (!value) return 'Atual'
  return new Date(value).toLocaleString('pt-BR')
}

function buildEndState(record) {
  return {
    end_date: new Date().toISOString().slice(0, 16),
    observation: record?.observation || '',
  }
}

export default function PossessionPage() {
  const { user } = useAuth()
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

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const term = search.trim().toLowerCase()
      if (!term) return true
      return [record.vehicle_plate, record.driver_name, record.driver_document, record.driver_contact, record.observation]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    })
  }, [records, search])

  function openEndModal(record) {
    setEndingRecord(record)
    setEndForm(buildEndState(record))
  }

  function closeEndModal() {
    setEndingRecord(null)
    setEndForm(buildEndState(null))
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

  async function handleExportPdf() {
    if (filteredRecords.length === 0) {
      setFeedback('Nao ha registros de posse filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToPdf({
        title: 'Frota PMTF - Condutores e posse',
        fileName: 'frota-pmtf-condutores',
        subtitle: 'Relatorio dos condutores e posses filtrados no painel operacional.',
        columns: exportColumns,
        rows: filteredRecords,
      })
      setFeedback('Exportacao de condutores em PDF iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar os condutores em PDF.'))
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
          {user?.role === 'ADMIN' ? (
            <button className="app-button" type="button" onClick={() => setIsCreateModalOpen(true)}>
              Nova posse
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={handleExportPdf}>Exportar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-row" style={{ marginBottom: 18 }}>
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
          <select className="app-select" value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value)}>
            <option value="">Todos os veiculos</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.plate}
              </option>
            ))}
          </select>
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
                {user?.role === 'ADMIN' ? <th>Acoes</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={user?.role === 'ADMIN' ? 7 : 6} className="muted">Carregando posses...</td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={user?.role === 'ADMIN' ? 7 : 6}>
                    <div className="empty-state">Nenhum registro de posse encontrado para os filtros atuais.</div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id}>
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
                    <td data-label="Observacao">{record.observation || 'Sem observacao'}</td>
                    <td data-label="Status">
                      <span className={`status-badge ${record.is_active ? 'status-ATIVO' : 'status-INATIVO'}`}>
                        {record.is_active ? 'ATIVA' : 'ENCERRADA'}
                      </span>
                    </td>
                    {user?.role === 'ADMIN' ? (
                      <td data-label="Acoes">
                        {record.is_active ? (
                          <button type="button" className="mini-button" onClick={() => openEndModal(record)}>
                            Encerrar
                          </button>
                        ) : (
                          <span className="muted">Historico</span>
                        )}
                      </td>
                    ) : null}
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
        description="Ao registrar um novo condutor, qualquer posse ativa do mesmo veiculo sera encerrada automaticamente."
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
    </div>
  )
}
