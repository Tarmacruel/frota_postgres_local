import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import FuelSupplyOrderCreateForm from '../components/FuelSupplyOrderCreateForm'
import api from '../api/client'
import { fuelStationsAPI } from '../api/fuelStations'
import { masterDataAPI } from '../api/masterData'
import { fuelSuppliesAPI } from '../api/fuelSupplies'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { getApiErrorMessage } from '../utils/apiError'
import { downloadFuelSupplyOrderDocument, previewFuelSupplyOrderDocument } from '../utils/fuelSupplyOrderDocument'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import {
  formatCurrencyBRL,
  formatOrderNumber,
  getOrderStatusClass,
  getOrderStatusLabel,
  resolvePublicValidationUrl,
} from '../utils/fuelSupplyOrders'

const ORDER_STATUS_OPTIONS = [
  { value: 'TODOS', label: 'Todas as situacoes' },
  { value: 'OPEN', label: 'Abertas' },
  { value: 'COMPLETED', label: 'Concluidas' },
  { value: 'EXPIRED', label: 'Expiradas' },
  { value: 'CANCELLED', label: 'Canceladas' },
]

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined) return '-'
  return Number(value).toFixed(digits)
}

function formatCurrency(value) {
  return formatCurrencyBRL(value)
}

function buildVehicleOption(vehicle) {
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotacao'
  return { value: vehicle.id, label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`, description: locationLabel }
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  return []
}

export default function FuelSuppliesPage() {
  const [records, setRecords] = useState([])
  const [orders, setOrders] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [fuelStations, setFuelStations] = useState([])
  const [filters, setFilters] = useState({ vehicle_id: '', driver_id: '', organization_id: '', fuel_station_id: '', only_anomalies: '' })
  const [orderFilters, setOrderFilters] = useState({ status: 'TODOS', fuel_station_id: '' })
  const [search, setSearch] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [lastIssuedOrder, setLastIssuedOrder] = useState(null)
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1)
  const [currentOrdersPage, setCurrentOrdersPage] = useState(1)
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)

  useEffect(() => {
    async function loadDependencies() {
      try {
        const [vehiclesResponse, driversResponse, organizationsResponse, stationsResponse] = await Promise.all([
          api.get('/vehicles'),
          api.get('/drivers'),
          masterDataAPI.listOrganizations(),
          fuelStationsAPI.list({ active_only: true }),
        ])
        setVehicles(asArray(vehiclesResponse.data))
        setDrivers(asArray(driversResponse.data))
        setOrganizations(asArray(organizationsResponse.data))
        setFuelStations(asArray(stationsResponse.data))
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar os cadastros de apoio.'))
      }
    }
    loadDependencies()
  }, [])

  async function loadRecords() {
    try {
      setHistoryLoading(true)
      setError('')
      const params = { limit: 100, page: 1 }
      if (filters.vehicle_id) params.vehicle_id = filters.vehicle_id
      if (filters.driver_id) params.driver_id = filters.driver_id
      if (filters.organization_id) params.organization_id = filters.organization_id
      if (filters.fuel_station_id) params.fuel_station_id = filters.fuel_station_id
      if (filters.only_anomalies === 'true') params.only_anomalies = true
      const { data } = await fuelSuppliesAPI.list(params)
      setRecords(data.data || [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os abastecimentos.'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadOrders() {
    try {
      setOrdersLoading(true)
      setError('')
      const params = { limit: 100, page: 1 }
      if (orderFilters.status !== 'TODOS') params.status = orderFilters.status
      if (orderFilters.fuel_station_id) params.fuel_station_id = orderFilters.fuel_station_id
      const { data } = await fuelSupplyOrdersAPI.list(params)
      setOrders(asArray(data))
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar as ordens de abastecimento.'))
    } finally {
      setOrdersLoading(false)
    }
  }

  useEffect(() => {
    loadRecords()
  }, [filters])

  useEffect(() => {
    loadOrders()
  }, [orderFilters])

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase()
    return records.filter((record) => {
      if (!term) return true
      return [record.vehicle_plate, record.driver_name, record.organization_name, record.fuel_station_name, record.fuel_station, record.notes]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    })
  }, [records, search])

  const filteredOrders = useMemo(() => {
    const term = orderSearch.trim().toLowerCase()
    return orders.filter((order) => {
      if (!term) return true
      return [
        order.request_number,
        order.vehicle_plate,
        order.driver_name,
        order.organization_name,
        order.fuel_station_name,
        order.created_by_name,
        order.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [orders, orderSearch])

  const totalHistoryPages = Math.max(1, Math.ceil(filteredRecords.length / 10))
  const paginatedRecords = filteredRecords.slice((currentHistoryPage - 1) * 10, currentHistoryPage * 10)
  const totalOrdersPages = Math.max(1, Math.ceil(filteredOrders.length / 10))
  const paginatedOrders = filteredOrders.slice((currentOrdersPage - 1) * 10, currentOrdersPage * 10)

  const orderExportColumns = useMemo(() => [
    { header: 'Ordem', value: (order) => formatOrderNumber(order) },
    { header: 'Situacao', value: (order) => getOrderStatusLabel(order.status) },
    { header: 'Veiculo', value: (order) => order.vehicle_description || order.vehicle_plate || '-' },
    { header: 'Posto', value: (order) => order.fuel_station_name || '-' },
    { header: 'Orgao', value: (order) => order.organization_name || '-' },
    { header: 'Solicitante', value: (order) => order.created_by_name || '-' },
    { header: 'Prazo', value: (order) => formatDate(order.expires_at) },
    { header: 'Litros previstos', value: (order) => order.requested_liters ?? '-' },
    { header: 'Valor maximo', value: (order) => formatCurrency(order.max_amount) },
    { header: 'Codigo publico', value: (order) => order.validation_code || '-' },
  ], [])

  useEffect(() => {
    setCurrentHistoryPage(1)
  }, [search, filters, records.length])

  useEffect(() => {
    setCurrentOrdersPage(1)
  }, [orderSearch, orderFilters, orders.length])

  async function handleCancelOrder(order) {
    if (!window.confirm(`Cancelar a ordem ${formatOrderNumber(order)}?`)) return

    const reason = window.prompt('Motivo do cancelamento (opcional):', '')
    if (reason === null) return

    try {
      setError('')
      setFeedback('')
      await fuelSupplyOrdersAPI.cancel(order.id, { reason: reason.trim() || null })
      setFeedback(`Ordem ${formatOrderNumber(order)} cancelada com sucesso.`)
      await loadOrders()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel cancelar a ordem de abastecimento.'))
    }
  }

  async function handlePreviewOrdersPdf() {
    if (filteredOrders.length === 0) {
      setFeedback('Nao ha ordens filtradas para previsualizar em PDF.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: 'Frota PMTF - Ordens de abastecimento',
        fileName: 'frota-pmtf-ordens-abastecimento',
        subtitle: 'Relatorio institucional das ordens emitidas para os postos credenciados.',
        columns: orderExportColumns,
        rows: filteredOrders,
        filters: [
          { label: 'Situacao', value: orderFilters.status === 'TODOS' ? 'Todas as situacoes' : getOrderStatusLabel(orderFilters.status) },
          { label: 'Posto', value: fuelStations.find((station) => station.id === orderFilters.fuel_station_id)?.name || 'Todos os postos' },
          ...(orderSearch.trim() ? [{ label: 'Busca', value: orderSearch.trim() }] : []),
        ],
        summaryMetrics: [
          { label: 'Ordens exibidas', value: filteredOrders.length },
          { label: 'Abertas', value: filteredOrders.filter((order) => order.status === 'OPEN').length },
          { label: 'Concluidas', value: filteredOrders.filter((order) => order.status === 'COMPLETED').length },
        ],
        orientation: 'landscape',
      })
      setFeedback('Pre-visualizacao do PDF das ordens aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel gerar o PDF das ordens de abastecimento.'))
    }
  }

  async function handleExportOrdersXlsx() {
    if (filteredOrders.length === 0) {
      setFeedback('Nao ha ordens filtradas para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-ordens-abastecimento',
        sheetName: 'Ordens de abastecimento',
        columns: orderExportColumns,
        rows: filteredOrders,
        filters: [
          { label: 'Situacao', value: orderFilters.status === 'TODOS' ? 'Todas as situacoes' : getOrderStatusLabel(orderFilters.status) },
          { label: 'Posto', value: fuelStations.find((station) => station.id === orderFilters.fuel_station_id)?.name || 'Todos os postos' },
          ...(orderSearch.trim() ? [{ label: 'Busca', value: orderSearch.trim() }] : []),
        ],
      })
      setFeedback('Exportacao das ordens em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar as ordens em XLSX.'))
    }
  }

  async function handlePreviewOrderDocument(order) {
    try {
      setError('')
      await previewFuelSupplyOrderDocument(order)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel abrir o comprovante da ordem.'))
    }
  }

  async function handleDownloadOrderDocument(order) {
    try {
      setError('')
      await downloadFuelSupplyOrderDocument(order)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel baixar o comprovante da ordem.'))
    }
  }

  async function handleCopyPublicLink(order) {
    const publicUrl = resolvePublicValidationUrl(order.public_validation_path)
    if (!publicUrl) {
      setFeedback('Link publico indisponivel para esta ordem.')
      return
    }

    if (!navigator.clipboard) {
      setFeedback(`Link publico: ${publicUrl}`)
      return
    }

    try {
      await navigator.clipboard.writeText(publicUrl)
      setFeedback(`Link publico da ordem ${formatOrderNumber(order)} copiado com sucesso.`)
    } catch {
      setFeedback(`Link publico: ${publicUrl}`)
    }
  }

  function clearHistoryFilters() {
    setSearch('')
    setFilters({ vehicle_id: '', driver_id: '', organization_id: '', fuel_station_id: '', only_anomalies: '' })
  }

  function clearOrderFilters() {
    setOrderSearch('')
    setOrderFilters({ status: 'TODOS', fuel_station_id: '' })
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Gestao de abastecimentos</h2>
          <p className="section-copy">Emita ordens para os postos vinculados e acompanhe o historico confirmado com comprovantes e alertas de consumo.</p>
        </div>
        <div className="actions-inline">
          <button className="app-button" type="button" onClick={() => setIsOrderModalOpen(true)}>Nova ordem</button>
          <button className="ghost-button" type="button" onClick={() => { loadOrders(); loadRecords() }}>Atualizar painel</button>
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{orders.filter((order) => order.status === 'OPEN').length}</strong>
          <span>ordens abertas</span>
        </div>
        <div className="metric-inline">
          <strong>{records.length}</strong>
          <span>abastecimentos carregados</span>
        </div>
        <div className="metric-inline">
          <strong>{records.filter((record) => record.is_consumption_anomaly).length}</strong>
          <span>alertas de consumo</span>
        </div>
        <div className="metric-inline">
          <strong>{fuelStations.length}</strong>
          <span>postos ativos</span>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      {lastIssuedOrder ? (
        <div className="table-focus-banner">
          <div>
            <strong>Comprovante institucional disponivel para {formatOrderNumber(lastIssuedOrder)}</strong>
            <span>
              O documento oficial ja pode ser previsualizado, baixado em PDF ou compartilhado pelo link publico com
              validacao por QR Code.
            </span>
          </div>
          <div className="actions-inline">
            <button className="app-button" type="button" onClick={() => handlePreviewOrderDocument(lastIssuedOrder)}>Abrir comprovante</button>
            <button className="secondary-button" type="button" onClick={() => handleDownloadOrderDocument(lastIssuedOrder)}>Baixar PDF</button>
            <button className="ghost-button" type="button" onClick={() => handleCopyPublicLink(lastIssuedOrder)}>Copiar link publico</button>
          </div>
        </div>
      ) : null}

      <div className="surface-panel panel-nested" style={{ marginBottom: 16 }}>
        <div className="panel-heading">
          <div>
            <h3 className="section-title">Ordens de abastecimento</h3>
            <p className="section-copy">Acompanhe o ciclo completo das ordens emitidas para os postos credenciados.</p>
          </div>
          <div className="actions-inline">
            <button className="secondary-button" type="button" onClick={handlePreviewOrdersPdf}>Previsualizar PDF</button>
            <button className="ghost-button" type="button" onClick={handleExportOrdersXlsx}>Exportar XLSX</button>
          </div>
        </div>

        <div className="filter-inline">
          <input className="app-input" placeholder="Buscar ordem por placa, posto, solicitante ou observacao" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} />
          <select className="app-select" value={orderFilters.status} onChange={(event) => setOrderFilters((prev) => ({ ...prev, status: event.target.value }))}>
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <SearchableSelect
            value={orderFilters.fuel_station_id}
            onChange={(value) => setOrderFilters((prev) => ({ ...prev, fuel_station_id: value }))}
            options={[{ value: '', label: 'Todos os postos' }, ...fuelStations.map((station) => ({ value: station.id, label: station.name, description: station.address }))]}
            placeholder="Filtrar posto"
            searchPlaceholder="Buscar posto"
          />
          <button className="ghost-button" type="button" onClick={clearOrderFilters}>Limpar filtros</button>
        </div>

        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Veiculo</th>
                <th>Posto</th>
                <th>Situacao</th>
                <th>Prazo</th>
                <th>Solicitante</th>
                <th>Litros previstos</th>
                <th>Valor maximo</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {ordersLoading ? <tr><td colSpan={9} className="muted">Carregando ordens...</td></tr> : null}
              {!ordersLoading && paginatedOrders.length === 0 ? <tr><td colSpan={9}><div className="empty-state">Nenhuma ordem encontrada para os filtros aplicados.</div></td></tr> : null}
              {!ordersLoading && paginatedOrders.map((order) => (
                <tr key={order.id}>
                  <td data-label="Ordem"><strong>{formatOrderNumber(order)}</strong></td>
                  <td data-label="Veiculo">{order.vehicle_plate}</td>
                  <td data-label="Posto">{order.fuel_station_name || '-'}</td>
                  <td data-label="Situacao">
                    <span className={`status-badge ${getOrderStatusClass(order.status)}`}>{getOrderStatusLabel(order.status)}</span>
                  </td>
                  <td data-label="Prazo">{formatDate(order.expires_at)}</td>
                  <td data-label="Solicitante">
                    <div className="stack">
                      <strong>{order.created_by_name || '-'}</strong>
                      <span className="muted">{order.organization_name || 'Sem orgao informado'}</span>
                    </div>
                  </td>
                  <td data-label="Litros previstos">{formatNumber(order.requested_liters)}</td>
                  <td data-label="Valor maximo">{formatCurrency(order.max_amount)}</td>
                  <td data-label="Acoes">
                    <div className="actions-inline">
                      <button type="button" className="mini-button" onClick={() => handlePreviewOrderDocument(order)}>Comprovante</button>
                      <button type="button" className="mini-button" onClick={() => handleCopyPublicLink(order)}>Link publico</button>
                      <button type="button" className="mini-button" onClick={() => handleDownloadOrderDocument(order)}>Baixar PDF</button>
                      {order.status === 'OPEN' ? <button type="button" className="mini-button danger" onClick={() => handleCancelOrder(order)}>Cancelar</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentOrdersPage} totalPages={totalOrdersPages} onPageChange={setCurrentOrdersPage} />
      </div>

      <div className="surface-panel panel-nested">
        <div className="panel-heading">
          <div>
            <h3 className="section-title">Historico de abastecimentos</h3>
            <p className="section-copy">Consulta historica dos abastecimentos confirmados, com comprovantes e alertas de consumo.</p>
          </div>
        </div>

        <div className="filter-inline" style={{ marginBottom: 12 }}>
          <input className="app-input" placeholder="Buscar por placa, condutor, orgao ou posto" value={search} onChange={(event) => setSearch(event.target.value)} />
          <SearchableSelect value={filters.vehicle_id} onChange={(value) => setFilters((prev) => ({ ...prev, vehicle_id: value }))} options={[{ value: '', label: 'Todos os veiculos' }, ...vehicles.map(buildVehicleOption)]} placeholder="Filtrar veiculo" />
          <SearchableSelect value={filters.driver_id} onChange={(value) => setFilters((prev) => ({ ...prev, driver_id: value }))} options={[{ value: '', label: 'Todos os condutores' }, ...drivers.map((driver) => ({ value: driver.id, label: driver.nome_completo }))]} placeholder="Filtrar condutor" />
          <SearchableSelect value={filters.organization_id} onChange={(value) => setFilters((prev) => ({ ...prev, organization_id: value }))} options={[{ value: '', label: 'Todos os orgaos' }, ...organizations.map((org) => ({ value: org.id, label: org.name }))]} placeholder="Filtrar orgao" />
          <SearchableSelect value={filters.fuel_station_id} onChange={(value) => setFilters((prev) => ({ ...prev, fuel_station_id: value }))} options={[{ value: '', label: 'Todos os postos' }, ...fuelStations.map((station) => ({ value: station.id, label: station.name, description: station.address }))]} placeholder="Filtrar posto" />
          <select className="app-input" value={filters.only_anomalies} onChange={(event) => setFilters((prev) => ({ ...prev, only_anomalies: event.target.value }))}>
            <option value="">Todos</option>
            <option value="true">Somente alertas</option>
          </select>
          <button className="ghost-button" type="button" onClick={clearHistoryFilters}>Limpar filtros</button>
        </div>

        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th>Veiculo</th>
                <th>Data</th>
                <th>Condutor</th>
                <th>Orgao</th>
                <th>Posto</th>
                <th>Litros</th>
                <th>Km/l</th>
                <th>Alerta</th>
                <th>Comprovante</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading ? <tr><td colSpan={9} className="muted">Carregando abastecimentos...</td></tr> : null}
              {!historyLoading && paginatedRecords.length === 0 ? <tr><td colSpan={9}><div className="empty-state">Nenhum abastecimento encontrado.</div></td></tr> : null}
              {!historyLoading && paginatedRecords.map((record) => (
                <tr key={record.id}>
                  <td data-label="Veiculo">{record.vehicle_plate}</td>
                  <td data-label="Data">{formatDate(record.supplied_at)}</td>
                  <td data-label="Condutor">{record.driver_name || '-'}</td>
                  <td data-label="Orgao">{record.organization_name || '-'}</td>
                  <td data-label="Posto">{record.fuel_station_name || record.fuel_station || '-'}</td>
                  <td data-label="Litros">{formatNumber(record.liters)}</td>
                  <td data-label="Km/l">{formatNumber(record.consumption_km_l)}</td>
                  <td data-label="Alerta">{record.is_consumption_anomaly ? <span className="status-chip warning">Alerta</span> : '-'}</td>
                  <td data-label="Comprovante"><a className="link-inline" href={record.receipt_url} target="_blank" rel="noreferrer">Abrir</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentHistoryPage} totalPages={totalHistoryPages} onPageChange={setCurrentHistoryPage} />
      </div>

      <Modal open={isOrderModalOpen} onClose={() => setIsOrderModalOpen(false)} title="Nova ordem de abastecimento" description="Emita a ordem para um posto credenciado executar o abastecimento.">
        <FuelSupplyOrderCreateForm
          vehicles={vehicles}
          drivers={drivers}
          organizations={organizations}
          fuelStations={fuelStations}
          onClose={() => setIsOrderModalOpen(false)}
          onSuccess={({ message, order }) => {
            setFeedback(message)
            setLastIssuedOrder(order || null)
            loadOrders()
          }}
        />
      </Modal>
    </div>
  )
}
