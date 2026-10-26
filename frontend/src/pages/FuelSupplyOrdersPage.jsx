import IndicatorBar from '../components/ui/IndicatorBar'
import { useInteractiveKpis } from '../hooks/useInteractiveKpis'
import { useContractControl } from '../hooks/useContractFunding'
import FuelOrderFundingForm from '../components/contracts/FuelOrderFundingForm'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Modal from '../components/Modal'
import DocumentSignaturePanel from '../components/DocumentSignaturePanel'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import FuelSupplyOrderConfirmForm from '../components/FuelSupplyOrderConfirmForm'
import { MobileFilters, ResponsiveRecord, ActionMenu, PageHeader, StatusChip, VehicleThumbnail } from '../components/ui'
import { DIGITAL_DOCUMENT_TYPES } from '../api/documentSignatures'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { useAuth } from '../context/AuthContext'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { previewFuelSupplyOrderDocument } from '../utils/fuelSupplyOrderDocument'


function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '-'
  return Number(value).toFixed(digits)
}

function buildOrderMapsUrl(order) {
  if (order.fuel_station_maps_url) return order.fuel_station_maps_url
  if (order.fuel_station_latitude === null || order.fuel_station_latitude === undefined) return ''
  if (order.fuel_station_longitude === null || order.fuel_station_longitude === undefined) return ''
  const latitude = Number(order.fuel_station_latitude).toFixed(6)
  const longitude = Number(order.fuel_station_longitude).toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`
}

function formatOrderNumber(order) {
  if (order.request_number) return order.request_number
  return `AB-${String(order.id).slice(0, 8).toUpperCase()}`
}

function pickDeadline(order) {
  return order.expires_at || order.deadline_at || order.due_at || order.expected_supply_until || order.expected_at || null
}

function getDeadlineMeta(order) {
  const deadline = pickDeadline(order)
  if (!deadline) return { label: 'Sem prazo', tone: 'neutral', minutesRemaining: null }

  const target = new Date(deadline)
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()
  const minutesRemaining = Math.round(diffMs / 60000)

  if (minutesRemaining < 0) {
    const lateMinutes = Math.abs(minutesRemaining)
    if (lateMinutes < 60) return { label: `Expirada há ${lateMinutes} min`, tone: 'danger', minutesRemaining }
    const lateHours = Math.round(lateMinutes / 60)
    return { label: `Expirada há ${lateHours} h`, tone: 'danger', minutesRemaining }
  }

  if (minutesRemaining <= 60) {
    return { label: `Restam ${minutesRemaining} min`, tone: 'warning', minutesRemaining }
  }

  const hoursRemaining = Math.round(minutesRemaining / 60)
  return { label: `Restam ${hoursRemaining} h`, tone: 'success', minutesRemaining }
}

export default function FuelSupplyOrdersPage() {
  const { selected: indicator, metadata: indicatorMetadata, setMetadata: setIndicators, select: selectIndicator } = useInteractiveKpis()
  useEffect(() => { setCurrentPage(1) }, [indicator])

  const [searchParams, setSearchParams] = useSearchParams()
  const focusedOrderId = searchParams.get('focus')
  const { canEdit, isAdmin, isProduction } = useAuth()
  const control = useContractControl()
  const [fundingOrder, setFundingOrder] = useState(null)
  const canConfirmOrder = canEdit('fuel_supply_orders')
  const { organizations } = useMasterDataCatalog({ organizationsOnly: true })
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState({ pages: 1, total: 0 })
  const listRequest = useRef(0)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [signatureOrder, setSignatureOrder] = useState(null)

  const organizationOptions = useMemo(
    () => [{ value: '', label: 'Todas as secretarias' }, ...organizations.map((organization) => ({ value: organization.id, label: organization.name }))],
    [organizations],
  )

  async function loadOrders(page = currentPage) {
    const request = ++listRequest.current
    try {
      setLoading(true)
      setError('')
      const { data } = await fuelSupplyOrdersAPI.listOpen({ indicator: indicator === 'total' ? undefined : indicator,
        limit: 10,
        page,
        organization_id: organizationFilter || undefined,
        search: search.trim() || undefined,
      })
      if (request !== listRequest.current) return
      if (page > data.pagination.pages) {
        setCurrentPage(data.pagination.pages)
        return
      }
      setOrders(data.data || [])
      setPagination(data.pagination); setIndicators(data.indicators || null)
    } catch (err) {
      if (request === listRequest.current) setError(getApiErrorMessage(err, 'Não foi possível carregar as ordens abertas de abastecimento.'))
    } finally {
      if (request === listRequest.current) setLoading(false)
    }
  }

  useEffect(() => {
    listRequest.current += 1
    const timer = setTimeout(() => loadOrders(), search.trim() ? 250 : 0)
    return () => clearTimeout(timer)
  }, [currentPage, organizationFilter, search, indicator])

  useEffect(() => {
    if (!focusedOrderId) return undefined
    let mounted = true
    fuelSupplyOrdersAPI.getById(focusedOrderId)
      .then(({ data }) => {
        if (mounted) setSignatureOrder(data)
      })
      .catch((err) => {
        if (mounted) setError(getApiErrorMessage(err, 'Não foi possível abrir a ordem vinculada à assinatura pendente.'))
      })
    return () => {
      mounted = false
    }
  }, [focusedOrderId])

  const totalPages = pagination.pages
  const paginatedOrders = orders

  useEffect(() => {
    setCurrentPage(1)
  }, [search, organizationFilter, indicator])

  async function handlePreviewOrderDocument(order) {
    try {
      setError('')
      await previewFuelSupplyOrderDocument(order)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível abrir o comprovante da ordem.'))
    }
  }

  function handleOrderSignatureChanged(summary) {
    if (!signatureOrder) return
    const nextOrder = { ...signatureOrder, signature_summary: summary }
    setSignatureOrder(nextOrder)
    setOrders((current) => current.map((order) => (order.id === signatureOrder.id ? nextOrder : order)))
  }

  function closeSignatureOrder() {
    setSignatureOrder(null)
    if (!focusedOrderId) return
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="surface-panel operation-page operation-page--open-orders">
      <PageHeader
        title="Ordens de abastecimento abertas"
        description="Confirme abastecimentos pendentes e acompanhe prazos em tempo real."
      />

      <div className="toolbar-card operation-toolbar">
        <div className="filter-inline">
          <input
            className="app-input"
            placeholder="Buscar por placa, secretaria, solicitante, posto ou número"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <MobileFilters activeCount={organizationFilter ? 1 : 0}>
          <SearchableSelect
            value={organizationFilter}
            onChange={setOrganizationFilter}
            options={organizationOptions}
            placeholder="Filtrar secretaria"
            searchPlaceholder="Buscar secretaria"
          />
          <button className="ghost-button" type="button" onClick={loadOrders}>Atualizar</button>
          </MobileFilters>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested operation-module">
        <IndicatorBar state={{ selected: indicator, metadata: indicatorMetadata ? { ...indicatorMetadata, items: indicatorMetadata.items.filter((item) => ['total', 'open', 'due_today', 'expires_soon'].includes(item.key)) } : null, select: selectIndicator }} loading={loading} error={error} resultCount={pagination.total} />
      <div className="table-wrap table-wrap-wide operation-table-card">
          <table className="data-table data-table-wide operation-table">
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Veículo</th>
                <th>Posto</th>
                <th>Solicitada em</th>
                <th>Prazo</th>
                <th>Solicitante</th>
                <th>Litros previstos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="muted">Carregando ordens de abastecimento...</td></tr> : null}
              {!loading && paginatedOrders.length === 0 ? <tr><td colSpan={8}><div className="empty-state">Nenhuma ordem aberta encontrada.</div></td></tr> : null}
              {!loading && paginatedOrders.map((order) => {
                const deadlineMeta = getDeadlineMeta(order)
                return (
                  <ResponsiveRecord key={order.id} label={order.vehicle_plate} identityLabel="Veículo" summaryLabels={["Ordem", "Posto", "Prazo"]}>
                    <td data-label="Ordem">{formatOrderNumber(order)}</td>
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
                        <span className="muted">{order.fuel_station_phone || 'Telefone do posto não informado'}</span>
                        {buildOrderMapsUrl(order) ? (
                          <a className="link-inline" href={buildOrderMapsUrl(order)} target="_blank" rel="noreferrer">Abrir mapa</a>
                        ) : (
                          <span className="muted">Sem localização</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Solicitada em">{formatDate(order.requested_at || order.created_at)}</td>
                    <td data-label="Prazo">
                      <div>{formatDate(pickDeadline(order))}</div>
                      <StatusChip tone={deadlineMeta.tone}>{deadlineMeta.label}</StatusChip>
                    </td>
                    <td data-label="Solicitante">
                      <div className="stack">
                        <strong>{order.created_by_name || 'Não informado'}</strong>
                        <span className="muted">{order.organization_name || 'Sem secretaria informada'}</span>
                      </div>
                    </td>
                    <td data-label="Litros previstos">{formatNumber(order.requested_liters)}</td>
                    <td data-label="Ações">
                      <div className="operation-row-actions">
                        {control.enabled && !order.contract_reservation_id ? (isAdmin || isProduction) && canConfirmOrder
                          ? <button className="app-button" type="button" onClick={() => setFundingOrder(order)}>Vincular contrato e reservar</button>
                          : <span className="muted">Aguarda vínculo contratual e reserva pela equipe emissora.</span>
                          : canConfirmOrder ? <button className="app-button" type="button" onClick={() => setSelectedOrder(order)}>Confirmar abastecimento</button> : null}
                        <ActionMenu
                          label={`Mais ações da ordem ${formatOrderNumber(order)}`}
                          items={[
                            { key: 'receipt', label: 'Abrir comprovante', onClick: () => handlePreviewOrderDocument(order) },
                            { key: 'signature', label: 'Consultar assinatura', onClick: () => setSignatureOrder(order) },
                          ]}
                        />
                      </div>
                    </td>
                  </ResponsiveRecord>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>

      <Modal
        open={Boolean(selectedOrder) && canConfirmOrder}
        onClose={() => setSelectedOrder(null)}
        title="Confirmar abastecimento"
        description="Informe os dados reais do abastecimento para concluir a ordem."
      >
        {selectedOrder ? (
          <FuelSupplyOrderConfirmForm
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onSuccess={(message) => {
              setFeedback(message)
              loadOrders()
            }}
          />
        ) : null}
      </Modal>

      <Modal open={Boolean(fundingOrder)} onClose={() => setFundingOrder(null)} title="Vincular contrato e reservar">
        {fundingOrder ? <FuelOrderFundingForm order={fundingOrder} onClose={() => setFundingOrder(null)} onSuccess={(message) => { setFeedback(message); loadOrders() }} /> : null}
      </Modal>

      <Modal
        open={Boolean(signatureOrder)}
        onClose={closeSignatureOrder}
        title="Assinatura da ordem"
        description={signatureOrder ? `Assinatura eletrônica institucional da ordem ${formatOrderNumber(signatureOrder)}.` : ''}
      >
        {signatureOrder ? (
          <DocumentSignaturePanel
            documentType={DIGITAL_DOCUMENT_TYPES.FUEL_SUPPLY_ORDER}
            sourceId={signatureOrder.id}
            summary={signatureOrder.signature_summary}
            title="Assinatura da ordem de abastecimento"
            onChanged={handleOrderSignatureChanged}
            readOnly={!canConfirmOrder}
          />
        ) : null}
      </Modal>
    </div>
  )
}
