import { hasContractFunding } from '../utils/contractBalance'
import IndicatorBar from '../components/ui/IndicatorBar'
import ContractReturnBanner from '../components/contracts/ContractReturnBanner'
import { useInteractiveKpis } from '../hooks/useInteractiveKpis'
import { useContractControl } from '../hooks/useContractFunding'
import { Link, useNavigate } from 'react-router-dom'
import FuelSupplyOrderCancelForm from '../components/FuelSupplyOrderCancelForm'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Modal from '../components/Modal'
import FuelSupplyAlertBadge from '../components/FuelSupplyAlertBadge'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import FuelSupplyOrderCreateForm from '../components/FuelSupplyOrderCreateForm'
import FuelSupplyOrderBatchCreateForm from '../components/FuelSupplyOrderBatchCreateForm'
import FuelSupplyOrderDeadlineForm from '../components/FuelSupplyOrderDeadlineForm'
import FuelSupplyRectifyForm from '../components/FuelSupplyRectifyForm'
import GuidedTour from '../components/GuidedTour'
import { MobileFilters, ResponsiveRecord, ActionMenu, PageHeader, StatusChip, VehicleThumbnail } from '../components/ui'
import api from '../api/client'
import { fuelStationsAPI } from '../api/fuelStations'
import { masterDataAPI } from '../api/masterData'
import { fuelSuppliesAPI } from '../api/fuelSupplies'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { downloadFuelSupplyOrderDocument, previewFuelSupplyOrderDocument } from '../utils/fuelSupplyOrderDocument'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import {
  formatCurrencyBRL,
  formatOrderNumber,
  getOrderStatusLabel,
  resolvePublicValidationUrl,
} from '../utils/fuelSupplyOrders'
import { formatAdditiveDetails, fuelSupplyAlertReason } from '../utils/fuelSupplyDetails'

const ORDER_STATUS_OPTIONS = [
  { value: 'TODOS', label: 'Todas as situações' },
  { value: 'OPEN', label: 'Abertas' },
  { value: 'COMPLETED', label: 'Concluídas' },
  { value: 'EXPIRED', label: 'Expiradas' },
  { value: 'CANCELLED', label: 'Canceladas' },
]

function getOrderStatusTone(status) {
  if (status === 'COMPLETED') return 'success'
  if (status === 'OPEN') return 'info'
  if (status === 'EXPIRED') return 'warning'
  if (status === 'CANCELLED') return 'danger'
  return 'neutral'
}

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

function formatDateOnly(value) {
  if (!value) return '-'
  const normalized = String(value).length === 10 ? `${value}T00:00:00` : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

function dateBoundaryToIso(value, boundary) {
  if (!value) return undefined
  const suffix = boundary === 'end' ? 'T23:59:59.999' : 'T00:00:00.000'
  const date = new Date(`${value}${suffix}`)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function orderMatchesSearch(order, search) {
  const term = search.trim().toLowerCase()
  if (!term) return true
  return [
    order.request_number,
    order.vehicle_plate,
    order.organization_name,
    order.fuel_station_name,
    order.created_by_name,
    order.fuel_station_phone,
    order.supply_fuel_type,
    order.notes,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term))
}

function buildOrderMapsUrl(order) {
  if (order.fuel_station_maps_url) return order.fuel_station_maps_url
  if (order.fuel_station_latitude === null || order.fuel_station_latitude === undefined) return ''
  if (order.fuel_station_longitude === null || order.fuel_station_longitude === undefined) return ''
  const latitude = Number(order.fuel_station_latitude).toFixed(6)
  const longitude = Number(order.fuel_station_longitude).toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`
}

function buildStationOption(station) {
  return {
    value: station.id,
    label: station.name,
    description: [station.address, station.phone].filter(Boolean).join(' | '),
    keywords: [station.name, station.cnpj, station.address, station.phone].filter(Boolean).join(' '),
  }
}

function buildVehicleOption(vehicle) {
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação'
  return { value: vehicle.id, tags: vehicle.tags || [], label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`, description: locationLabel }
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  return []
}

