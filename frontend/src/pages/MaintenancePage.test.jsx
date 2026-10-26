import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import MaintenancePage from './MaintenancePage'
import api from '../api/client'
import { maintenanceAPI } from '../api/maintenance'
import { previewRowsToPdf } from '../utils/exportData'
import { maintenanceOrdersAPI } from '../api/contractControl'

const auth = vi.hoisted(() => ({ create: true, edit: true, remove: true, contract: false }))

vi.mock('../api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('../api/maintenance', () => ({ maintenanceAPI: { listPaginated: vi.fn(), remove: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    canCreate: () => auth.create,
    canEdit: () => auth.edit,
    canDeleteModule: () => auth.remove,
    isAdmin: true,
  }),
}))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [] }) }))
vi.mock('../components/SearchableSelect', () => ({ default: ({ placeholder }) => <button type="button">{placeholder}</button> }))
vi.mock('../components/Modal', () => ({ default: ({ open, title, children }) => open ? <div role="dialog" aria-label={title}>{children}</div> : null }))
vi.mock('../components/MaintenanceForm', () => ({ default: ({ initialData }) => <div>{initialData ? `Editando ${initialData.vehicle_plate}` : 'Novo formulário'}</div> }))
vi.mock('../utils/exportData', () => ({ exportRowsToXlsx: vi.fn(), previewRowsToPdf: vi.fn() }))

const vehicle = { id: 'vehicle-1', plate: 'ABC1D23', vehicle_type: 'SEDAN', current_location: { organization_id: 'org', organization_name: 'Secretaria teste' } }
const maintenance = { id: 'maintenance-1', vehicle_id: vehicle.id, vehicle_plate: vehicle.plate, service_description: 'Revisão preventiva', parts_replaced: 'Filtro', total_cost: 350, start_date: '2026-10-01T08:00:00', end_date: null }

beforeEach(() => {
  vi.resetAllMocks()
  auth.create = true
  auth.edit = true
  auth.remove = true
  auth.contract = false
  api.get.mockResolvedValue({ data: [vehicle] })
  maintenanceAPI.listPaginated.mockResolvedValue({ data: { data: [maintenance], pagination: { page: 1, pages: 1, total: 1 }, summary: { total: 1, open: 1, closed: 0 } } })
})

it('mantém as fontes atuais e apresenta miniatura, status e ações da manutenção', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)

  expect(await screen.findByText('Revisão preventiva')).toBeInTheDocument()
  expect(api.get).toHaveBeenCalledWith('/vehicles/options')
  expect(maintenanceAPI.listPaginated).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 }))
  expect(screen.getByAltText('Miniatura ilustrativa de Sedan ABC1D23')).toBeInTheDocument()
  expect(screen.getByText('EM ANDAMENTO')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Mais ações da manutenção de ABC1D23' }))
  await user.click(screen.getByRole('menuitem', { name: 'Editar' }))
  expect(screen.getByRole('dialog', { name: 'Atualizar manutenção' })).toHaveTextContent('Editando ABC1D23')
})

it('oculta a coluna de ações quando o perfil não pode editar nem excluir', async () => {
  auth.create = false
  auth.edit = false
  auth.remove = false
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)

  await screen.findByText('Revisão preventiva')
  expect(screen.queryByRole('columnheader', { name: 'Ações' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Nova manutenção' })).not.toBeInTheDocument()
})

it('consulta somente a página solicitada e mantém o total do servidor', async () => {
  const user = userEvent.setup()
  maintenanceAPI.listPaginated.mockImplementation(({ page, limit }) => Promise.resolve({ data: {
    data: [{ ...maintenance, id: `maintenance-${page}`, service_description: `Revisão ${page}` }],
    pagination: { page, pages: 2, total: 11, limit },
    summary: { total: 11, open: 8, closed: 3 },
  } }))
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)

  expect(await screen.findByText('Revisão 1')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Página 2' }))
  expect(await screen.findByText('Revisão 2')).toBeInTheDocument()
  expect(maintenanceAPI.listPaginated).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, limit: 10 }))
  expect(maintenanceAPI.listPaginated).toHaveBeenCalledTimes(2)
})

it('busca todos os lotes filtrados somente ao pedir o PDF', async () => {
  const user = userEvent.setup()
  maintenanceAPI.listPaginated.mockImplementation(({ page, limit }) => Promise.resolve({ data: {
    data: Array.from({ length: page === 1 ? limit : 1 }, (_, index) => ({
      ...maintenance, id: `maintenance-${page}-${index}`,
    })),
    pagination: { page, pages: Math.ceil(101 / limit), total: 101, limit },
    summary: { total: 101, open: 101, closed: 0 }, indicators: { items: [{ key: 'total', label: 'Manutenções', value: 101 }] },
  } }))
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)

  await screen.findAllByText('101')
  expect(maintenanceAPI.listPaginated).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Pré-visualizar PDF' }))
  await waitFor(() => expect(previewRowsToPdf).toHaveBeenCalledWith(expect.objectContaining({ rows: expect.arrayContaining([expect.objectContaining({ id: 'maintenance-2-0' })]) })))
  expect(previewRowsToPdf.mock.calls[0][0].rows).toHaveLength(101)
  expect(maintenanceAPI.listPaginated).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 100 }))
})

