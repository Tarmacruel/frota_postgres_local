import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DriverBadge from '../components/DriverBadge'
import Modal from '../components/Modal'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToPdf, exportRowsToXlsx } from '../utils/exportData'

const initialForm = {
  plate: '',
  brand: '',
  model: '',
  status: 'ATIVO',
  department: '',
}

const statusOptions = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'ATIVO', label: 'Ativos' },
  { value: 'MANUTENCAO', label: 'Manutencao' },
  { value: 'INATIVO', label: 'Inativos' },
]

export default function VehiclesPage() {
  const { canWrite, canDelete, isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [vehicles, setVehicles] = useState([])
  const [form, setForm] = useState(initialForm)
  const [selectedHistory, setSelectedHistory] = useState([])
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('TODOS')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const statusFilter = searchParams.get('status') || 'TODOS'
  const departmentOptions = ['TODOS', ...Array.from(new Set(vehicles.map((vehicle) => vehicle.current_department).filter(Boolean))).sort()]

  const baseFilteredVehicles = vehicles.filter((vehicle) => {
    const term = search.trim().toLowerCase()
    const matchesSearch =
      !term ||
      [vehicle.plate, vehicle.brand, vehicle.model, vehicle.current_department, vehicle.current_driver_name]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))

    const matchesDepartment =
      departmentFilter === 'TODOS' || (vehicle.current_department || '').toLowerCase() === departmentFilter.toLowerCase()

    return matchesSearch && matchesDepartment
  })

  const filteredVehicles = selectedVehicle
    ? vehicles.filter((vehicle) => vehicle.id === selectedVehicle.id)
    : baseFilteredVehicles

  const exportColumns = [
    { header: 'Placa', value: (vehicle) => vehicle.plate },
    { header: 'Marca', value: (vehicle) => vehicle.brand },
    { header: 'Modelo', value: (vehicle) => vehicle.model },
    { header: 'Status', value: (vehicle) => vehicle.status },
    { header: 'Lotacao atual', value: (vehicle) => vehicle.current_department || 'Sem lotacao' },
    { header: 'Condutor atual', value: (vehicle) => vehicle.current_driver_name || 'Sem condutor ativo' },
    { header: 'Atualizado em', value: (vehicle) => formatDate(vehicle.updated_at) },
  ]

  async function loadVehicles() {
    try {
      setLoading(true)
      setError('')
      const params = statusFilter !== 'TODOS' ? { status: statusFilter } : undefined
      const { data } = await api.get('/vehicles', { params })
      setVehicles(data)
      if (selectedVehicle?.id) {
        const updatedSelection = data.find((vehicle) => vehicle.id === selectedVehicle.id) || null
        setSelectedVehicle(updatedSelection)
        if (!updatedSelection) {
          setSelectedHistory([])
        }
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os veiculos.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVehicles()
  }, [statusFilter])

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      setFeedback('')
      if (editingId) {
        await api.put(`/vehicles/${editingId}`, form)
        setFeedback('Veiculo atualizado com sucesso.')
      } else {
        await api.post('/vehicles', form)
        setFeedback('Veiculo cadastrado com sucesso.')
      }
      closeVehicleModal()
      await loadVehicles()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o veiculo.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Confirma a exclusao?')) return

    try {
      setError('')
      setFeedback('')
      await api.delete(`/vehicles/${id}`)
      if (editingId === id) closeVehicleModal()
      if (selectedVehicle?.id === id) {
        setSelectedVehicle(null)
        setSelectedHistory([])
      }
      setFeedback('Veiculo removido com sucesso.')
      await loadVehicles()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel excluir o veiculo.'))
    }
  }

  async function loadHistory(id) {
    if (selectedVehicle?.id === id) {
      clearHistoryFocus()
      return
    }

    try {
      setError('')
      const { data } = await api.get(`/vehicles/${id}/historico`)
      const vehicle = vehicles.find((item) => item.id === id) || null
      setSelectedVehicle(vehicle)
      setSelectedHistory(data)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar o historico.'))
    }
  }

  function openNewVehicleModal() {
    setEditingId(null)
    setForm(initialForm)
    setIsModalOpen(true)
  }

  function editVehicle(vehicle) {
    setEditingId(vehicle.id)
    setFeedback('')
    setError('')
    setForm({
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      status: vehicle.status,
      department: vehicle.current_department || '',
    })
    setIsModalOpen(true)
  }

  function closeVehicleModal() {
    setEditingId(null)
    setForm(initialForm)
    setIsModalOpen(false)
  }

  function handleStatusChange(nextStatus) {
    if (nextStatus === 'TODOS') {
      setSearchParams({})
      return
    }
    setSearchParams({ status: nextStatus })
  }

  function clearFilters() {
    setSearch('')
    setDepartmentFilter('TODOS')
    setSearchParams({})
  }

  function clearHistoryFocus() {
    setSelectedVehicle(null)
    setSelectedHistory([])
  }

  function formatDate(value) {
    if (!value) return 'Atual'
    return new Date(value).toLocaleString('pt-BR')
  }

  async function handleExportPdf() {
    if (filteredVehicles.length === 0) {
      setFeedback('Nao ha veiculos filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToPdf({
        title: 'Frota PMTF - Veiculos',
        fileName: 'frota-pmtf-veiculos',
        subtitle: 'Relatorio dos veiculos filtrados no painel operacional.',
        columns: exportColumns,
        rows: filteredVehicles,
      })
      setFeedback('Exportacao em PDF iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar os veiculos em PDF.'))
    }
  }

  async function handleExportXlsx() {
    if (filteredVehicles.length === 0) {
      setFeedback('Nao ha veiculos filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-veiculos',
        sheetName: 'Veiculos',
        columns: exportColumns,
        rows: filteredVehicles,
      })
      setFeedback('Exportacao em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar os veiculos em XLSX.'))
    }
  }

  async function handleExportHistoryPdf() {
    if (!selectedVehicle || selectedHistory.length === 0) {
      setFeedback('Selecione um veiculo com historico carregado para exportar o PDF.')
      return
    }

    const historyColumns = [
      { header: 'Veiculo', value: () => selectedVehicle.plate },
      { header: 'Departamento', value: (item) => item.department || 'Sem departamento informado' },
      { header: 'Inicio', value: (item) => formatDate(item.start_date) },
      { header: 'Fim', value: (item) => item.end_date ? formatDate(item.end_date) : 'Atual' },
    ]

    try {
      setError('')
      setFeedback('')
      await exportRowsToPdf({
        title: `Frota PMTF - Historico ${selectedVehicle.plate}`,
        fileName: `frota-pmtf-historico-${selectedVehicle.plate.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        subtitle: `Historico de lotacao do veiculo ${selectedVehicle.plate} | ${selectedVehicle.brand} ${selectedVehicle.model} | Condutor atual: ${selectedVehicle.current_driver_name || 'Sem condutor ativo'}.`,
        columns: historyColumns,
        rows: selectedHistory,
      })
      setFeedback(`Historico de ${selectedVehicle.plate} exportado em PDF com sucesso.`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar o historico do veiculo em PDF.'))
    }
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Operacao de veiculos</h2>
          <p className="section-copy">Tabela principal ampliada para consulta, filtros rapidos e cadastro via modal sem comprimir a visualizacao.</p>
        </div>
        <div className="actions-inline">
          {canWrite ? <button className="app-button" type="button" onClick={openNewVehicleModal}>Novo veiculo</button> : null}
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
              onClick={() => handleStatusChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="filter-inline">
          <input
            className="app-input"
            placeholder="Buscar por placa, marca, modelo, departamento ou condutor"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="app-select" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
            {departmentOptions.map((option) => (
              <option key={option} value={option}>{option === 'TODOS' ? 'Todos os departamentos' : option}</option>
            ))}
          </select>
          <button className="ghost-button" type="button" onClick={clearFilters}>Limpar filtros</button>
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{filteredVehicles.length}</strong>
          <span>veiculos exibidos</span>
        </div>
        <div className="metric-inline">
          <strong>{vehicles.length}</strong>
          <span>registros na consulta atual</span>
        </div>
      </div>

      {selectedVehicle ? (
        <div className="table-focus-banner">
          <div>
            <strong>Mostrando apenas {selectedVehicle.plate}</strong>
            <span>Clique em Historico novamente no mesmo veiculo para voltar para a lista completa.</span>
          </div>
          <button className="ghost-button" type="button" onClick={clearHistoryFocus}>Reexibir todos</button>
        </div>
      ) : null}

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Status</th>
                <th>Lotacao atual</th>
                <th>Condutor atual</th>
                <th>Atualizado em</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="muted">Carregando veiculos...</td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className="empty-state">
                      Nenhum veiculo encontrado para os filtros aplicados. Ajuste a busca ou troque o status para revisar a base completa.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td data-label="Placa"><strong>{vehicle.plate}</strong></td>
                    <td data-label="Marca">{vehicle.brand}</td>
                    <td data-label="Modelo">{vehicle.model}</td>
                    <td data-label="Status"><span className={`status-badge status-${vehicle.status}`}>{vehicle.status}</span></td>
                    <td data-label="Lotacao atual">{vehicle.current_department || 'Sem lotacao registrada'}</td>
                    <td data-label="Condutor atual"><DriverBadge name={vehicle.current_driver_name} /></td>
                    <td data-label="Atualizado em">{formatDate(vehicle.updated_at)}</td>
                    <td data-label="Acoes">
                      <div className="actions-inline">
                        <button type="button" className="mini-button" onClick={() => loadHistory(vehicle.id)}>
                          {selectedVehicle?.id === vehicle.id ? 'Fechar historico' : 'Historico'}
                        </button>
                        {selectedVehicle?.id === vehicle.id ? <span className="focus-inline">em foco</span> : null}
                        {canWrite ? <button type="button" className="mini-button" onClick={() => editVehicle(vehicle)}>Editar</button> : null}
                        {canDelete ? <button type="button" className="mini-button danger" onClick={() => handleDelete(vehicle.id)}>Excluir</button> : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <section className="surface-panel history-panel">
        <div className="panel-heading">
          <div>
            <h3 className="section-title">Historico de lotacao</h3>
            <p className="section-copy">
              {selectedVehicle ? `Linha do tempo de ${selectedVehicle.plate}` : 'Selecione um veiculo na tabela para visualizar a cronologia de lotacao.'}
            </p>
            {selectedVehicle ? (
              <p className="section-copy" style={{ marginTop: 10 }}>
                Condutor atual: {selectedVehicle.current_driver_name || 'Sem condutor ativo'}
              </p>
            ) : null}
          </div>
          {selectedVehicle ? (
            <div className="actions-inline">
              {selectedHistory.length > 0 ? (
                <button className="secondary-button" type="button" onClick={handleExportHistoryPdf}>
                  Historico em PDF
                </button>
              ) : null}
              {isAdmin ? (
                <div className="audit-card">
                  <strong>Auditoria visivel para admin</strong>
                  <span>Criado em {formatDate(selectedVehicle.created_at)}</span>
                  <span>Atualizado em {formatDate(selectedVehicle.updated_at)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {selectedHistory.length > 0 ? (
          <ul className="history-list history-grid">
            {selectedHistory.map((item) => (
              <li className="history-item" key={item.id}>
                <strong>{item.department}</strong>
                <div className="muted">Inicio: {formatDate(item.start_date)}</div>
                <div className="muted">Fim: {item.end_date ? formatDate(item.end_date) : 'Atual'}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">Ainda nao ha historico carregado para exibicao neste painel.</div>
        )}
      </section>

      <Modal
        open={isModalOpen}
        title={editingId ? 'Editar veiculo' : 'Novo veiculo'}
        description="Preencha os dados operacionais do veiculo sem sair da consulta principal."
        onClose={closeVehicleModal}
      >
        <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
          <div className="form-field">
            <label htmlFor="plate">Placa</label>
            <input id="plate" className="app-input" placeholder="ABC-1D23" value={form.plate} onChange={(event) => setForm({ ...form, plate: event.target.value })} />
          </div>
          <div className="form-field">
            <label htmlFor="brand">Marca</label>
            <input id="brand" className="app-input" placeholder="Ex.: Ford" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
          </div>
          <div className="form-field">
            <label htmlFor="model">Modelo</label>
            <input id="model" className="app-input" placeholder="Ex.: Ranger" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </div>
          <div className="form-field">
            <label htmlFor="status">Status</label>
            <select id="status" className="app-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="ATIVO">ATIVO</option>
              <option value="MANUTENCAO">MANUTENCAO</option>
              <option value="INATIVO">INATIVO</option>
            </select>
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="department">Departamento / lotacao</label>
            <input
              id="department"
              className="app-input"
              placeholder="Secretaria responsavel"
              value={form.department}
              onChange={(event) => setForm({ ...form, department: event.target.value })}
            />
          </div>
          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : editingId ? 'Atualizar veiculo' : 'Cadastrar veiculo'}
            </button>
            <button className="ghost-button" type="button" onClick={closeVehicleModal}>Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
