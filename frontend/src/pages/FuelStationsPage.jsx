import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import { fuelStationsAPI } from '../api/fuelStations'
import { getApiErrorMessage } from '../utils/apiError'
import api from '../api/client'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import { formatCnpjInput } from '../utils/fuelSupplyOrders'

const initialStationForm = { id: null, name: '', cnpj: '', address: '', active: true }

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

export default function FuelStationsPage() {
  const [stations, setStations] = useState([])
  const [users, setUsers] = useState([])
  const [selectedStationId, setSelectedStationId] = useState('')
  const [links, setLinks] = useState([])
  const [stationForm, setStationForm] = useState(initialStationForm)
  const [userId, setUserId] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('TODOS')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const selectedStation = useMemo(() => stations.find((item) => item.id === selectedStationId), [stations, selectedStationId])

  const filteredStations = useMemo(() => {
    const term = search.trim().toLowerCase()
    return stations.filter((station) => {
      const matchesSearch = !term || [station.name, station.cnpj, station.address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
      const matchesStatus = statusFilter === 'TODOS' || (statusFilter === 'ATIVOS' ? station.active : !station.active)
      return matchesSearch && matchesStatus
    })
  }, [search, stations, statusFilter])

  const exportColumns = useMemo(() => [
    { header: 'Nome', value: (station) => station.name },
    { header: 'CNPJ', value: (station) => station.cnpj || '-' },
    { header: 'Endereco', value: (station) => station.address },
    { header: 'Status', value: (station) => station.active ? 'Ativo' : 'Inativo' },
    { header: 'Criado em', value: (station) => formatDate(station.created_at) },
    { header: 'Atualizado em', value: (station) => formatDate(station.updated_at) },
  ], [])

  async function loadStations({ preferredStationId = null } = {}) {
    const { data } = await fuelStationsAPI.list()
    setStations(data)

    const currentOrPreferredId = preferredStationId || selectedStationId
    const stillExists = currentOrPreferredId && data.some((item) => item.id === currentOrPreferredId)
    setSelectedStationId(stillExists ? currentOrPreferredId : (data[0]?.id || ''))
  }

  async function loadUsers() {
    const { data } = await api.get('/users', { params: { limit: 200, skip: 0 } })
    setUsers(data)
  }

  async function loadLinks(stationId) {
    if (!stationId) {
      setLinks([])
      return
    }
    const { data } = await fuelStationsAPI.listUsers(stationId)
    setLinks(data)
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true)
        setError('')
        await Promise.all([loadStations(), loadUsers()])
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar postos e usuarios.'))
      } finally {
        setLoading(false)
      }
    }
    bootstrap()
  }, [])

  useEffect(() => {
    loadLinks(selectedStationId).catch((err) => setError(getApiErrorMessage(err, 'Nao foi possivel carregar vinculos do posto.')))
  }, [selectedStationId])

  function openCreateModal() {
    setStationForm(initialStationForm)
    setIsModalOpen(true)
  }

  function openEditModal(station) {
    setStationForm({
      id: station.id,
      name: station.name,
      cnpj: station.cnpj || '',
      address: station.address,
      active: station.active,
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setStationForm(initialStationForm)
    setIsModalOpen(false)
  }

  async function saveStation(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      setFeedback('')
      const payload = {
        name: stationForm.name.trim(),
        cnpj: stationForm.cnpj.trim() || null,
        address: stationForm.address.trim(),
        active: stationForm.active,
      }

      const { data } = stationForm.id
        ? await fuelStationsAPI.update(stationForm.id, payload)
        : await fuelStationsAPI.create(payload)

      setFeedback(stationForm.id ? 'Posto atualizado com sucesso.' : 'Posto cadastrado com sucesso.')
      closeModal()
      await loadStations({ preferredStationId: data.id })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o posto.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function removeStation(stationId) {
    if (!window.confirm('Excluir este posto de combustivel?')) return

    try {
      setError('')
      await fuelStationsAPI.remove(stationId)
      setFeedback('Posto removido com sucesso.')
      await loadStations({ preferredStationId: selectedStationId === stationId ? null : selectedStationId })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel remover o posto.'))
    }
  }

  async function createLink() {
    if (!selectedStationId || !userId) return
    try {
      setError('')
      await fuelStationsAPI.createUser(selectedStationId, { user_id: userId, active: true })
      setFeedback('Usuario vinculado ao posto.')
      setUserId('')
      await loadLinks(selectedStationId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel vincular usuario ao posto.'))
    }
  }

  async function toggleLink(link) {
    try {
      setError('')
      await fuelStationsAPI.updateUser(selectedStationId, link.id, { active: !link.active })
      await loadLinks(selectedStationId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel atualizar vinculo.'))
    }
  }

  async function removeLink(linkId) {
    try {
      setError('')
      await fuelStationsAPI.removeUser(selectedStationId, linkId)
      await loadLinks(selectedStationId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel remover vinculo.'))
    }
  }

  async function handlePreviewPdf() {
    if (filteredStations.length === 0) {
      setFeedback('Nao ha postos filtrados para previsualizar em PDF.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: 'Frota PMTF - Postos de combustivel',
        fileName: 'frota-pmtf-postos-combustivel',
        subtitle: 'Relatorio institucional dos postos credenciados no modulo de abastecimentos.',
        columns: exportColumns,
        rows: filteredStations,
        filters: [
          { label: 'Status', value: statusFilter === 'TODOS' ? 'Todos os postos' : statusFilter === 'ATIVOS' ? 'Somente ativos' : 'Somente inativos' },
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
        summaryMetrics: [
          { label: 'Postos exibidos', value: filteredStations.length },
          { label: 'Ativos', value: filteredStations.filter((station) => station.active).length },
          { label: 'Inativos', value: filteredStations.filter((station) => !station.active).length },
        ],
      })
      setFeedback('Pre-visualizacao do PDF dos postos aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel gerar o PDF dos postos.'))
    }
  }

  async function handleExportXlsx() {
    if (filteredStations.length === 0) {
      setFeedback('Nao ha postos filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-postos-combustivel',
        sheetName: 'Postos de combustivel',
        columns: exportColumns,
        rows: filteredStations,
        filters: [
          { label: 'Status', value: statusFilter === 'TODOS' ? 'Todos os postos' : statusFilter === 'ATIVOS' ? 'Somente ativos' : 'Somente inativos' },
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Exportacao dos postos em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar os postos em XLSX.'))
    }
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('TODOS')
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Postos de combustivel</h2>
          <p className="section-copy">Cadastro administrativo de postos credenciados, relatorios institucionais e vinculos de usuarios.</p>
        </div>
        <div className="actions-inline">
          <button className="app-button" type="button" onClick={openCreateModal}>Novo posto</button>
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Previsualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-row" style={{ marginBottom: 18 }}>
        <div className="filter-inline">
          <input
            className="app-input"
            placeholder="Buscar por nome, CNPJ ou endereco"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="app-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="TODOS">Todos os postos</option>
            <option value="ATIVOS">Somente ativos</option>
            <option value="INATIVOS">Somente inativos</option>
          </select>
          <button className="ghost-button" type="button" onClick={clearFilters}>Limpar filtros</button>
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{filteredStations.length}</strong>
          <span>postos exibidos</span>
        </div>
        <div className="metric-inline">
          <strong>{stations.filter((station) => station.active).length}</strong>
          <span>postos ativos</span>
        </div>
        <div className="metric-inline">
          <strong>{stations.filter((station) => !station.active).length}</strong>
          <span>postos inativos</span>
        </div>
        <div className="metric-inline">
          <strong>{links.length}</strong>
          <span>vinculos no posto selecionado</span>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested" style={{ marginBottom: 16 }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CNPJ</th>
                <th>Endereco</th>
                <th>Status</th>
                <th>Atualizado em</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="muted">Carregando postos...</td></tr> : null}
              {!loading && filteredStations.length === 0 ? <tr><td colSpan={6}><div className="empty-state">Nenhum posto encontrado para os filtros aplicados.</div></td></tr> : null}
              {!loading && filteredStations.map((station) => (
                <tr key={station.id}>
                  <td data-label="Nome">
                    <div className="stack">
                      <strong>{station.name}</strong>
                      <span className="muted">Criado em {formatDate(station.created_at)}</span>
                    </div>
                  </td>
                  <td data-label="CNPJ">{station.cnpj || '-'}</td>
                  <td data-label="Endereco">{station.address}</td>
                  <td data-label="Status">
                    <span className={`status-badge ${station.active ? 'status-ATIVO' : 'status-INATIVO'}`}>
                      {station.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td data-label="Atualizado em">{formatDate(station.updated_at)}</td>
                  <td data-label="Acoes">
                    <div className="actions-inline">
                      <button type="button" className="mini-button" onClick={() => openEditModal(station)}>Editar</button>
                      <button type="button" className="mini-button" onClick={() => setSelectedStationId(station.id)}>Vinculos</button>
                      <button type="button" className="mini-button danger" onClick={() => removeStation(station.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-panel panel-nested">
        <div className="panel-heading">
          <div>
            <h3 className="section-title">Vinculos de usuarios {selectedStation ? `- ${selectedStation.name}` : ''}</h3>
            <p className="section-copy">Associe operadores ao posto selecionado e controle o status de acesso operacional.</p>
          </div>
        </div>
        <div className="filter-inline" style={{ marginBottom: 12 }}>
          <select className="app-input" value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Selecione um usuario</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}
          </select>
          <button type="button" className="app-button" onClick={createLink} disabled={!selectedStationId || !userId}>Vincular usuario</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Usuario</th><th>Email</th><th>Status</th><th>Acoes</th></tr></thead>
            <tbody>
              {!selectedStationId ? <tr><td colSpan={4}><div className="empty-state">Selecione um posto para gerenciar os vinculos.</div></td></tr> : null}
              {selectedStationId && links.length === 0 ? <tr><td colSpan={4}><div className="empty-state">Nenhum usuario vinculado a este posto.</div></td></tr> : null}
              {selectedStationId && links.map((link) => (
                <tr key={link.id}>
                  <td data-label="Usuario">{link.user_name || link.user_id}</td>
                  <td data-label="Email">{link.user_email || '-'}</td>
                  <td data-label="Status">{link.active ? 'Ativo' : 'Inativo'}</td>
                  <td data-label="Acoes">
                    <div className="actions-inline">
                      <button type="button" className="mini-button" onClick={() => toggleLink(link)}>{link.active ? 'Desativar' : 'Ativar'}</button>
                      <button type="button" className="mini-button danger" onClick={() => removeLink(link.id)}>Remover</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        title={stationForm.id ? 'Editar posto de combustivel' : 'Novo posto de combustivel'}
        description="Cadastre ou atualize os dados institucionais do posto credenciado."
        onClose={closeModal}
      >
        <form className="form-grid modal-form-grid" onSubmit={saveStation}>
          <div className="form-field">
            <label htmlFor="station-name">Nome</label>
            <input
              id="station-name"
              className="app-input"
              value={stationForm.name}
              onChange={(event) => setStationForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="station-cnpj">CNPJ</label>
            <input
              id="station-cnpj"
              className="app-input"
              value={stationForm.cnpj}
              onChange={(event) => setStationForm((current) => ({ ...current, cnpj: formatCnpjInput(event.target.value) }))}
              placeholder="00.000.000/0000-00"
            />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="station-address">Endereco</label>
            <input
              id="station-address"
              className="app-input"
              value={stationForm.address}
              onChange={(event) => setStationForm((current) => ({ ...current, address: event.target.value }))}
              required
            />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="station-active">Status</label>
            <select
              id="station-active"
              className="app-select"
              value={stationForm.active ? 'true' : 'false'}
              onChange={(event) => setStationForm((current) => ({ ...current, active: event.target.value === 'true' }))}
            >
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : stationForm.id ? 'Salvar posto' : 'Cadastrar posto'}
            </button>
            <button className="ghost-button" type="button" onClick={closeModal}>Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
