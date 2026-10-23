import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { contractControlAPI, maintenanceOrdersAPI } from '../../api/contractControl'
import { fuelSupplyOrdersAPI } from '../../api/fuelSupplyOrders'
import FuelSupplyOrderCreateForm from '../FuelSupplyOrderCreateForm'
import MaintenanceOrdersPanel, { MaintenanceOrderForm } from './MaintenanceOrdersPanel'
import ProcessReconciliation from './ProcessReconciliation'
import ContractBalancesPage from '../../pages/ContractBalancesPage'

vi.mock('../../api/contractControl', () => ({
  contractControlAPI: { config: vi.fn(), eligible: vi.fn(), quote: vi.fn(), contracts: vi.fn(), detail: vi.fn(), catalog: vi.fn(), opening: vi.fn(), operations: vi.fn(), reconciliation: vi.fn(), reconcile: vi.fn() },
  maintenanceOrdersAPI: { create: vi.fn(), list: vi.fn(), complete: vi.fn() },
}))
vi.mock('../../api/fuelSupplyOrders', () => ({ fuelSupplyOrdersAPI: { create: vi.fn() } }))
vi.mock('../../api/paymentProcesses', () => ({ paymentSuppliersAPI: { list: async () => ({ data: [] }) } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'ADMIN', organization_id: 'org' }, canEdit: () => true, canCreate: () => true, canView: () => true }) }))
vi.mock('../../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [] }) }))
vi.mock('../SearchableSelect', () => ({ default: ({ value, onChange, options, ariaLabel }) => <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Selecione</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> }))

const catalog = {
  vehicles: [{ id: 'car', plate: 'TST0001', brand: 'Teste', model: 'Fictício' }],
  organizations: [{ id: 'org', name: 'Secretaria Teste' }], fuelStations: [{ id: 'station', name: 'Posto Teste' }],
}
const contract = { id: 'contract', number: 'TEST-01', kind: 'FUEL', available_balance: '1000',
  providers: [{ id: 'provider', name: 'Empresa Teste', fuel_station_id: 'station' }],
  prices: [{ id: 'price', provider_id: 'provider', fuel_type: 'DIESEL S10', unit_price: '6', valid_from: new Date(Date.now()-86400000).toISOString(), valid_until: null }] }

beforeEach(() => {
  vi.clearAllMocks()
  contractControlAPI.config.mockResolvedValue({ data: { enabled: true } })
  contractControlAPI.eligible.mockResolvedValue({ data: [contract] })
  contractControlAPI.quote.mockResolvedValue({ data: { price_id: 'price', unit_price: '6', reserve_amount: '180', available_balance: '1000', available_after: '820', sufficient: true } })
  fuelSupplyOrdersAPI.create.mockResolvedValue({ data: { id: 'order' } })
  maintenanceOrdersAPI.create.mockResolvedValue({ data: { id: 'maintenance-order' } })
})

it('calcula a reserva, preenche o único contrato e só emite após a confirmação do usuário', async () => {
  render(<FuelSupplyOrderCreateForm {...catalog} />)
  fireEvent.change(screen.getByLabelText('Veículo'), { target: { value: 'car' } })
  const button = screen.getByRole('button', { name: 'Criar ordem' })
  await waitFor(() => expect(button).toBeEnabled())
  expect(screen.getByText('TEST-01')).toBeInTheDocument()
  expect(screen.queryByLabelText('Contrato para reserva')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Prestador para reserva')).not.toBeInTheDocument()
  expect(screen.getByText(/180,00/)).toBeInTheDocument()
  expect(fuelSupplyOrdersAPI.create).not.toHaveBeenCalled()
  fireEvent.click(button)
  await waitFor(() => expect(fuelSupplyOrdersAPI.create).toHaveBeenCalledWith(expect.objectContaining({
    contract_id: 'contract', contract_provider_id: 'provider', requested_fuel_type: 'DIESEL S10', expected_price_id: 'price',
    request_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
  })))
})

it('bloqueia a emissão quando a prévia aponta saldo insuficiente', async () => {
  contractControlAPI.quote.mockResolvedValue({ data: { price_id: 'price', unit_price: '6', reserve_amount: '180', available_balance: '100', available_after: '-80', sufficient: false } })
  render(<FuelSupplyOrderCreateForm {...catalog} />)
  expect(await screen.findByText(/Saldo insuficiente/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Criar ordem' })).toBeDisabled()
  expect(fuelSupplyOrdersAPI.create).not.toHaveBeenCalled()
})

it('descarta uma prévia antiga que chega depois de o usuário alterar os litros', async () => {
  let finishOld
  contractControlAPI.quote.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
  render(<FuelSupplyOrderCreateForm {...catalog} />)
  await waitFor(() => expect(contractControlAPI.quote).toHaveBeenCalledTimes(1))
  contractControlAPI.quote.mockResolvedValue({ data: { price_id: 'price', unit_price: '6', reserve_amount: '120', available_balance: '1000', available_after: '880', sufficient: true } })
  fireEvent.change(screen.getByLabelText('Litros previstos'), { target: { value: '20' } })
  await waitFor(() => expect(screen.getByText(/120,00/)).toBeInTheDocument())
  await act(async () => finishOld({ data: { price_id: 'old', reserve_amount: 9999, sufficient: false } }))
  expect(screen.getByText(/120,00/)).toBeInTheDocument()
  expect(screen.queryByText(/9\.999,00/)).not.toBeInTheDocument()
})

it('autoriza manutenção diretamente com orçamento e não exige etapa adicional de aprovação', async () => {
  contractControlAPI.eligible.mockResolvedValue({ data: [{ ...contract, kind: 'MAINTENANCE', prices: [], providers: [{ id: 'workshop', name: 'Oficina Teste' }] }] })
  render(<MaintenanceOrderForm vehicles={catalog.vehicles} />)
  fireEvent.change(screen.getByLabelText('Veículo para manutenção'), { target: { value: 'car' } })
  fireEvent.change(screen.getByLabelText('Orçamento previsto'), { target: { value: '500' } })
  fireEvent.change(screen.getByLabelText('Serviço solicitado'), { target: { value: 'Troca de óleo e filtros de teste' } })
  const button = screen.getByRole('button', { name: 'Autorizar e reservar saldo' })
  await waitFor(() => expect(button).toBeEnabled())
  expect(maintenanceOrdersAPI.create).not.toHaveBeenCalled()
  fireEvent.click(button)
  await waitFor(() => expect(maintenanceOrdersAPI.create).toHaveBeenCalledWith(expect.objectContaining({ contract_id: 'contract', provider_id: 'workshop', estimated_cost: '500' })))
})

it('mantém saldo não confirmado como desconhecido e transforma o KPI de configuração em filtro', async () => {
  const pending = { ...contract, control_opened: false, available_balance: null, supplier_name: 'Empresa Teste', reserved_amount: 0, consumed_since_opening: 0, amendments: [] }
  contractControlAPI.contracts.mockResolvedValue({ data: { data: [pending], indicators: { all: 1, pending_setup: 1 }, totals: { available_balance: null, reserved_amount: null, consumed_since_opening: null } } })
  contractControlAPI.detail.mockResolvedValue({ data: { contract: pending, providers: [], prices: [] } })
  contractControlAPI.catalog.mockResolvedValue({ data: { stations: [] } })
  render(<MemoryRouter><ContractBalancesPage /></MemoryRouter>)
  expect(await screen.findByText('Configure este contrato para liberar pedidos')).toBeInTheDocument()
  expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  expect(contractControlAPI.opening).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Aguardam configuração/ }))
  await waitFor(() => expect(contractControlAPI.contracts).toHaveBeenLastCalledWith(expect.objectContaining({ indicator: 'pending_setup' })))
})

it('envia os vínculos de conciliação sem registrar uma segunda despesa no frontend', async () => {
  contractControlAPI.operations.mockResolvedValue({ data: { data: [{ id: 'operation', amount: 500, vehicle_plate: 'TST0001', occurred_at: new Date().toISOString(), source_type: 'FUEL_SUPPLY' }], pages: 1 } })
  contractControlAPI.reconciliation.mockResolvedValue({ data: null })
  contractControlAPI.reconcile.mockResolvedValue({ data: {} })
  render(<ProcessReconciliation process={{ id: 'invoice', contract_id: 'contract', amount: 500 }} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Conciliar operações da fatura' }))
  fireEvent.click(await screen.findByRole('checkbox'))
  expect(contractControlAPI.reconcile).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar conciliação' }))
  await waitFor(() => expect(contractControlAPI.reconcile).toHaveBeenCalledWith('invoice', { operation_ids: ['operation'], justification: null }))
})

it('conclui serviço recém-iniciado com o horário do servidor para não truncar o início em minutos', async () => {
  maintenanceOrdersAPI.list.mockResolvedValue({ data: { data: [{ id: 'order', status: 'IN_PROGRESS', vehicle_plate: 'TST0001',
    service_description: 'Revisão fictícia', estimated_cost: 500, total_cost: null, provider_name: 'Oficina Teste' }], counts: { IN_PROGRESS: 1 }, total: 1, pages: 1 } })
  maintenanceOrdersAPI.complete.mockResolvedValue({ data: {} })
  render(<MaintenanceOrdersPanel vehicles={catalog.vehicles} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Concluir', exact: true }))
  fireEvent.change(screen.getByLabelText('Custo real'), { target: { value: '470' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar', exact: true }))
  await waitFor(() => expect(maintenanceOrdersAPI.complete).toHaveBeenCalledWith('order', expect.objectContaining({ total_cost: '470', end_date: null })))
})
