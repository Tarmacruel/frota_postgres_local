import { beforeEach, expect, it, vi } from 'vitest'
import { maintenanceAPI } from '../api/maintenance'
import { maintenanceOrdersAPI } from '../api/contractControl'
import { filterUnstartedOrders, findMaintenanceOrder, loadMaintenanceWorkspace, loadUnstartedMaintenanceOrders } from './maintenanceWorkspace'

vi.mock('../api/maintenance', () => ({ maintenanceAPI: { listPaginated: vi.fn() } }))
vi.mock('../api/contractControl', () => ({ maintenanceOrdersAPI: { list: vi.fn() } }))

const queue = (count, prefix) => Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, status: prefix === 'a' ? 'AUTHORIZED' : 'CANCELLED' }))
function records(count) {
  const all = Array.from({ length: count }, (_, i) => ({ id: `r-${i}`, service_description: `Serviço ${i}` }))
  maintenanceAPI.listPaginated.mockImplementation(async ({ page, limit }) => ({ data: { data: all.slice((page - 1) * limit, page * limit),
    pagination: { total: all.length, pages: Math.max(1, Math.ceil(all.length / limit)) }, summary: { total: all.length },
    indicators: { items: [{ key: 'total', value: all.length }, { key: 'open', value: 0 }, { key: 'closed', value: all.length }, { key: 'cost', value: '350.00', unit: 'BRL' }] } } }))
  return all
}

beforeEach(() => vi.resetAllMocks())

it.each([[0, 0, 0], [0, 21, 5], [3, 21, 5], [12, 21, 5], [23, 1, 15], [12, 0, 11]])('pagina uma única sequência sem repetir ou omitir linhas (%i autorizações, %i serviços, %i canceladas)', async (a, r, c) => {
  const all = records(r)
  const orders = { authorized: queue(a, 'a'), cancelled: queue(c, 'c') }
  const expected = [...orders.authorized.map((row) => `order:${row.id}`), ...all.map((row) => row.id), ...orders.cancelled.map((row) => `order:${row.id}`)]
  const actual = []
  for (let page = 1; page <= Math.max(1, Math.ceil(expected.length / 10)); page++) {
    const beforeCalls = maintenanceAPI.listPaginated.mock.calls.length
    const result = await loadMaintenanceWorkspace({ params: {}, orders, page })
    actual.push(...result.data.map((row) => row.id))
    expect(result.pagination.total).toBe(expected.length)
    expect(result.indicators.items.find((item) => item.key === 'total').value).toBe(expected.length)
    expect(result.indicators.items.find((item) => item.key === 'cost').value).toBe('350.00')
    expect(maintenanceAPI.listPaginated.mock.calls.length - beforeCalls).toBeLessThanOrEqual(2)
  }
  expect(actual).toEqual(expected)
  expect(maintenanceAPI.listPaginated.mock.calls.every(([params]) => params.limit === 10)).toBe(true)
})

it('coleta todos os lotes da fila e ignora pedidos que já possuem registro canônico', async () => {
  maintenanceOrdersAPI.list.mockImplementation(async ({ status, page, limit }) => {
    const rows = status === 'AUTHORIZED' ? [...queue(101, 'a'), { id: 'linked', maintenance_record_id: 'r' }] : queue(1, 'c')
    return { data: { data: rows.slice((page - 1) * limit, page * limit), pages: Math.ceil(rows.length / limit) } }
  })
  const result = await loadUnstartedMaintenanceOrders({ organization_id: 'scope' })
  expect(result.authorized).toHaveLength(101)
  expect(result.cancelled).toHaveLength(1)
  expect(maintenanceOrdersAPI.list).toHaveBeenCalledWith({ organization_id: 'scope', status: 'AUTHORIZED', page: 2, limit: 100 })
  expect(maintenanceOrdersAPI.list.mock.calls.every(([params]) => ['AUTHORIZED', 'CANCELLED'].includes(params.status))).toBe(true)
})

it('filtra placa, secretaria e ausência de secretaria na fila completa', () => {
  const orders = { authorized: [{ id: 'a', vehicle_plate: 'TST1234', organization_name: 'Saúde', service_description: 'Pneus' }, { id: 'b', vehicle_plate: 'TST0000' }], cancelled: [] }
  expect(filterUnstartedOrders(orders, { search: 'tst1234' }).authorized.map((r) => r.id)).toEqual(['a'])
  expect(filterUnstartedOrders(orders, { search: 'saúde' }).authorized.map((r) => r.id)).toEqual(['a'])
  expect(filterUnstartedOrders(orders, { unassigned: true }).authorized.map((r) => r.id)).toEqual(['b'])
})

it('isola autorizações sem passar um indicador desconhecido ao endpoint legado e conserva os KPIs globais', async () => {
  records(21)
  const result = await loadMaintenanceWorkspace({ params: { search: 'Pneus' }, orders: { authorized: queue(12, 'a'), cancelled: queue(1, 'c') }, indicator: 'authorized', page: 2 })
  expect(result.data.map((r) => r.id)).toEqual(['order:a-10', 'order:a-11'])
  expect(result.pagination.total).toBe(12)
  expect(result.indicators.items.find((item) => item.key === 'total').value).toBe(34)
  expect(maintenanceAPI.listPaginated).toHaveBeenCalledWith(expect.objectContaining({ search: 'Pneus', indicator: undefined }))
})

it('mantém o foco por ID sem misturar a fila', async () => {
  records(1)
  const result = await loadMaintenanceWorkspace({ params: { focus_id: 'r-0' }, orders: { authorized: queue(2, 'a'), cancelled: queue(3, 'c') } })
  expect(result.data.map((r) => r.id)).toEqual(['r-0'])
  expect(result.pagination.total).toBe(1)
})

it('localiza o pedido exclusivamente pela FK do registro, percorrendo páginas do veículo quando necessário', async () => {
  maintenanceOrdersAPI.list.mockImplementation(async ({ page }) => ({ data: { pages: 2, data: [{ id: `o-${page}`, maintenance_record_id: page === 1 ? 'other' : 'record' }] } }))
  const result = await findMaintenanceOrder({ id: 'record', vehicle_id: 'vehicle', contract_id: 'contract', end_date: '2026-10-23' })
  expect(result.id).toBe('o-2')
  expect(maintenanceOrdersAPI.list).toHaveBeenLastCalledWith({ vehicle_id: 'vehicle', contract_id: 'contract', status: 'COMPLETED', page: 2, limit: 100 })
})