vi.mock('../api/contractControl', () => ({ contractControlAPI: { config: async () => ({ data: { enabled: auth.contract } }) }, maintenanceOrdersAPI: { list: vi.fn(), start: vi.fn(), complete: vi.fn(), cancel: vi.fn() } }))

function enableUnified() {
  auth.contract = true
  const closed = { ...maintenance, id: 'closed', service_description: 'Serviço concluído do contrato', end_date: '2026-10-23', contract_id: 'contract', contract_reservation_id: 'reservation' }
  const authorized = { id: 'authorized', vehicle_id: vehicle.id, vehicle_plate: 'AUT1234', service_description: 'Serviço ainda não iniciado', status: 'AUTHORIZED', contract_number: 'CT-TESTE', provider_name: 'Oficina Teste', estimated_cost: '500', total_cost: null }
  const cancelled = { ...authorized, id: 'cancelled', vehicle_plate: 'CAN1234', service_description: 'Pedido cancelado sem execução', status: 'CANCELLED' }
  const linked = { ...authorized, id: 'completed', maintenance_record_id: closed.id, status: 'COMPLETED' }
  maintenanceOrdersAPI.list.mockImplementation(async ({ status }) => ({ data: { data: status === 'AUTHORIZED' ? [authorized] : status === 'CANCELLED' ? [cancelled] : [linked], pages: 1, total: 1 } }))
  maintenanceAPI.listPaginated.mockResolvedValue({ data: { data: [closed, maintenance], pagination: { pages: 1, total: 2 }, summary: { total: 2 }, indicators: { items: [
    { key: 'total', label: 'Manutenções', value: 2 }, { key: 'open', label: 'Em andamento', value: 1 }, { key: 'closed', label: 'Concluídas', value: 1 }, { key: 'cost', label: 'Custo registrado', value: '350', unit: 'BRL' },
  ] } } })
  return { closed, authorized, cancelled, linked }
}

it('mostra uma única tabela e um conjunto de KPIs sem repetir pedidos concluídos', async () => {
  enableUnified()
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)
  await screen.findByText('Serviço concluído do contrato')
  expect(screen.getAllByRole('table')).toHaveLength(1)
  expect(screen.getAllByRole('region', { name: 'Indicadores' })).toHaveLength(1)
  expect(screen.getAllByText('Serviço concluído do contrato')).toHaveLength(1)
  expect(screen.getByText('Serviço ainda não iniciado')).toBeInTheDocument()
  expect(screen.getByText('Pedido cancelado sem execução')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Pedidos de manutenção' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Manutenções 4' })).toBeInTheDocument()
})

it('mantém detalhes do pedido por FK sem disponibilizar exclusão de execução financeira', async () => {
  const user = userEvent.setup()
  enableUnified()
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)
  await screen.findByText('Serviço concluído do contrato')
  await user.click(screen.getAllByRole('button', { name: 'Mais ações da manutenção de ABC1D23' })[0])
  expect(screen.queryByRole('menuitem', { name: 'Excluir' })).not.toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Retificar' })).toBeInTheDocument()
  await user.click(screen.getByRole('menuitem', { name: 'Ver pedido e contrato' }))
  expect(await screen.findByRole('dialog', { name: 'Pedido de manutenção' })).toHaveTextContent('CT-TESTE')
  expect(maintenanceOrdersAPI.list).toHaveBeenCalledWith(expect.objectContaining({ vehicle_id: vehicle.id, status: 'COMPLETED' }))
})

it('conclui pela linha da autorização e preserva o custo digitado quando o servidor rejeita', async () => {
  const user = userEvent.setup()
  enableUnified()
  maintenanceOrdersAPI.complete.mockRejectedValueOnce(new Error('Saldo em conferência'))
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)
  await screen.findByText('Serviço ainda não iniciado')
  await user.click(screen.getByRole('button', { name: 'Concluir', exact: true }))
  const input = screen.getByRole('spinbutton', { name: 'Custo real' })
  await user.type(input, '470')
  await user.click(screen.getByRole('button', { name: 'Confirmar', exact: true }))
  await screen.findByRole('alert')
  expect(input).toHaveValue(470)
  expect(maintenanceOrdersAPI.complete).toHaveBeenCalledTimes(1)
  expect(maintenanceOrdersAPI.complete).toHaveBeenCalledWith('authorized', { total_cost: '470', parts_replaced: null, end_date: null })
})

