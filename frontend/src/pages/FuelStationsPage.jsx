import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import StationLocationPicker from '../components/StationLocationPicker'
import { fuelStationsAPI } from '../api/fuelStations'
import { getApiErrorMessage } from '../utils/apiError'
import api from '../api/client'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import { formatCnpjInput } from '../utils/fuelSupplyOrders'
import { useAuth } from '../context/AuthContext'

const initialStationForm = { id: null, name: '', cnpj: '', address: '', phone: '', latitude: '', longitude: '', active: true }

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function buildMapsUrl(station) {
  if (station.latitude === null || station.latitude === undefined || station.longitude === null || station.longitude === undefined) {
    return ''
  }
  const latitude = Number(station.latitude).toFixed(6)
  const longitude = Number(station.longitude).toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`
}

function formatCoordinates(station) {
  if (!buildMapsUrl(station)) return '-'
  return `${Number(station.latitude).toFixed(6)}, ${Number(station.longitude).toFixed(6)}`
}

function parseOptionalCoordinate(value) {
  const normalized = String(value || '').trim().replace(',', '.')
  if (!normalized) return null
  return Number(normalized)
}

function formatFormCoordinate(value) {
  return Number(value).toFixed(6)
}

export default function FuelStationsPage() {
  const { canCreate, canEdit, canDeleteModule, isAdmin } = useAuth()
  const canCreateStation = canCreate('fuel_stations')
  const canEditStation = canEdit('fuel_stations')
  const canDeleteStation = canDeleteModule('fuel_stations')
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
      const matchesSearch = !term || [station.name, station.cnpj, station.address, station.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
      const matchesStatus = statusFilter === 'TODOS' || (statusFilter === 'ATIVOS' ? station.active : !station.active)
      return matchesSearch && matchesStatus
    })
  }, [search, stations, statusFilter])

  const exportColumns = useMemo(() => [
    { header: 'Nome', value: (station) => station.name },
    { header: 'CNPJ', value: (station) => station.cnpj || '-' },
    { header: 'Telefone', value: (station) => station.phone || '-' },
    { header: 'Endereço', value: (station) => station.address },
    { header: 'Geolocalização', value: (station) => formatCoordinates(station) },
    { header: 'Mapa', value: (station) => buildMapsUrl(station) || '-' },
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
        await Promise.all([loadStations(), isAdmin ? loadUsers() : Promise.resolve()])
      } catch (err) {
        setError(getApiErrorMessage(err, 'Não foi possível carregar postos e usuários.'))
      } finally {
        setLoading(false)
      }
    }
    bootstrap()
  }, [])

  useEffect(() => {
    if (!isAdmin) {
      setLinks([])
      return
    }
    loadLinks(selectedStationId).catch((err) => setError(getApiErrorMessage(err, 'Não foi possível carregar vínculos do posto.')))
  }, [selectedStationId, isAdmin])

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
      phone: station.phone || '',
      latitude: station.latitude ?? '',
      longitude: station.longitude ?? '',
      active: station.active,
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setStationForm(initialStationForm)
    setIsModalOpen(false)
  }

  function handleLocationChange(location) {
    setStationForm((current) => ({
      ...current,
      latitude: location ? formatFormCoordinate(location.latitude) : '',
      longitude: location ? formatFormCoordinate(location.longitude) : '',
    }))
  }

  async function saveStation(event) {
    event.preventDefault()
    if ((stationForm.id && !canEditStation) || (!stationForm.id && !canCreateStation)) {
      setError('Você não tem permissão para salvar postos.')
      return
    }
    try {
      setSubmitting(true)
      setError('')
      setFeedback('')
      const payload = {
        name: stationForm.name.trim(),
        cnpj: stationForm.cnpj.trim() || null,
        address: stationForm.address.trim(),
        phone: stationForm.phone.trim() || null,
        latitude: parseOptionalCoordinate(stationForm.latitude),
        longitude: parseOptionalCoordinate(stationForm.longitude),
        active: stationForm.active,
      }

      const { data } = stationForm.id
        ? await fuelStationsAPI.update(stationForm.id, payload)
        : await fuelStationsAPI.create(payload)

      setFeedback(stationForm.id ? 'Posto atualizado com sucesso.' : 'Posto cadastrado com sucesso.')
      closeModal()
      await loadStations({ preferredStationId: data.id })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar o posto.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function removeStation(stationId) {
    if (!canDeleteStation) {
      setError('Você não tem permissão para excluir postos.')
      return
    }
    if (!window.confirm('Excluir este posto de combustível?')) return

    try {
      setError('')
      await fuelStationsAPI.remove(stationId)
      setFeedback('Posto removido com sucesso.')
      await loadStations({ preferredStationId: selectedStationId === stationId ? null : selectedStationId })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível remover o posto.'))
    }
  }

  async function createLink() {
    if (!selectedStationId || !userId) return
    try {
      setError('')
      await fuelStationsAPI.createUser(selectedStationId, { user_id: userId, active: true })
      setFeedback('Usuário vinculado ao posto.')
      setUserId('')
      await loadLinks(selectedStationId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível vincular usuário ao posto.'))
    }
  }

  async function toggleLink(link) {
    try {
      setError('')
      await fuelStationsAPI.updateUser(selectedStationId, link.id, { active: !link.active })
      await loadLinks(selectedStationId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível atualizar vínculo.'))
    }
  }

  async function removeLink(linkId) {
    try {
      setError('')
      await fuelStationsAPI.removeUser(selectedStationId, linkId)
      await loadLinks(selectedStationId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível remover vínculo.'))
    }
  }

  async function handlePreviewPdf() {
    if (filteredStations.length === 0) {
      setFeedback('Não há postos filtrados para pré-visualizar em PDF.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: 'Frota PMTF - Postos de combustível',
        fileName: 'frota-pmtf-postos-combustivel',
        subtitle: 'Relatório institucional dos postos credenciados no módulo de abastecimentos.',
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
      setFeedback('Pré-visualização do PDF dos postos aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível gerar o PDF dos postos.'))
    }
  }

  async function handleExportXlsx() {
    if (filteredStations.length === 0) {
      setFeedback('Não há postos filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-postos-combustivel',
        sheetName: 'Postos de combustível',
        columns: exportColumns,
        rows: filteredStations,
        filters: [
          { label: 'Status', value: statusFilter === 'TODOS' ? 'Todos os postos' : statusFilter === 'ATIVOS' ? 'Somente ativos' : 'Somente inativos' },
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Exportação dos postos em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível exportar os postos em XLSX.'))
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
          <h2 className="section-title">Postos de combustível</h2>
          <p className="section-copy">Cadastro administrativo de postos credenciados, relatórios institucionais e vínculos de usuários.</p>
        </div>
        <div className="actions-inline">
          {canCreateStation ? <button className="app-button" type="button" onClick={openCreateModal}>Novo posto</button> : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Pré-visualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-row" style={{ marginBottom: 18 }}>
        <div className="filter-inline">
          <input
            className="app-input"
            placeholder="Buscar por nome, CNPJ, telefone ou endereço"
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
        {isAdmin ? <div className="metric-inline">
          <strong>{links.length}</strong>
          <span>vínculos no posto selecionado</span>
        </div> : null}
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested" style={{ marginBottom: 16 }}>
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CNPJ</th>
                <th>Contato</th>
                <th>Endereço</th>
                <th>Localização</th>
                <th>Status</th>
                <th>Atualizado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="muted">Carregando postos...</td></tr> : null}
              {!loading && filteredStations.length === 0 ? <tr><td colSpan={8}><div className="empty-state">Nenhum posto encontrado para os filtros aplicados.</div></td></tr> : null}
              {!loading && filteredStations.map((station) => (
                <tr key={station.id}>
                  <td data-label="Nome">
                    <div className="stack">
                      <strong>{station.name}</strong>
                      <span className="muted">Criado em {formatDate(station.created_at)}</span>
                    </div>
                  </td>
                  <td data-label="CNPJ">{station.cnpj || '-'}</td>
                  <td data-label="Contato">{station.phone || '-'}</td>
                  <td data-label="Endereço">{station.address}</td>
                  <td data-label="Localização" className="map-action-cell">
                    {buildMapsUrl(station) ? (
                      <a
                        className="mini-button map-button"
                        href={buildMapsUrl(station)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Abrir mapa do posto ${station.name}`}
                      >
                        Abrir mapa
                      </a>
                    ) : (
                      <span className="muted">Sem coordenadas</span>
                    )}
                  </td>
                  <td data-label="Status">
                    <span className={`status-badge ${station.active ? 'status-ATIVO' : 'status-INATIVO'}`}>
                      {station.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td data-label="Atualizado em">{formatDate(station.updated_at)}</td>
                  <td data-label="Ações">
                    <div className="actions-inline">
                      {canEditStation ? <button type="button" className="mini-button" onClick={() => openEditModal(station)}>Editar</button> : null}
                      {isAdmin ? <button type="button" className="mini-button" onClick={() => setSelectedStationId(station.id)}>Vínculos</button> : null}
                      {canDeleteStation ? <button type="button" className="mini-button danger" onClick={() => removeStation(station.id)}>Excluir</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin ? <div className="surface-panel panel-nested">
        <div className="panel-heading">
          <div>
            <h3 className="section-title">Vínculos de usuários {selectedStation ? `- ${selectedStation.name}` : ''}</h3>
            <p className="section-copy">Associe operadores ao posto selecionado e controle o status de acesso operacional.</p>
          </div>
        </div>
        <div className="filter-inline" style={{ marginBottom: 12 }}>
          <select className="app-input" value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Selecione um usuário</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}
          </select>
          {canCreateStation ? <button type="button" className="app-button" onClick={createLink} disabled={!selectedStationId || !userId}>Vincular usuário</button> : null}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Usuário</th><th>Email</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              {!selectedStationId ? <tr><td colSpan={4}><div className="empty-state">Selecione um posto para gerenciar os vínculos.</div></td></tr> : null}
              {selectedStationId && links.length === 0 ? <tr><td colSpan={4}><div className="empty-state">Nenhum usuário vinculado a este posto.</div></td></tr> : null}
              {selectedStationId && links.map((link) => (
                <tr key={link.id}>
                  <td data-label="Usuário">{link.user_name || link.user_id}</td>
                  <td data-label="Email">{link.user_email || '-'}</td>
                  <td data-label="Status">{link.active ? 'Ativo' : 'Inativo'}</td>
                  <td data-label="Ações">
                    <div className="actions-inline">
                      {canEditStation ? <button type="button" className="mini-button" onClick={() => toggleLink(link)}>{link.active ? 'Desativar' : 'Ativar'}</button> : null}
                      {canDeleteStation ? <button type="button" className="mini-button danger" onClick={() => removeLink(link.id)}>Remover</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div> : null}

      <Modal
        open={isModalOpen && (stationForm.id ? canEditStation : canCreateStation)}
        title={stationForm.id ? 'Editar posto de combustível' : 'Novo posto de combustível'}
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
            <label htmlFor="station-address">Endereço</label>
            <input
              id="station-address"
              className="app-input"
              value={stationForm.address}
              onChange={(event) => setStationForm((current) => ({ ...current, address: event.target.value }))}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="station-phone">Telefone</label>
            <input
              id="station-phone"
              className="app-input"
              value={stationForm.phone}
              onChange={(event) => setStationForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className="form-field modal-field-span">
            <label>Localização do posto</label>
            <StationLocationPicker
              latitude={stationForm.latitude}
              longitude={stationForm.longitude}
              onChange={handleLocationChange}
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
