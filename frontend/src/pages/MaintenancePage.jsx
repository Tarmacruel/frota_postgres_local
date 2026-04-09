import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import MaintenanceForm from '../components/MaintenanceForm'
import api from '../api/client'
import { maintenanceAPI } from '../api/maintenance'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'

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

  const openCount = filteredRecords.filter((item) => !item.end_date).length
  const closedCount = filteredRecords.length - openCount

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Manutencoes</h2>
          <p className="section-copy">Acompanhe revisoes concluidas e servicos ainda em aberto sem sair do painel principal.</p>
        </div>
        {user?.role === 'ADMIN' ? (
          <button className="app-button" type="button" onClick={() => setIsModalOpen(true)}>
            Nova manutencao
          </button>
        ) : null}
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
            style={{ minWidth: 280 }}
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
                    <td><strong>{record.vehicle_plate}</strong></td>
                    <td>{formatDate(record.start_date)}</td>
                    <td>{formatDate(record.end_date)}</td>
                    <td>
                      <div className="stack">
                        <strong>{record.service_description}</strong>
                        <span className="muted">Atualizado em {formatDate(record.updated_at)}</span>
                      </div>
                    </td>
                    <td>{record.parts_replaced || 'Sem observacao'}</td>
                    <td>{formatMoney(record.total_cost)}</td>
                    <td>
                      <span className={`status-badge ${record.end_date ? 'status-ATIVO' : 'status-MANUTENCAO'}`}>
                        {record.end_date ? 'CONCLUIDA' : 'EM ANDAMENTO'}
                      </span>
                    </td>
                    {user?.role === 'ADMIN' ? (
                      <td>
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
