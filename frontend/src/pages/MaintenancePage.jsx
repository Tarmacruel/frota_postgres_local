import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import MaintenanceForm from '../components/MaintenanceForm'
import api from '../api/client'
import { maintenanceAPI } from '../api/maintenance'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToPdf, exportRowsToXlsx } from '../utils/exportData'

const statusOptions = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'CONCLUIDAS', label: 'Concluidas' },
]

function formatDate(value) {
  if (!value) return 'Em andamento'
  return new Date(value).toLocaleString('pt-BR')
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

export default function MaintenancePage() {
  const { user } = useAuth()
  const [vehicles, setVehicles] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('TODAS')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [startFilter, setStartFilter] = useState('')
  const [endFilter, setEndFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)

  const exportColumns = [
    { header: 'Veiculo', value: (record) => record.vehicle_plate },
    { header: 'Inicio', value: (record) => formatDate(record.start_date) },
    { header: 'Conclusao', value: (record) => formatDate(record.end_date) },
    { header: 'Servico', value: (record) => record.service_description },
    { header: 'Pecas', value: (record) => record.parts_replaced || 'Sem observacao' },
    { header: 'Custo', value: (record) => formatMoney(record.total_cost) },
    { header: 'Status', value: (record) => (record.end_date ? 'CONCLUIDA' : 'EM ANDAMENTO') },
    { header: 'Atualizado em', value: (record) => formatDate(record.updated_at) },
  ]

  async function loadVehicles() {
    const { data } = await api.get('/vehicles')
    setVehicles(data)
  }

  async function loadRecords() {
    try {
      setLoading(true)
      setError('')

      const params = {}
      if (vehicleFilter) params.vehicle_id = vehicleFilter
      if (startFilter) params.start = new Date(startFilter).toISOString()
      if (endFilter) params.end = new Date(endFilter).toISOString()

      const { data } = await maintenanceAPI.list(params)
      setRecords(data)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar as manutencoes.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function loadPage() {
      try {
        await loadVehicles()
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar a frota para o formulario.'))
      }
    }
    loadPage()
  }, [])

  useEffect(() => {
    loadRecords()
  }, [vehicleFilter, startFilter, endFilter])

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const term = search.trim().toLowerCase()
      const matchesSearch =
        !term ||
        [record.vehicle_plate, record.service_description, record.parts_replaced]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(term))

      const isOpen = !record.end_date
      const matchesStatus =
        statusFilter === 'TODAS' ||
        (statusFilter === 'EM_ANDAMENTO' && isOpen) ||
        (statusFilter === 'CONCLUIDAS' && !isOpen)

      return matchesSearch && matchesStatus
    })
  }, [records, search, statusFilter])

  async function handleDelete(id) {
    if (!window.confirm('Confirma a exclusao deste registro de manutencao?')) return

    try {
      setError('')
      setFeedback('')
      await maintenanceAPI.remove(id)
      setFeedback('Manutencao removida com sucesso.')
      await loadRecords()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel remover a manutencao.'))
    }
  }

  function closeModal() {
    setEditingRecord(null)
    setIsModalOpen(false)
  }

  async function handleExportPdf() {
    if (filteredRecords.length === 0) {
      setFeedback('Nao ha manutencoes filtradas para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToPdf({
        title: 'Frota PMTF - Manutencoes',
        fileName: 'frota-pmtf-manutencoes',
        subtitle: 'Relatorio das manutencoes filtradas no painel operacional.',
        columns: exportColumns,
        rows: filteredRecords,
      })
      setFeedback('Exportacao de manutencoes em PDF iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar as manutencoes em PDF.'))
    }
  }

  async function handleExportXlsx() {
    if (filteredRecords.length === 0) {
      setFeedback('Nao ha manutencoes filtradas para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-manutencoes',
        sheetName: 'Manutencoes',
        columns: exportColumns,
        rows: filteredRecords,
      })
      setFeedback('Exportacao de manutencoes em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar as manutencoes em XLSX.'))
    }
  }

  const openCount = filteredRecords.filter((item) => !item.end_date).length
  const closedCount = filteredRecords.length - openCount

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Manutencoes</h2>
          <p className="section-copy">Acompanhe revisoes concluidas e servicos ainda em aberto sem sair do painel principal.</p>
        </div>
        <div className="actions-inline">
          {user?.role === 'ADMIN' ? (
            <button className="app-button" type="button" onClick={() => setIsModalOpen(true)}>
              Nova manutencao
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={handleExportPdf}>Exportar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-row" style={{ marginBottom: 18 }}>
        <div className="status-pills">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`status-pill${statusFilter === option.value ? ' active' : ''}`}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="filter-inline">
          <input
            className="app-input"
            placeholder="Buscar por placa, servico ou pecas"
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
          <input type="datetime-local" className="app-input" value={startFilter} onChange={(event) => setStartFilter(event.target.value)} />
          <input type="datetime-local" className="app-input" value={endFilter} onChange={(event) => setEndFilter(event.target.value)} />
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{filteredRecords.length}</strong>
          <span>registros exibidos</span>
        </div>
        <div className="metric-inline">
          <strong>{openCount}</strong>
          <span>em andamento</span>
        </div>
        <div className="metric-inline">
          <strong>{closedCount}</strong>
          <span>concluidas</span>
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
                <th>Inicio</th>
                <th>Conclusao</th>
                <th>Servico</th>
                <th>Pecas</th>
                <th>Custo</th>
                <th>Status</th>
                {user?.role === 'ADMIN' ? <th>Acoes</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={user?.role === 'ADMIN' ? 8 : 7} className="muted">Carregando manutencoes...</td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={user?.role === 'ADMIN' ? 8 : 7}>
                    <div className="empty-state">Nenhum registro encontrado para os filtros atuais.</div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id}>
                    <td data-label="Veiculo"><strong>{record.vehicle_plate}</strong></td>
                    <td data-label="Inicio">{formatDate(record.start_date)}</td>
                    <td data-label="Conclusao">{formatDate(record.end_date)}</td>
                    <td data-label="Servico">
                      <div className="stack">
                        <strong>{record.service_description}</strong>
                        <span className="muted">Atualizado em {formatDate(record.updated_at)}</span>
                      </div>
                    </td>
                    <td data-label="Pecas">{record.parts_replaced || 'Sem observacao'}</td>
                    <td data-label="Custo">{formatMoney(record.total_cost)}</td>
                    <td data-label="Status">
                      <span className={`status-badge ${record.end_date ? 'status-ATIVO' : 'status-MANUTENCAO'}`}>
                        {record.end_date ? 'CONCLUIDA' : 'EM ANDAMENTO'}
                      </span>
                    </td>
                    {user?.role === 'ADMIN' ? (
                      <td data-label="Acoes">
                        <div className="actions-inline">
                          <button type="button" className="mini-button" onClick={() => { setEditingRecord(record); setIsModalOpen(true) }}>
                            Editar
                          </button>
                          <button type="button" className="mini-button danger" onClick={() => handleDelete(record.id)}>
                            Excluir
                          </button>
                        </div>
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
        open={isModalOpen}
        title={editingRecord ? 'Atualizar manutencao' : 'Nova manutencao'}
        description="Registre servicos, custo e conclusao para manter o historico mecanico confiavel."
        onClose={closeModal}
      >
        <MaintenanceForm
          vehicles={vehicles}
          initialData={editingRecord}
          onClose={closeModal}
          onSuccess={async (message) => {
            setFeedback(message)
            await loadRecords()
          }}
        />
      </Modal>
    </div>
  )
}