export default function FuelSuppliesPage() {
  const { selected: indicator, metadata: indicatorMetadata, setMetadata: setIndicators } = useInteractiveKpis()
  const { selected: orderIndicator, metadata: orderIndicatorMetadata, setMetadata: setOrderIndicators } = useInteractiveKpis('order_indicator')
  useEffect(() => { setCurrentHistoryPage(1) }, [indicator])
  useEffect(() => { setCurrentOrdersPage(1) }, [orderIndicator])
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { canCreate, canEdit, canView, isAdmin, isProduction } = useAuth()
  const control = useContractControl()
  const canViewOrders = canView('fuel_supply_orders')
  const requestedView = searchParams.get('view')
  const orderContext = searchParams.has('contract_id') || searchParams.has('order_indicator') || searchParams.has('acao') || searchParams.get('action') === 'create'
  const historyContext = searchParams.has('indicator') || searchParams.has('vehicle_id')
  const activeView = !canViewOrders ? 'history' : requestedView === 'history' ? 'history'
    : requestedView === 'orders' || orderContext ? 'orders' : historyContext ? 'history' : 'orders'
  const canCreateOrder = canCreate('fuel_supply_orders')
  const canEditOrder = canEdit('fuel_supply_orders')
  const canRectifySupply = canEdit('fuel_supplies') && (isAdmin || isProduction)
  const canAdjustOrderDeadline = canEditOrder && (isAdmin || isProduction)
  const [records, setRecords] = useState([])
  const [orders, setOrders] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [fuelStations, setFuelStations] = useState([])
  const [filters, setFilters] = useState(() => ({ vehicle_id: searchParams.get('vehicle_id') || '', organization_id: '', fuel_station_id: '', only_anomalies: '' }))
  const [orderFilters, setOrderFilters] = useState({ status: 'TODOS', organization_id: '', fuel_station_id: '', created_from: '', created_to: '' })
  const [search, setSearch] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [lastIssuedOrder, setLastIssuedOrder] = useState(null)
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1)
  const [currentOrdersPage, setCurrentOrdersPage] = useState(1)
  const [historyPagination, setHistoryPagination] = useState({ pages: 1, total: 0 })
  const [ordersPagination, setOrdersPagination] = useState({ pages: 1, total: 0 })
  const historyRequest = useRef(0)
  const ordersRequest = useRef(0)
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [isBatchOrderModalOpen, setIsBatchOrderModalOpen] = useState(false)
  const [batchTourReplayToken, setBatchTourReplayToken] = useState(0)
  const [supplyToRectify, setSupplyToRectify] = useState(null)
  const [alertSupply, setAlertSupply] = useState(null)
  const [activeAlertSummary, setActiveAlertSummary] = useState(null)
  const [orderToAdjust, setOrderToAdjust] = useState(null)
  const [orderToCancel, setOrderToCancel] = useState(null)
  const [cancellingOrder, setCancellingOrder] = useState(false)

  function selectView(view) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('view', view)
      return next
    })
    setActiveAlertSummary(null)
  }

  function selectWorkspaceIndicator(parameter, key, view) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('view', view)
      if (!key || key === 'total' || key === current.get(parameter)) next.delete(parameter)
      else next.set(parameter, key)
      next.delete('focus')
      return next
    })
  }

  function refreshOrdersAfterIssue() {
    if (canViewOrders && activeView !== 'orders') selectView('orders')
    else loadOrders()
  }

  useEffect(() => {
    const action = searchParams.get('acao') || (searchParams.get('action') === 'create' ? 'nova-ordem' : '')
    if (!['nova-ordem', 'nova-ordem-lote'].includes(action)) return
    const shouldStartBatchTour = action === 'nova-ordem-lote' && searchParams.get('guia') === '1'

    if (canCreateOrder) {
      if (action === 'nova-ordem') setIsOrderModalOpen(true)
      if (action === 'nova-ordem-lote') setIsBatchOrderModalOpen(true)
      if (shouldStartBatchTour) setBatchTourReplayToken((current) => current + 1)
    }

    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('acao')
    nextSearchParams.delete('action')
    if (shouldStartBatchTour) nextSearchParams.delete('guia')
    setSearchParams(nextSearchParams, { replace: true })
  }, [canCreateOrder, searchParams, setSearchParams])

  useEffect(() => {
    async function loadDependencies() {
      try {
        const [vehiclesResponse, organizationsResponse, stationsResponse] = await Promise.all([
          api.get('/vehicles/options'),
          masterDataAPI.listOrganizations(),
          fuelStationsAPI.list({ active_only: true }),
        ])
        setVehicles(asArray(vehiclesResponse.data))
        setOrganizations(asArray(organizationsResponse.data))
        setFuelStations(asArray(stationsResponse.data))
      } catch (err) {
        setError(getApiErrorMessage(err, 'Não foi possível carregar os cadastros de apoio.'))
      }
    }
    loadDependencies()
  }, [])

  async function refreshVehicleOptions() {
    const { data } = await api.get('/vehicles/options')
    setVehicles(asArray(data))
  }

  async function loadRecords(page = currentHistoryPage) {
    const request = ++historyRequest.current
    try {
      setHistoryLoading(true)
      setError('')
      const params = { limit: 10, page, search: search.trim() || undefined, indicator: indicator === 'total' ? undefined : indicator }
      if (filters.vehicle_id) params.vehicle_id = filters.vehicle_id
      if (filters.organization_id) params.organization_id = filters.organization_id
      if (filters.fuel_station_id) params.fuel_station_id = filters.fuel_station_id
      if (filters.only_anomalies === 'true') params.only_anomalies = true
      const { data } = await fuelSuppliesAPI.list(params)
      if (request !== historyRequest.current) return
      if (page > data.pagination.pages) {
        setCurrentHistoryPage(data.pagination.pages)
        return
      }
      setRecords(data.data || [])
      setHistoryPagination(data.pagination)
      setIndicators(data.indicators || null)
    } catch (err) {
      if (request === historyRequest.current) setError(getApiErrorMessage(err, 'Não foi possível carregar os abastecimentos.'))
    } finally {
      if (request === historyRequest.current) setHistoryLoading(false)
    }
  }

  async function loadOrders(page = currentOrdersPage) {
    if (!canViewOrders) {
      setOrders([])
      setOrdersPagination({ pages: 1, total: 0 })
      setOrdersLoading(false)
      return
    }
    const request = ++ordersRequest.current
    try {
      setOrdersLoading(true)
      setError('')
      const params = buildOrderQueryParams({ includePaging: true, page })
      const { data } = await fuelSupplyOrdersAPI.list(params)
      if (request !== ordersRequest.current) return
      if (page > data.pagination.pages) {
        setCurrentOrdersPage(data.pagination.pages)
        return
      }
      setOrders(asArray(data))
      setOrdersPagination(data.pagination)
      setOrderIndicators(data.indicators || null)
    } catch (err) {
      if (request === ordersRequest.current) setError(getApiErrorMessage(err, 'Não foi possível carregar as ordens de abastecimento.'))
    } finally {
      if (request === ordersRequest.current) setOrdersLoading(false)
    }
  }

  useEffect(() => {
    historyRequest.current += 1
    if (activeView !== 'history') return undefined
    const timer = setTimeout(() => loadRecords(), search.trim() ? 250 : 0)
    return () => { clearTimeout(timer); historyRequest.current += 1 }
  }, [filters, search, currentHistoryPage, indicator, activeView])

  useEffect(() => {
    ordersRequest.current += 1
    if (activeView !== 'orders') return undefined
    const timer = setTimeout(() => loadOrders(), orderSearch.trim() ? 250 : 0)
    return () => { clearTimeout(timer); ordersRequest.current += 1 }
  }, [orderFilters, orderSearch, currentOrdersPage, canViewOrders, orderIndicator, activeView])

  function buildOrderQueryParams({ includePaging = false, page = currentOrdersPage } = {}) {
    const params = includePaging ? { limit: 10, page, search: orderSearch.trim() || undefined } : {}
    params.indicator = orderIndicator === 'total' ? undefined : orderIndicator
    if (orderFilters.status !== 'TODOS') params.status = orderFilters.status
    if (orderFilters.organization_id) params.organization_id = orderFilters.organization_id
    if (orderFilters.fuel_station_id) params.fuel_station_id = orderFilters.fuel_station_id
    const createdFrom = dateBoundaryToIso(orderFilters.created_from, 'start')
    const createdTo = dateBoundaryToIso(orderFilters.created_to, 'end')
    if (createdFrom) params.created_from = createdFrom
    if (createdTo) params.created_to = createdTo
    return params
  }

  async function loadOrderReportRows() {
    const rows = await fuelSupplyOrdersAPI.listAllForReport(buildOrderQueryParams())
    return rows.filter((order) => orderMatchesSearch(order, orderSearch))
  }

  const totalHistoryPages = historyPagination.pages
  const paginatedRecords = records
  const totalOrdersPages = ordersPagination.pages
  const paginatedOrders = orders

  const orderExportColumns = useMemo(() => [
    { header: 'Ordem', value: (order) => formatOrderNumber(order) },
    { header: 'Situação', value: (order) => getOrderStatusLabel(order.status) },
    { header: 'Veículo', value: (order) => order.vehicle_description || order.vehicle_plate || '-' },
    { header: 'Posto', value: (order) => order.fuel_station_name || '-' },
    { header: 'Telefone posto', value: (order) => order.fuel_station_phone || '-' },
    { header: 'Localização posto', value: (order) => order.fuel_station_maps_url || buildOrderMapsUrl(order) || '-' },
    { header: 'Secretaria', value: (order) => order.organization_name || '-' },
    { header: 'Solicitante', value: (order) => order.created_by_name || '-' },
    { header: 'Prazo', value: (order) => formatDate(order.expires_at) },
    { header: 'Litros previstos', value: (order) => order.requested_liters ?? '-' },
    { header: 'Código público', value: (order) => order.validation_code || '-' },
  ], [])

  const orderPdfExportColumns = useMemo(
    () => orderExportColumns.filter((column) => column.header !== 'Localização posto'),
    [orderExportColumns],
  )

  const orderReportColumns = useMemo(() => [
    { header: 'Ordem', value: (order) => formatOrderNumber(order) },
    { header: 'Emissão', value: (order) => formatDate(order.created_at) },
    { header: 'Situação', value: (order) => getOrderStatusLabel(order.status) },
    { header: 'Secretaria', value: (order) => order.organization_name || '-' },
    { header: 'Veículo', value: (order) => order.vehicle_description || order.vehicle_plate || '-' },
    { header: 'Posto', value: (order) => order.fuel_station_name || '-' },
    { header: 'Solicitante', value: (order) => order.created_by_name || '-' },
    { header: 'Litros previstos', value: (order) => formatNumber(order.requested_liters), align: 'right', width: 46 },
    { header: 'Abastecido em', value: (order) => formatDate(order.supply_supplied_at) },
    { header: 'Litros reais', value: (order) => formatNumber(order.supply_liters), align: 'right', width: 42 },
    { header: 'Valor real', value: (order) => formatCurrency(order.supply_total_amount), align: 'right', width: 56 },
    { header: 'Combustível', value: (order) => order.supply_fuel_type || '-' },
    { header: 'Odômetro', value: (order) => formatNumber(order.supply_odometer_km, 1), align: 'right', width: 50 },
  ], [])

  const organizationFilterOptions = useMemo(
    () => [{ value: '', label: 'Todas as secretarias' }, ...organizations.map((org) => ({ value: org.id, label: org.name }))],
    [organizations],
  )

  useEffect(() => {
    setCurrentHistoryPage(1)
  }, [search, filters])

  useEffect(() => {
    setCurrentOrdersPage(1)
  }, [orderSearch, orderFilters])

  async function handleCancelOrder(order) {
    if (!canEditOrder) {
      setError('Você não tem permissão para cancelar ordens de abastecimento.')
      return
    }
    setOrderToCancel(order)
  }

  function buildOrderReportFilters() {
    return [
      { label: 'Situação', value: orderFilters.status === 'TODOS' ? 'Todas as situações' : getOrderStatusLabel(orderFilters.status) },
      { label: 'Secretaria', value: organizations.find((org) => org.id === orderFilters.organization_id)?.name || 'Todas as secretarias' },
      { label: 'Posto', value: fuelStations.find((station) => station.id === orderFilters.fuel_station_id)?.name || 'Todos os postos' },
      orderFilters.created_from ? { label: 'Data inicial', value: formatDateOnly(orderFilters.created_from) } : null,
      orderFilters.created_to ? { label: 'Data final', value: formatDateOnly(orderFilters.created_to) } : null,
      orderSearch.trim() ? { label: 'Busca', value: orderSearch.trim() } : null,
    ].filter(Boolean)
  }

  function buildOrderReportMetrics(rows) {
    const completedRows = rows.filter((order) => order.status === 'COMPLETED')
    const totalLiters = completedRows.reduce((total, order) => total + Number(order.supply_liters || 0), 0)
    const totalAmount = completedRows.reduce((total, order) => total + Number(order.supply_total_amount || 0), 0)

    return [
      { label: 'Ordens no relatório', value: rows.length },
      { label: 'Abertas', value: rows.filter((order) => order.status === 'OPEN').length },
      { label: 'Concluídas', value: completedRows.length },
      { label: 'Litros reais', value: formatNumber(totalLiters) },
      { label: 'Valor real', value: formatCurrency(totalAmount) },
    ]
  }

  async function handlePreviewOrdersPdf() {
    if (ordersPagination.total === 0) {
      setFeedback('Não há ordens filtradas para pré-visualizar em PDF.')
      return
    }

    try {
      setError('')
      setFeedback('')
      const reportRows = await loadOrderReportRows()
      if (reportRows.length === 0) {
        setFeedback('Não há ordens filtradas para pré-visualizar em PDF.')
        return
      }
      await previewRowsToPdf({
        title: 'Frota PMTF - Ordens de abastecimento',
        fileName: 'frota-pmtf-ordens-abastecimento',
        subtitle: 'Relatório institucional das ordens emitidas para os postos credenciados.',
        columns: orderReportColumns,
        rows: reportRows,
        filters: buildOrderReportFilters(),
        summaryMetrics: buildOrderReportMetrics(reportRows),
        orientation: 'landscape',
      })
      setFeedback('Pré-visualização do PDF das ordens aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível gerar o PDF das ordens de abastecimento.'))
    }
  }

  async function handleExportOrdersXlsx() {
    if (ordersPagination.total === 0) {
      setFeedback('Não há ordens filtradas para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      const reportRows = await loadOrderReportRows()
      if (reportRows.length === 0) {
        setFeedback('Não há ordens filtradas para exportar.')
        return
      }
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-ordens-abastecimento',
        sheetName: 'Ordens de abastecimento',
        columns: orderReportColumns,
        rows: reportRows,
        filters: buildOrderReportFilters(),
      })
      setFeedback('Exportação das ordens em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível exportar as ordens em XLSX.'))
    }
  }

  async function handlePreviewOrderDocument(order) {
    try {
      setError('')
      await previewFuelSupplyOrderDocument(order)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível abrir o comprovante da ordem.'))
    }
  }

  async function handleDownloadOrderDocument(order) {
    try {
      setError('')
      await downloadFuelSupplyOrderDocument(order)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível baixar o comprovante da ordem.'))
    }
  }

  async function handleCopyPublicLink(order) {
    const publicUrl = resolvePublicValidationUrl(order.public_validation_path)
    if (!publicUrl) {
      setFeedback('Link público indisponível para esta ordem.')
      return
    }

    if (!navigator.clipboard) {
      setFeedback(`Link público: ${publicUrl}`)
      return
    }

    try {
      await navigator.clipboard.writeText(publicUrl)
      setFeedback(`Link público da ordem ${formatOrderNumber(order)} copiado com sucesso.`)
    } catch {
      setFeedback(`Link público: ${publicUrl}`)
    }
  }

  function clearHistoryFilters() {
    setSearch('')
    setFilters({ vehicle_id: '', organization_id: '', fuel_station_id: '', only_anomalies: '' })
  }

  function clearOrderFilters() {
    setOrderSearch('')
    setOrderFilters({ status: 'TODOS', organization_id: '', fuel_station_id: '', created_from: '', created_to: '' })
  }

  function openBatchOrderTour() {
    if (!canCreateOrder) return
    setIsBatchOrderModalOpen(true)
    setBatchTourReplayToken((current) => current + 1)
  }

  const batchTourSteps = useMemo(() => [
    {
      selector: '[data-tour="fuel-batch-create"]',
      title: 'Nova ordem em lote',
      description: 'Abra Nova ordem em lote no menu de ações para preparar várias ordens, mantendo a emissão individual disponível.',
      placement: 'bottom',
    },
    {
      selector: '[data-tour="fuel-batch-vehicles"]',
      title: 'Selecione os veículos',
      description: 'Marque dois ou mais veículos. O sistema emitirá uma ordem independente para cada seleção.',
    },
    {
      selector: '[data-tour="fuel-batch-liters"]',
      title: 'Ajuste os litros quando necessário',
      description: 'Defina um valor padrão e altere somente os veículos que precisarem de um limite diferente.',
    },
    {
      selector: '[data-tour="fuel-batch-review"]',
      title: 'Revise e emita',
      description: 'Confira os dados compartilhados e cada veículo antes de confirmar. Depois, cada ordem terá comprovante e acompanhamento próprios.',
    },
  ], [])

  return (
    <div className="surface-panel operation-page operation-page--fuel-supplies">
      <PageHeader
        title="Abastecimentos"
        inlineActions
        actions={<>
          {canCreateOrder ? <button className="app-button" type="button" onClick={() => setIsOrderModalOpen(true)}>Nova ordem</button> : null}
          <span data-tour="fuel-batch-create"><ActionMenu label="Mais ações de abastecimentos" items={[
            canCreateOrder && !searchParams.get('contract_id') && { label: 'Nova ordem em lote', onClick: () => setIsBatchOrderModalOpen(true) },
            canCreateOrder && !searchParams.get('contract_id') && { label: 'Ver guia rápido', onClick: openBatchOrderTour },
            { label: 'Atualizar listagem', onClick: () => activeView === 'orders' ? loadOrders() : loadRecords() },
            searchParams.get('contract_id') && { label: 'Operação geral', onClick: () => navigate('/abastecimentos') },
          ]} /></span>
        </>}
      />

      <ContractReturnBanner returnTo={searchParams.get('return_to')} />

      <div className="fuel-workspace-navigation">
        <nav aria-label="Áreas de abastecimento" className="fuel-workspace-views">
          {canViewOrders ? <button type="button" aria-pressed={activeView === 'orders'} aria-controls={activeView === 'orders' ? 'fuel-orders-workspace' : undefined} onClick={() => selectView('orders')}>Ordens</button> : null}
          <button type="button" aria-pressed={activeView === 'history'} aria-controls={activeView === 'history' ? 'fuel-history-workspace' : undefined} onClick={() => selectView('history')}>Histórico</button>
        </nav>
        <div className="fuel-workspace-tools">
          <Link className="fuel-stations-link" to="/postos?indicator=active">Postos ({fuelStations.length})</Link>
          {activeView === 'orders' ? <ActionMenu label="Exportar ordens" items={[
            { label: 'Pré-visualizar PDF', onClick: handlePreviewOrdersPdf },
            { label: 'Exportar XLSX', onClick: handleExportOrdersXlsx },
          ]} /> : null}
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      {lastIssuedOrder ? (
        <div className="table-focus-banner">
          <div>
            <strong>Comprovante institucional disponível para {formatOrderNumber(lastIssuedOrder)}</strong>
            <span>
              O documento oficial já pode ser pré-visualizado, baixado em PDF ou compartilhado pelo link público com
              validação por QR Code.
            </span>
          </div>
          <div className="actions-inline">
            <button className="app-button" type="button" onClick={() => handlePreviewOrderDocument(lastIssuedOrder)}>Abrir comprovante</button>
            <button className="secondary-button" type="button" onClick={() => handleDownloadOrderDocument(lastIssuedOrder)}>Baixar PDF</button>
            <button className="ghost-button" type="button" onClick={() => handleCopyPublicLink(lastIssuedOrder)}>Copiar link público</button>
          </div>
        </div>
      ) : null}

      {activeView === 'orders' ? <section id="fuel-orders-workspace" aria-label="Ordens de abastecimento" className="fuel-workspace operation-module operation-module--orders">
        <div className="operation-toolbar filter-inline">
          <input className="app-input" aria-label="Buscar ordens" placeholder="Buscar ordem por placa, secretaria, posto, solicitante ou observação" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} />
          <MobileFilters collapsibleDesktop activeCount={Object.entries(orderFilters).filter(([key, value]) => value && !(key === 'status' && value === 'TODOS')).length}>
          <select className="app-select" aria-label="Situação das ordens" value={orderFilters.status} onChange={(event) => setOrderFilters((prev) => ({ ...prev, status: event.target.value }))}>
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <SearchableSelect
            value={orderFilters.organization_id}
            onChange={(value) => setOrderFilters((prev) => ({ ...prev, organization_id: value }))}
            options={organizationFilterOptions}
            placeholder="Filtrar secretaria"
            searchPlaceholder="Buscar secretaria"
          />
          <SearchableSelect
            value={orderFilters.fuel_station_id}
            onChange={(value) => setOrderFilters((prev) => ({ ...prev, fuel_station_id: value }))}
            options={[{ value: '', label: 'Todos os postos' }, ...fuelStations.map(buildStationOption)]}
            placeholder="Filtrar posto"
            searchPlaceholder="Buscar posto"
          />
          <label className="form-field filter-date-field">
            <span>Data inicial</span>
            <input
              className="app-input"
              type="date"
              value={orderFilters.created_from}
              onChange={(event) => setOrderFilters((prev) => ({ ...prev, created_from: event.target.value }))}
              aria-label="Data inicial da emissão"
              title="Data inicial da emissão"
            />
          </label>
          <label className="form-field filter-date-field">
            <span>Data final</span>
            <input
              className="app-input"
              type="date"
              value={orderFilters.created_to}
              onChange={(event) => setOrderFilters((prev) => ({ ...prev, created_to: event.target.value }))}
              aria-label="Data final da emissão"
              title="Data final da emissão"
            />
          </label>
          <button className="ghost-button" type="button" onClick={clearOrderFilters}>Limpar filtros</button>
          </MobileFilters>
        </div>

        <IndicatorBar label="Indicadores das ordens" state={{ selected: orderIndicator, metadata: orderIndicatorMetadata, select: (key) => selectWorkspaceIndicator('order_indicator', key, 'orders') }} loading={ordersLoading} error={error} resultCount={ordersPagination.total} />
        <div className="table-wrap table-wrap-wide operation-table-card">
          <table className="data-table data-table-wide operation-table">
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Veículo</th>
                <th>Posto</th>
                <th>Situação</th>
                <th>Prazo</th>
                <th>Solicitante</th>
                <th>Litros previstos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {ordersLoading ? <tr><td colSpan={8} className="muted">Carregando ordens...</td></tr> : null}
              {!ordersLoading && paginatedOrders.length === 0 ? <tr><td colSpan={8}><div className="empty-state">Nenhuma ordem encontrada para os filtros aplicados.</div></td></tr> : null}
              {!ordersLoading && paginatedOrders.map((order) => (
                <ResponsiveRecord key={order.id} label={order.vehicle_plate} identityLabel="Veículo" statusLabel="Situação" summaryLabels={["Ordem", "Posto", "Prazo"]}>
                  <td data-label="Ordem"><strong>{formatOrderNumber(order)}</strong></td>
                  <td data-label="Veículo">
                    <div className="operation-vehicle-identity">
                      <VehicleThumbnail vehicleType={order.vehicle_type} plate={order.vehicle_plate} />
                      <span>
                      <strong>{order.vehicle_plate || '-'}</strong>
                      <span className="muted">{order.organization_name || 'Sem secretaria informada'}</span>
                      </span>
                    </div>
                  </td>
                  <td data-label="Posto">
                    <div className="stack">
                      <strong>{order.fuel_station_name || '-'}</strong>
                      <span className="muted">{order.fuel_station_phone || 'Telefone não informado'}</span>
                      {buildOrderMapsUrl(order) ? (
                        <a className="link-inline" href={buildOrderMapsUrl(order)} target="_blank" rel="noreferrer">Abrir mapa</a>
                      ) : (
                        <span className="muted">Sem localização</span>
                      )}
                    </div>
                  </td>
                  <td data-label="Situação">
                    <StatusChip tone={getOrderStatusTone(order.status)}>{getOrderStatusLabel(order.status)}</StatusChip>
                  </td>
                  <td data-label="Prazo">{formatDate(order.expires_at)}</td>
                  <td data-label="Solicitante">
                    <div className="stack">
                      <strong>{order.created_by_name || '-'}</strong>
                      <span className="muted">{order.organization_name || 'Sem secretaria informada'}</span>
                    </div>
                  </td>
                  <td data-label="Litros previstos">{formatNumber(order.requested_liters)}</td>
                  <td data-label="Ações">
                    <div className="operation-row-actions">
                      <button type="button" className="mini-button" onClick={() => handlePreviewOrderDocument(order)}>Comprovante</button>
                      <ActionMenu
                        label={`Mais ações da ordem ${formatOrderNumber(order)}`}
                        items={[
                          { key: 'public-link', label: 'Copiar link público', onClick: () => handleCopyPublicLink(order) },
                          { key: 'pdf', label: 'Baixar PDF', onClick: () => handleDownloadOrderDocument(order) },
                          canAdjustOrderDeadline && ['OPEN', 'EXPIRED'].includes(order.status) ? { key: 'deadline', label: control.enabled && !hasContractFunding(order) ? 'Vincular contrato e reservar' : order.status === 'EXPIRED' ? 'Reabrir prazo' : 'Prorrogar prazo', onClick: () => setOrderToAdjust(order) } : null,
                          order.status === 'OPEN' && canEditOrder ? { key: 'cancel', label: 'Cancelar ordem', tone: 'danger', onClick: () => handleCancelOrder(order) } : null,
                        ]}
                      />
                    </div>
                  </td>
                </ResponsiveRecord>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentOrdersPage} totalPages={totalOrdersPages} onPageChange={setCurrentOrdersPage} />
      </section> : null}

      {activeView === 'history' ? <section id="fuel-history-workspace" aria-label="Histórico de abastecimentos" className="fuel-workspace operation-module operation-module--fuel-history">
        <div className="operation-toolbar filter-inline">
          <input className="app-input" aria-label="Buscar abastecimentos confirmados" placeholder="Buscar por placa, secretaria, posto, combustível ou aditivo" value={search} onChange={(event) => setSearch(event.target.value)} />
          <MobileFilters collapsibleDesktop activeCount={Object.values(filters).filter(Boolean).length}>
          <SearchableSelect value={filters.vehicle_id} onChange={(value) => setFilters((prev) => ({ ...prev, vehicle_id: value }))} options={[{ value: '', label: 'Todos os veículos' }, ...(filters.vehicle_id && !vehicles.some((item) => item.id === filters.vehicle_id) ? [{ value: filters.vehicle_id, label: 'Veiculo do historico de emprestimo' }] : []), ...vehicles.map(buildVehicleOption)]} onOpen={refreshVehicleOptions} placeholder="Filtrar veículo" />
          <SearchableSelect value={filters.organization_id} onChange={(value) => setFilters((prev) => ({ ...prev, organization_id: value }))} options={organizationFilterOptions} placeholder="Filtrar secretaria" />
          <SearchableSelect value={filters.fuel_station_id} onChange={(value) => setFilters((prev) => ({ ...prev, fuel_station_id: value }))} options={[{ value: '', label: 'Todos os postos' }, ...fuelStations.map(buildStationOption)]} placeholder="Filtrar posto" />
          <select className="app-input" aria-label="Alertas de consumo" value={filters.only_anomalies} onChange={(event) => setFilters((prev) => ({ ...prev, only_anomalies: event.target.value }))}>
            <option value="">Todos</option>
            <option value="true">Somente alertas</option>
          </select>
          <button className="ghost-button" type="button" onClick={clearHistoryFilters}>Limpar filtros</button>
          </MobileFilters>
        </div>

        <IndicatorBar label="Indicadores dos abastecimentos" state={{ selected: indicator, metadata: indicatorMetadata, select: (key) => selectWorkspaceIndicator('indicator', key, 'history') }} loading={historyLoading} error={error} resultCount={historyPagination.total} />
        <div className="table-wrap table-wrap-wide operation-table-card">
          <table className="data-table data-table-wide operation-table">
            <thead>
              <tr>
                <th>Veículo</th>
                <th>Data</th>
                <th>Secretaria</th>
                <th>Posto</th>
                <th>Litros</th>
                <th>Valor</th>
                <th>Combustível</th>
                <th>Aditivo</th>
                <th>Km/l</th>
                <th>Alerta</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading ? <tr><td colSpan={11} className="muted">Carregando abastecimentos...</td></tr> : null}
              {!historyLoading && paginatedRecords.length === 0 ? <tr><td colSpan={11}><div className="empty-state">Nenhum abastecimento encontrado.</div></td></tr> : null}
              {!historyLoading && paginatedRecords.map((record) => (
                <ResponsiveRecord key={record.id} label={record.vehicle_plate} identityLabel="Veículo" statusLabel="Status" summaryLabels={["Data", "Litros", "Valor", "Alerta"]}>
                  <td data-label="Veículo"><div className="operation-vehicle-identity"><VehicleThumbnail vehicleType={record.vehicle_type} plate={record.vehicle_plate} /><strong>{record.vehicle_plate}</strong></div></td>
                  <td data-label="Data">{formatDate(record.supplied_at)}</td>
                  <td data-label="Secretaria">{record.organization_name || '-'}</td>
                  <td data-label="Posto">{record.fuel_station_name || record.fuel_station || '-'}</td>
                  <td data-label="Litros">{formatNumber(record.liters)}</td>
                  <td data-label="Valor">{formatCurrency(record.total_amount)}</td>
                  <td data-label="Combustível">{record.fuel_type || '-'}</td>
                  <td data-label="Aditivo">{formatAdditiveDetails(record, formatNumber)}</td>
                  <td data-label="Km/l">{formatNumber(record.consumption_km_l)}</td>
                  <td data-label="Alerta">{record.is_consumption_anomaly ? <FuelSupplyAlertBadge record={record} onOpen={setAlertSupply}
                    summaryOpen={activeAlertSummary === record.id} onSummaryOpen={() => setActiveAlertSummary(record.id)} /> : <StatusChip tone="success">Regular</StatusChip>}</td>
                  <td data-label="Ações">
                    <div className="actions-inline">
                      <a className="mini-button" href={record.receipt_url} target="_blank" rel="noreferrer">Comprovante</a>
                      {canRectifySupply && record.fuel_supply_order_id ? (
                        <button className="mini-button" type="button" onClick={() => setSupplyToRectify(record)}>Retificar</button>
                      ) : null}
                    </div>
                  </td>
                </ResponsiveRecord>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentHistoryPage} totalPages={totalHistoryPages} onPageChange={setCurrentHistoryPage} />
      </section> : null}

      <Modal open={Boolean(alertSupply)} onClose={() => setAlertSupply(null)}
        title={`Alerta de abastecimento${alertSupply?.vehicle_plate ? ` — ${alertSupply.vehicle_plate}` : ''}`}
        className="fuel-alert-drawer" backdropClassName="fuel-alert-backdrop">
        {alertSupply && <>
          <h4 className="section-title">Motivo do alerta</h4>
          <p className="fuel-alert-reason">{fuelSupplyAlertReason(alertSupply)}</p>
          <dl className="fuel-alert-facts">
            {[
              ['Veículo', alertSupply.vehicle_plate || 'Não informado'],
              ['Data do abastecimento', formatDate(alertSupply.supplied_at)],
              ['Secretaria', alertSupply.organization_name || 'Não informada'],
              ['Posto', alertSupply.fuel_station_name || alertSupply.fuel_station || 'Não informado'],
              ['Combustível', alertSupply.fuel_type || 'Não informado'],
              ['Litros abastecidos', formatNumber(alertSupply.liters)],
              ['Valor registrado', formatCurrency(alertSupply.total_amount)],
              ['Hodômetro (km)', formatNumber(alertSupply.odometer_km)],
              ['Rendimento registrado (km/l)', formatNumber(alertSupply.consumption_km_l)],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <p className="section-copy">Fonte: motivo registrado no abastecimento. Este alerta de consumo é um sinal para conferência e não comprova irregularidade.</p>
        </>}
      </Modal>

      <Modal open={isOrderModalOpen && canCreateOrder} onClose={() => setIsOrderModalOpen(false)} title="Nova ordem de abastecimento" description="Emita a ordem para um posto credenciado executar o abastecimento.">
        <FuelSupplyOrderCreateForm
          initialContractId={searchParams.get('contract_id') || ''}
          returnTo={searchParams.get('return_to') || ''}
          vehicles={vehicles} onVehicleOptionsOpen={refreshVehicleOptions}
          organizations={organizations}
          fuelStations={fuelStations}
          onClose={() => setIsOrderModalOpen(false)}
          onSuccess={({ message, order }) => {
            setFeedback(message)
            setLastIssuedOrder(order || null)
            refreshOrdersAfterIssue()
          }}
        />
      </Modal>

      <Modal open={Boolean(orderToCancel)} title={`Cancelar ordem ${orderToCancel ? formatOrderNumber(orderToCancel) : ''}`}
        description="Confirme o cancelamento da ordem de abastecimento. O motivo é opcional."
        canClose={!cancellingOrder} onClose={() => setOrderToCancel(null)}>
        {orderToCancel && <FuelSupplyOrderCancelForm order={orderToCancel} onBusy={setCancellingOrder}
          onClose={() => setOrderToCancel(null)} onSaved={() => {
            setFeedback(`Ordem ${formatOrderNumber(orderToCancel)} cancelada com sucesso.`)
            setOrderToCancel(null)
            refreshOrdersAfterIssue()
          }} />}
      </Modal>
      <Modal
        open={isBatchOrderModalOpen && canCreateOrder}
        onClose={() => setIsBatchOrderModalOpen(false)}
        title="Nova ordem de abastecimento em lote"
        description="Emita ordens separadas para vários veículos, com posto, prazo e observações compartilhados."
      >
        <FuelSupplyOrderBatchCreateForm
          vehicles={vehicles}
          organizations={organizations}
          fuelStations={fuelStations}
          onClose={() => setIsBatchOrderModalOpen(false)}
          onSuccess={({ message }) => {
            setFeedback(message)
            setLastIssuedOrder(null)
            refreshOrdersAfterIssue()
          }}
        />
      </Modal>

      {batchTourReplayToken > 0 ? (
        <GuidedTour
          steps={batchTourSteps}
          storageKey="frota-fuel-supply-orders-batch-tour-v1"
          replayToken={batchTourReplayToken}
        />
      ) : null}

      <Modal
        open={Boolean(supplyToRectify) && canRectifySupply}
        onClose={() => setSupplyToRectify(null)}
        title="Retificar confirmação de abastecimento"
        description="Corrija os dados confirmados ou substitua o comprovante, mantendo os valores anteriores e a justificativa na auditoria."
      >
        {supplyToRectify ? (
          <FuelSupplyRectifyForm
            record={supplyToRectify}
            onClose={() => setSupplyToRectify(null)}
            onSuccess={(message) => {
              setFeedback(message)
              loadRecords()
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(orderToAdjust) && canAdjustOrderDeadline}
        onClose={() => setOrderToAdjust(null)}
        title={control.enabled && !hasContractFunding(orderToAdjust) ? 'Vincular contrato e reservar' : orderToAdjust?.status === 'EXPIRED' ? 'Reabrir prazo da ordem' : 'Prorrogar prazo da ordem'}
        description="Defina um novo prazo e informe a justificativa obrigatória para a auditoria."
      >
        {orderToAdjust ? (
          <FuelSupplyOrderDeadlineForm
            order={orderToAdjust}
            onClose={() => setOrderToAdjust(null)}
            onSuccess={(message) => {
              setFeedback(message)
              loadOrders()
            }}
          />
        ) : null}
      </Modal>
    </div>
  )
}