it('mantém consulta de detalhes e oculta ações de escrita para leitor', async () => {
  const user = userEvent.setup()
  enableUnified(); auth.create = false; auth.edit = false; auth.remove = false
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)
  await screen.findByText('Serviço ainda não iniciado')
  expect(screen.queryByRole('button', { name: 'Iniciar serviço' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Concluir', exact: true })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Mais ações da manutenção de AUT1234' }))
  expect(screen.getByRole('menuitem', { name: 'Ver pedido e contrato' })).toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: 'Cancelar pedido' })).not.toBeInTheDocument()
})

it('mantém a exportação única incluindo a fila e os registros, sem duplicação', async () => {
  const user = userEvent.setup()
  enableUnified()
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)
  await screen.findByText('Serviço concluído do contrato')
  await user.click(screen.getByRole('button', { name: 'Pré-visualizar PDF' }))
  await waitFor(() => expect(previewRowsToPdf).toHaveBeenCalled())
  expect(previewRowsToPdf.mock.calls[0][0].rows.map((r) => r.id)).toEqual(['order:authorized', 'closed', maintenance.id, 'order:cancelled'])
})

it('aplica o filtro de autorizações na mesma tabela sem consultar um indicador inválido', async () => {
  const user = userEvent.setup()
  enableUnified()
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)
  await screen.findByText('Serviço concluído do contrato')
  await user.click(screen.getByRole('button', { name: 'Autorizadas 1' }))
  await waitFor(() => expect(screen.queryByText('Serviço concluído do contrato')).not.toBeInTheDocument())
  expect(screen.getByText('Serviço ainda não iniciado')).toBeInTheDocument()
  expect(screen.getAllByRole('table')).toHaveLength(1)
  expect(maintenanceAPI.listPaginated).toHaveBeenLastCalledWith(expect.objectContaining({ indicator: undefined }))
})

it('inicia o serviço apenas após confirmação explícita na ação da linha', async () => {
  const user = userEvent.setup()
  enableUnified()
  maintenanceOrdersAPI.start.mockResolvedValue({ data: {} })
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)
  await screen.findByText('Serviço ainda não iniciado')
  await user.click(screen.getByRole('button', { name: 'Iniciar serviço' }))
  expect(screen.getByRole('dialog', { name: 'Iniciar manutenção' })).toBeInTheDocument()
  expect(maintenanceOrdersAPI.start).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Confirmar' }))
  await waitFor(() => expect(maintenanceOrdersAPI.start).toHaveBeenCalledWith('authorized'))
})

it('substitui a autorização pelo registro ao iniciar e concluir sem duplicar a manutenção', async () => {
  const user = userEvent.setup()
  const { authorized } = enableUnified()
  let phase = 'AUTHORIZED'
  const funded = { ...maintenance, id: 'funded', vehicle_plate: authorized.vehicle_plate,
    service_description: authorized.service_description, contract_id: 'contract', contract_reservation_id: 'reservation' }
  maintenanceOrdersAPI.list.mockImplementation(async ({ status }) => ({ data: { pages: 1, data:
    status === 'AUTHORIZED' ? phase === 'AUTHORIZED' ? [authorized] : [] : status === 'CANCELLED' ? [] : [{ ...authorized, status: phase, maintenance_record_id: funded.id }] } }))
  maintenanceOrdersAPI.start.mockImplementation(async () => { phase = 'IN_PROGRESS'; return { data: {} } })
  maintenanceOrdersAPI.complete.mockImplementation(async () => { phase = 'COMPLETED'; return { data: {} } })
  maintenanceAPI.listPaginated.mockImplementation(async () => ({ data: { data: phase === 'AUTHORIZED' ? [] : [{ ...funded, end_date: phase === 'COMPLETED' ? '2026-10-23' : null }],
    pagination: { total: phase === 'AUTHORIZED' ? 0 : 1, pages: 1 }, indicators: { items: [
      { key: 'total', label: 'Manutenções', value: phase === 'AUTHORIZED' ? 0 : 1 },
      { key: 'closed', label: 'Concluídas', value: phase === 'COMPLETED' ? 1 : 0 },
    ] } } }))
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)
  await screen.findByText(authorized.service_description)
  await user.click(screen.getByRole('button', { name: 'Iniciar serviço' }))
  await user.click(screen.getByRole('button', { name: 'Confirmar' }))
  await screen.findByText('EM ANDAMENTO')
  expect(screen.getAllByText(authorized.service_description)).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Concluir', exact: true }))
  await user.type(await screen.findByRole('spinbutton', { name: 'Custo real' }), '0')
  await user.click(screen.getByRole('button', { name: 'Confirmar' }))
  await screen.findByText('CONCLUÍDA')
  expect(screen.getAllByText(authorized.service_description)).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Manutenções 1' })).toBeInTheDocument()
  expect(maintenanceOrdersAPI.complete).toHaveBeenCalledTimes(1)
})
