import { useEffect, useState } from 'react'
import ClaimForm from '../components/ClaimForm'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import { claimsAPI } from '../api/claims'
import { vehiclesAPI } from '../api/vehicles'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'

const typeOptions = ['TODOS', 'COLISAO', 'ROUBO', 'FURTO', 'AVARIA', 'OUTRO']
const statusOptions = ['TODOS', 'ABERTO', 'EM_ANALISE', 'ENCERRADO']

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '-'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
}

function vehicleOption(vehicle) {
  const location = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotacao'
  return {
    value: vehicle.id,
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: `${vehicle.ownership_type} | ${location}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, location].join(' '),
  }
}

export default function ClaimsPage() {
  const { isAdmin } = useAuth()
  const [vehicles, setVehicles] = useState([])
  const [records, setRecords] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 10 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('TODOS')
  const [typeFilter, setTypeFilter] = useState('TODOS')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)

  const exportColumns = [
    { header: 'Veiculo', value: (item) => item.vehicle_plate },
    { header: 'Condutor', value: (item) => item.driver_name || '-' },
    { header: 'Data', value: (item) => formatDate(item.data_ocorrencia) },
    { header: 'Tipo', value: (item) => item.tipo },
    { header: 'Status', value: (item) => item.status },
    { header: 'Local', value: (item) => item.local },
    { header: 'Valor estimado', value: (item) => formatMoney(item.valor_estimado) },
  ]

  async function loadVehicles() {
    const { data } = await vehiclesAPI.list()
    setVehicles(data)
  }

  async function loadClaims(page = pagination.page) {
    try {
      setLoading(true)
      setError('')
      const { data } = await claimsAPI.list({
        page,
        limit: 10,
        vehicle_id: vehicleFilter || undefined,
        status: statusFilter !== 'TODOS' ? statusFilter : undefined,
        tipo: typeFilter !== 'TODOS' ? typeFilter : undefined,
        search: search || undefined,
      })
      setRecords(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os sinistros.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVehicles().catch(() => {})
  }, [])

  useEffect(() => {
    loadClaims(1)
  }, [vehicleFilter, statusFilter, typeFilter, search])

  async function handlePreviewPdf() {
    if (!records.length) return
    await previewRowsToPdf({
      title: 'Frota PMTF - Sinistros',
      fileName: 'frota-pmtf-sinistros',
      subtitle: 'Relatorio da pagina atual de sinistros.',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: statusFilter },
        { label: 'Tipo', value: typeFilter },
        ...(vehicleFilter ? [{ label: 'Veiculo', value: vehicles.find((item) => item.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
        ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
      ],
    })
  }

  async function handleExportXlsx() {
    if (!records.length) return
    await exportRowsToXlsx({
      fileName: 'frota-pmtf-sinistros',
      sheetName: 'Sinistros',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: statusFilter },
        { label: 'Tipo', value: typeFilter },
        ...(vehicleFilter ? [{ label: 'Veiculo', value: vehicles.find((item) => item.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
      ],
    })
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Sinistros</h2>
          <p className="section-copy">Registre ocorrencias, acompanhe o status e mantenha o historico de prejuizos e analises da frota.</p>
        </div>
        <div className="actions-inline">
          {isAdmin ? <button className="app-button" type="button" onClick={() => { setEditingRecord(null); setIsModalOpen(true) }}>Novo sinistro</button> : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Previsualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-card">
        <div className="toolbar-row">
          <div className="filter-inline">
            <input className="app-input" placeholder="Buscar por descricao, local ou BO" value={search} onChange={(event) => setSearch(event.target.value)} />
            <SearchableSelect
              value={vehicleFilter}
              onChange={setVehicleFilter}
              options={[{ value: '', label: 'Todos os veiculos' }, ...vehicles.map(vehicleOption)]}
              placeholder="Filtrar veiculo"
              searchPlaceholder="Buscar veiculo"
            />
            <select className="app-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select className="app-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              {typeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{pagination.total}</strong>
          <span>sinistros no filtro</span>
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
                <th>Data</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Local</th>
                <th>Valor</th>
                {isAdmin ? <th>Acoes</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isAdmin ? 8 : 7} className="muted">Carregando sinistros...</td></tr>
              ) : !records.length ? (
                <tr><td colSpan={isAdmin ? 8 : 7}><div className="empty-state">Nenhum sinistro encontrado para os filtros aplicados.</div></td></tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id}>
                    <td data-label="Veiculo"><strong>{record.vehicle_plate}</strong></td>
                    <td data-label="Condutor">{record.driver_name || '-'}</td>
                    <td data-label="Data">{formatDate(record.data_ocorrencia)}</td>
                    <td data-label="Tipo">{record.tipo}</td>
                    <td data-label="Status"><span className={`status-badge status-${record.status === 'ENCERRADO' ? 'ATIVO' : 'MANUTENCAO'}`}>{record.status}</span></td>
                    <td data-label="Local">{record.local}</td>
                    <td data-label="Valor">{formatMoney(record.valor_estimado)}</td>
                    {isAdmin ? (
                      <td data-label="Acoes">
                        <button type="button" className="mini-button" onClick={() => { setEditingRecord(record); setIsModalOpen(true) }}>Editar</button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadClaims} />

      <Modal
        open={isModalOpen}
        title={editingRecord ? 'Editar sinistro' : 'Novo sinistro'}
        description="Relacione o veiculo, o condutor quando conhecido e os dados operacionais da ocorrencia."
        onClose={() => setIsModalOpen(false)}
      >
        <ClaimForm
          vehicles={vehicles}
          initialData={editingRecord}
          onClose={() => setIsModalOpen(false)}
          onSuccess={async (message) => {
            setFeedback(message)
            await loadClaims(editingRecord ? pagination.page : 1)
          }}
        />
      </Modal>
    </div>
  )
}
