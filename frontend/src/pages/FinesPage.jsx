import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import { finesAPI } from '../api/fines'
import { vehiclesAPI } from '../api/vehicles'
import { driversAPI } from '../api/drivers'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'

const statusOptions = ['TODOS', 'PENDENTE', 'PAGA', 'RECURSO']

const initialForm = {
  vehicle_id: '',
  driver_id: '',
  ticket_number: '',
  infraction_date: '',
  due_date: '',
  amount: '',
  description: '',
  location: '',
  status: 'PENDENTE',
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pt-BR')
}

export default function FinesPage() {
  const { canWrite } = useAuth()
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [records, setRecords] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [search, setSearch] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('TODOS')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const exportColumns = [
    { header: 'Veiculo', value: (item) => item.vehicle_plate },
    { header: 'Auto', value: (item) => item.ticket_number },
    { header: 'Condutor', value: (item) => item.driver_name || '-' },
    { header: 'Data infracao', value: (item) => formatDate(item.infraction_date) },
    { header: 'Vencimento', value: (item) => formatDate(item.due_date) },
    { header: 'Valor', value: (item) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.amount || 0)) },
    { header: 'Status', value: (item) => item.status },
  ]

  async function loadAux() {
    const [vehicleResponse, driverResponse] = await Promise.all([vehiclesAPI.list(), driversAPI.list({ page: 1, limit: 200, active: true })])
    setVehicles(vehicleResponse.data)
    setDrivers(driverResponse.data.data)
  }

  async function loadFines(page = pagination.page) {
    try {
      setLoading(true)
      setError('')
      const { data } = await finesAPI.list({ page, limit: 10, vehicle_id: vehicleFilter || undefined, status: statusFilter !== 'TODOS' ? statusFilter : undefined, search: search || undefined })
      setRecords(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar as multas.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAux().catch(() => {}) }, [])
  useEffect(() => { loadFines(1) }, [search, vehicleFilter, statusFilter])

  function openCreate() {
    setEditingRecord(null)
    setForm(initialForm)
    setIsModalOpen(true)
  }

  function openEdit(record) {
    setEditingRecord(record)
    setForm({
      vehicle_id: record.vehicle_id,
      driver_id: record.driver_id || '',
      ticket_number: record.ticket_number,
      infraction_date: record.infraction_date,
      due_date: record.due_date || '',
      amount: record.amount,
      description: record.description,
      location: record.location || '',
      status: record.status,
    })
    setIsModalOpen(true)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      const payload = { ...form, driver_id: form.driver_id || null, due_date: form.due_date || null, location: form.location || null, amount: Number(form.amount) }
      if (editingRecord) {
        await finesAPI.update(editingRecord.id, payload)
        setFeedback('Multa atualizada com sucesso.')
      } else {
        await finesAPI.create(payload)
        setFeedback('Multa cadastrada com sucesso.')
      }
      setIsModalOpen(false)
      setForm(initialForm)
      await loadFines(editingRecord ? pagination.page : 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar a multa.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePreviewPdf() {
    if (!records.length) return
    await previewRowsToPdf({
      title: 'Frota PMTF - Multas',
      fileName: 'frota-pmtf-multas',
      subtitle: 'Relatorio da pagina atual de multas cadastradas.',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: statusFilter },
        ...(vehicleFilter ? [{ label: 'Veiculo', value: vehicles.find((item) => item.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
        ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
      ],
    })
  }

  async function handleExportXlsx() {
    if (!records.length) return
    await exportRowsToXlsx({
      fileName: 'frota-pmtf-multas',
      sheetName: 'Multas',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: statusFilter },
        ...(vehicleFilter ? [{ label: 'Veiculo', value: vehicles.find((item) => item.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
      ],
    })
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Multas</h2>
          <p className="section-copy">Registre autos de infracao, acompanhe vencimentos e status de pagamento ou recurso.</p>
        </div>
        <div className="actions-inline">
          {canWrite ? <button className="app-button" onClick={openCreate}>Nova multa</button> : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Previsualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-row" style={{ marginBottom: 18 }}>
        <div className="filter-inline">
          <input className="app-input" placeholder="Buscar por auto, descricao ou local" value={search} onChange={(e) => setSearch(e.target.value)} />
          <SearchableSelect value={vehicleFilter} onChange={setVehicleFilter} options={[{ value: '', label: 'Todos os veiculos' }, ...vehicles.map((v) => ({ value: v.id, label: `${v.plate} - ${v.brand} ${v.model}` }))]} placeholder="Filtrar veiculo" searchPlaceholder="Buscar veiculo" />
          <select className="app-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead><tr><th>Veiculo</th><th>Auto</th><th>Condutor</th><th>Infracao</th><th>Vencimento</th><th>Valor</th><th>Status</th>{canWrite ? <th>Acoes</th> : null}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={canWrite ? 8 : 7}>Carregando multas...</td></tr> : records.length === 0 ? <tr><td colSpan={canWrite ? 8 : 7}><div className="empty-state">Nenhuma multa encontrada.</div></td></tr> : records.map((record) => (
                <tr key={record.id}>
                  <td><strong>{record.vehicle_plate}</strong></td>
                  <td>{record.ticket_number}</td>
                  <td>{record.driver_name || '-'}</td>
                  <td>{formatDate(record.infraction_date)}</td>
                  <td>{formatDate(record.due_date)}</td>
                  <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(record.amount || 0))}</td>
                  <td><span className="status-badge status-MANUTENCAO">{record.status}</span></td>
                  {canWrite ? <td><button className="mini-button" onClick={() => openEdit(record)}>Editar</button></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadFines} />

      <Modal open={isModalOpen} title={editingRecord ? 'Editar multa' : 'Nova multa'} onClose={() => setIsModalOpen(false)}>
        <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
          <div className="form-field"><label>Veiculo</label><select className="app-select" value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} required><option value="">Selecione</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} - {v.brand} {v.model}</option>)}</select></div>
          <div className="form-field"><label>Condutor</label><select className="app-select" value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}><option value="">Nao informado</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.nome_completo}</option>)}</select></div>
          <div className="form-field"><label>Numero do auto</label><input className="app-input" value={form.ticket_number} onChange={(e) => setForm({ ...form, ticket_number: e.target.value })} required /></div>
          <div className="form-field"><label>Data infracao</label><input type="date" className="app-input" value={form.infraction_date} onChange={(e) => setForm({ ...form, infraction_date: e.target.value })} required /></div>
          <div className="form-field"><label>Vencimento</label><input type="date" className="app-input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <div className="form-field"><label>Valor</label><input type="number" min="0" step="0.01" className="app-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
          <div className="form-field" style={{ gridColumn: '1 / -1' }}><label>Descricao</label><textarea className="app-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></div>
          <div className="form-field"><label>Local</label><input className="app-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="form-field"><label>Status</label><select className="app-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statusOptions.filter((o) => o !== 'TODOS').map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
          <div className="actions-inline modal-actions" style={{ gridColumn: '1 / -1' }}>
            <button className="app-button" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar multa'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
