import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import FuelSupplyOrderConfirmForm from '../components/FuelSupplyOrderConfirmForm'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { getApiErrorMessage } from '../utils/apiError'
import { previewFuelSupplyOrderDocument } from '../utils/fuelSupplyOrderDocument'

const OPEN_ORDERS_FETCH_LIMIT = 100

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '-'
  return Number(value).toFixed(digits)
}

function formatOrderNumber(order) {
  if (order.request_number) return order.request_number
  return `AB-${String(order.id).slice(0, 8).toUpperCase()}`
}

function pickDeadline(order) {
  return order.deadline_at || order.due_at || order.expected_supply_until || order.expected_at || null
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
    if (lateMinutes < 60) return { label: `Expirada ha ${lateMinutes} min`, tone: 'danger', minutesRemaining }
    const lateHours = Math.round(lateMinutes / 60)
    return { label: `Expirada ha ${lateHours} h`, tone: 'danger', minutesRemaining }
  }

  if (minutesRemaining <= 60) {
    return { label: `Restam ${minutesRemaining} min`, tone: 'warning', minutesRemaining }
  }

  const hoursRemaining = Math.round(minutesRemaining / 60)
  return { label: `Restam ${hoursRemaining} h`, tone: 'success', minutesRemaining }
}

export default function FuelSupplyOrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedOrder, setSelectedOrder] = useState(null)

  async function loadOrders() {
    try {
      setLoading(true)
      setError('')
      const { data } = await fuelSupplyOrdersAPI.listOpen({ limit: OPEN_ORDERS_FETCH_LIMIT, page: 1 })
      const payload = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
      setOrders(payload)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar as ordens abertas de abastecimento.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
  }, [])

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter((order) => {
      if (!term) return true
      return [
        order.request_number,
        order.vehicle_plate,
        order.created_by_name,
        order.driver_name,
        order.fuel_station_name,
        order.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [orders, search])

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / 10))
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * 10, currentPage * 10)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, orders.length])

  async function handlePreviewOrderDocument(order) {
    try {
      setError('')
      await previewFuelSupplyOrderDocument(order)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel abrir o comprovante da ordem.'))
    }
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Ordens de abastecimento abertas</h2>
          <p className="section-copy">Confirme abastecimentos pendentes e acompanhe prazos em tempo real.</p>
        </div>
      </div>

      <div className="toolbar-card">
        <div className="filter-inline">
          <input
            className="app-input"
            placeholder="Buscar por placa, solicitante, condutor ou numero"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="ghost-button" type="button" onClick={loadOrders}>Atualizar</button>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Veiculo</th>
                <th>Posto</th>
                <th>Solicitada em</th>
                <th>Prazo</th>
                <th>Condutor</th>
                <th>Litros previstos</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="muted">Carregando ordens de abastecimento...</td></tr> : null}
              {!loading && paginatedOrders.length === 0 ? <tr><td colSpan={8}><div className="empty-state">Nenhuma ordem aberta encontrada.</div></td></tr> : null}
              {!loading && paginatedOrders.map((order) => {
                const deadlineMeta = getDeadlineMeta(order)
                return (
                  <tr key={order.id}>
                    <td data-label="Ordem">{formatOrderNumber(order)}</td>
                    <td data-label="Veiculo">{order.vehicle_plate || '-'}</td>
                    <td data-label="Posto">{order.fuel_station_name || '-'}</td>
                    <td data-label="Solicitada em">{formatDate(order.requested_at || order.created_at)}</td>
                    <td data-label="Prazo">
                      <div>{formatDate(pickDeadline(order))}</div>
                      <span className={`deadline-pill ${deadlineMeta.tone}`}>{deadlineMeta.label}</span>
                    </td>
                    <td data-label="Condutor">{order.driver_name || order.created_by_name || '-'}</td>
                    <td data-label="Litros previstos">{formatNumber(order.requested_liters)}</td>
                    <td data-label="Acoes">
                      <div className="actions-inline">
                        <button className="mini-button" type="button" onClick={() => handlePreviewOrderDocument(order)}>Comprovante</button>
                        <button className="app-button" type="button" onClick={() => setSelectedOrder(order)}>Confirmar abastecimento</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>

      <Modal
        open={Boolean(selectedOrder)}
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
    </div>
  )
}
