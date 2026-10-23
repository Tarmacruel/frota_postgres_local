import { maintenanceAPI } from '../api/maintenance'
import { maintenanceOrdersAPI } from '../api/contractControl'

export const orderIndicators = ['authorized', 'cancelled']

export function maintenanceState(record) {
  if (record._order) return record._order.status === 'AUTHORIZED' ? 'AUTORIZADA' : 'CANCELADA'
  return record.end_date ? 'CONCLUÍDA' : 'EM ANDAMENTO'
}

function orderRecord(order) {
  return { ...order, id: `order:${order.id}`, _order: order, start_date: null, end_date: null,
    total_cost: null, parts_replaced: null, updated_at: order.updated_at || order.created_at }
}

// Only orders without a service belong to this queue. Started/completed orders
// already have a maintenance record, which remains the canonical table row.
export async function loadUnstartedMaintenanceOrders(params = {}) {
  async function collect(status) {
    const rows = []
    let page = 1
    while (true) {
      const { data } = await maintenanceOrdersAPI.list({ ...params, status, page, limit: 100 })
      rows.push(...data.data.filter((row) => !row.maintenance_record_id))
      if (page >= data.pages) return rows
      page += 1
    }
  }
  const [authorized, cancelled] = await Promise.all([collect('AUTHORIZED'), collect('CANCELLED')])
  return { authorized, cancelled }
}

export function filterUnstartedOrders(orders, { search = '', unassigned = false, vehicles = [] } = {}) {
  const query = search.trim().toLocaleLowerCase('pt-BR')
  const byId = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))
  function matches(row) {
    const vehicle = byId.get(row.vehicle_id)
    if (unassigned && (row.organization_name || vehicle?.current_location?.organization_id)) return false
    return !query || [row.vehicle_plate, row.service_description, row.organization_name,
      vehicle?.current_location?.organization_name].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(query)
  }
  return { authorized: orders.authorized.filter(matches), cancelled: orders.cancelled.filter(matches) }
}

export async function loadMaintenanceWorkspace({ params, orders, page = 1, limit = 10, status = 'TODAS', indicator = 'total' }) {
  const focused = Boolean(params.focus_id)
  const orderOnly = !focused && (orderIndicators.includes(indicator) || orderIndicators.includes(status))
  const recordOnly = focused || (!orderOnly && (indicator !== 'total' || status !== 'TODAS'))
  const authorized = !recordOnly && indicator !== 'cancelled' && status !== 'cancelled' ? orders.authorized : []
  const cancelled = !recordOnly && indicator !== 'authorized' && status !== 'authorized' ? orders.cancelled : []
  const offset = (page - 1) * limit
  const recordOffset = Math.max(0, offset - authorized.length)
  const recordPage = orderOnly || offset < authorized.length ? 1 : Math.floor(recordOffset / limit) + 1
  const { data: first } = await maintenanceAPI.listPaginated({ ...params, indicator: orderOnly ? undefined : params.indicator, page: recordPage, limit })
  const recordTotal = orderOnly ? 0 : first.pagination.total
  const total = authorized.length + recordTotal + cancelled.length
  const result = authorized.slice(offset, offset + limit).map(orderRecord)
  const recordSlots = Math.min(limit - result.length, Math.max(0, recordTotal - recordOffset))
  if (recordSlots > 0 && offset < authorized.length + recordTotal) {
    const skip = recordOffset % limit
    let records = first.data
    if (skip + recordSlots > records.length && recordPage < first.pagination.pages) {
      const { data: next } = await maintenanceAPI.listPaginated({ ...params, page: recordPage + 1, limit })
      records = [...records, ...next.data]
    }
    result.push(...records.slice(skip, skip + recordSlots))
  }
  if (result.length < limit) {
    const cancelledOffset = Math.max(0, offset - authorized.length - recordTotal)
    result.push(...cancelled.slice(cancelledOffset, cancelledOffset + limit - result.length).map(orderRecord))
  }
  const baseItems = first.indicators?.items || []
  const includeOrderCounts = !focused && (status === 'TODAS' || orderIndicators.includes(status))
  const authorizedCount = includeOrderCounts ? orders.authorized.length : 0
  const cancelledCount = includeOrderCounts ? orders.cancelled.length : 0
  const items = baseItems.map((item) => item.key === 'total' ? { ...item, value: Number(item.value) + authorizedCount + cancelledCount } : item)
  items.splice(1, 0, { key: 'authorized', label: 'Autorizadas', value: authorizedCount, tone: 'info' })
  const closedIndex = items.findIndex((item) => item.key === 'closed')
  items.splice(closedIndex >= 0 ? closedIndex + 1 : items.length, 0, { key: 'cancelled', label: 'Canceladas', value: cancelledCount, tone: 'neutral' })
  return { ...first, data: result, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    summary: { ...first.summary, total }, indicators: { ...first.indicators, items } }
}

export async function findMaintenanceOrder(record) {
  let page = 1
  while (true) {
    const { data } = await maintenanceOrdersAPI.list({ vehicle_id: record.vehicle_id, contract_id: record.contract_id,
      status: record.end_date ? 'COMPLETED' : 'IN_PROGRESS', page, limit: 100 })
    const order = data.data.find((row) => row.maintenance_record_id === record.id)
    if (order) return order
    if (page >= data.pages) throw new Error('Pedido vinculado não encontrado. Atualize a listagem e tente novamente.')
    page += 1
  }
}
