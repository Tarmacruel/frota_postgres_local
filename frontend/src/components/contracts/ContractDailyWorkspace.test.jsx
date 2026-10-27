import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ContractBalancesPage from '../../pages/ContractBalancesPage'
import FuelSupplyOrderCreateForm from '../FuelSupplyOrderCreateForm'
import { MaintenanceOrderForm } from './MaintenanceOrdersPanel'
import ContractCommitmentsBrowser from './ContractCommitmentsBrowser'
import ContractInvoicesPanel from './ContractInvoicesPanel'
import ContractReturnBanner from './ContractReturnBanner'
import { contractControlAPI, maintenanceOrdersAPI } from '../../api/contractControl'
import { paymentProcessesAPI } from '../../api/paymentProcesses'
import { fuelSupplyOrdersAPI } from '../../api/fuelSupplyOrders'
import { contractOrderPath, safeContractReturn } from '../../utils/contractNavigation'

const access = vi.hoisted(() => ({ edit: true, create: true }))
const environment = vi.hoisted(() => ({ isHomologation: false }))
vi.mock('../../config/environment', async (importOriginal) => ({ ...await importOriginal(), appEnvironment: environment }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: {}, canEdit: () => access.edit, canCreate: () => access.create, canView: () => true }) }))
vi.mock('../../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [] }) }))
vi.mock('../../pages/PaymentProcessesPage', () => ({ default: ({ initialContractId, initialProcessId, onDataChange }) => <><p>Faturas: {initialContractId} {initialProcessId}</p><button onClick={onDataChange}>Simular atualização financeira</button></> }))
vi.mock('../SearchableSelect', () => ({ default: ({ value, onChange, options, ariaLabel }) => <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Selecione</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }))
vi.mock('../../api/contractControl', () => ({ contractControlAPI: { config: vi.fn(), contracts: vi.fn(), detail: vi.fn(), catalog: vi.fn(), eligible: vi.fn(), quote: vi.fn(), opening: vi.fn(), movements: vi.fn(), operations: vi.fn(), reservations: vi.fn() }, maintenanceOrdersAPI: { list: vi.fn(), create: vi.fn() } }))
vi.mock('../../api/paymentProcesses', () => ({ paymentProcessesAPI: { list: vi.fn() }, paymentSuppliersAPI: { list: vi.fn(async () => ({ data: [] })) }, paymentContractsAPI: {} }))
vi.mock('../../api/fuelSupplyOrders', () => ({ fuelSupplyOrdersAPI: { create: vi.fn() } }))

const opened = { id: 'a', number: 'TESTE-A', supplier_name: 'Empresa Teste', supplier_id: 'company', kind: 'FUEL', status: 'ACTIVE',
  valid_from: '2020-01-01', valid_until: '2035-12-31', control_opened: true, opening_balance: '1000', opening_date: '2026-10-23',
  available_balance: '1000', contractual_balance: '1000', reserved_amount: '0', consumed_since_opening: '0', paid_amount: '20', pending_amount: '30', ready: true, eligibility_errors: [], provider_count: 1, amendments: [] }
const pending = { ...opened, id: 'b', number: 'TESTE-B', ready: false, control_opened: false, available_balance: null, contractual_balance: null, provider_count: 0, eligibility_errors: ['Saldo inicial ainda não confirmado'] }
const provider = { id: 'p-a', name: 'Empresa executante A', station_name: 'Posto A', fuel_station_id: 'station-a', active: true }
const price = { id: 'price-a', provider_id: 'p-a', fuel_type: 'DIESEL S10', unit_price: '6', valid_from: '2020-01-01T00:00:00Z', valid_until: null }
const fuelContract = { ...opened, providers: [provider], prices: [price] }
const otherContract = { ...fuelContract, id: 'other', number: 'OUTRO', providers: [{ ...provider, id: 'p-b', fuel_station_id: 'station-b' }], prices: [{ ...price, provider_id: 'p-b' }] }
const catalogs = { vehicles: [{ id: 'car', plate: 'TST0001' }], organizations: [], fuelStations: [{ id: 'station-b', name: 'Posto B' }, { id: 'station-a', name: 'Posto A' }] }

function Location() { const value = useLocation(); return <output aria-label="Endereço">{value.pathname + value.search}</output> }
function ModuleReturn() { const [params] = useSearchParams(); return <ContractReturnBanner returnTo={params.get('return_to')} /> }
function mount(path = '/processos-pagamento', children = <ContractBalancesPage />) {
  return render(<MemoryRouter initialEntries={[path]}><Location /><Routes><Route path="/processos-pagamento" element={children} /><Route path="/abastecimentos" element={<ModuleReturn />} /></Routes></MemoryRouter>)
}
beforeEach(() => {
  vi.clearAllMocks(); access.edit = true; access.create = true
  environment.isHomologation = false
  sessionStorage.clear()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  contractControlAPI.config.mockResolvedValue({ data: { enabled: true } })
  contractControlAPI.contracts.mockImplementation(async ({ indicator } = {}) => ({ data: { data: indicator === 'pending_setup' ? [pending] : [opened, pending],
    indicators: { all: 2, opened: 1, pending_setup: 1, divergence: 0, low_balance: 0, expires_30: 0 }, totals: { available_balance: '1000', reserved_amount: '0', consumed_since_opening: '0', pending_amount: '30' } } }))
  contractControlAPI.detail.mockImplementation(async (id) => ({ data: { contract: id === 'a' ? opened : pending, providers: id === 'a' ? [provider] : [], prices: [price] } }))
  contractControlAPI.catalog.mockResolvedValue({ data: { stations: [] } })
  contractControlAPI.eligible.mockImplementation(async ({ fuel_station_id } = {}) => ({ data: fuel_station_id ? [fuel_station_id === 'station-a' ? fuelContract : otherContract] : [fuelContract, otherContract] }))
  contractControlAPI.quote.mockResolvedValue({ data: { price_id: 'price-a', unit_price: '6', reserve_amount: '180', available_after: '820', sufficient: true } })
  contractControlAPI.movements.mockResolvedValue({ data: { data: [], total: 0, pages: 1 } })
  contractControlAPI.operations.mockResolvedValue({ data: { data: [], total: 0, pages: 1 } })
  maintenanceOrdersAPI.list.mockResolvedValue({ data: { data: [], counts: {}, total: 0, pages: 1 } })
  paymentProcessesAPI.list.mockResolvedValue({ data: { data: [], pagination: { total: 0, pages: 1 } } })
  fuelSupplyOrdersAPI.create.mockResolvedValue({ data: { id: 'order' } })
})
afterEach(() => vi.useRealTimers())

it.each([true, false])('restringe o aviso da cópia das 06h ao ambiente de homologação: %s', async (homologation) => {
  environment.isHomologation = homologation
  mount()
  await screen.findByRole('button', { name: 'Abrir contrato TESTE-A' })
  const notice = screen.queryByText(/Homologação: a cópia das 06h/)
  if (homologation) expect(notice).toBeInTheDocument()
  else expect(notice).not.toBeInTheDocument()
})

describe('retorno interno do contrato', () => {
  it.each(['https://evil.example/processos-pagamento', '//evil.example', '/vehicles', '/processos-pagamento/../../users', '/processos-pagamento\\evil'])('rejeita um destino fora do módulo: %s', (value) => expect(safeContractReturn(value)).toBe(''))
  it('preserva filtros e aba sem aceitar retorno recursivo', () => {
    const target = '/processos-pagamento?view=contracts&contract_id=a&contract_tab=settings&search=Teste&return_to=outro'
    expect(safeContractReturn(target)).toBe('/processos-pagamento?view=contracts&contract_id=a&contract_tab=settings&search=Teste')
    const destination = new URL(contractOrderPath('FUEL', 'a', target), 'https://test.local')
    expect(destination.pathname).toBe('/abastecimentos')
    expect(destination.searchParams.get('contract_id')).toBe('a')
    expect(destination.searchParams.get('return_to')).toBe(safeContractReturn(target))
  })
})

it('abre uma lista com quatro KPIs, cobertura global e sem buscar detalhe ou catálogos antes da seleção', async () => {
  mount('/processos-pagamento?view=overview')
  await screen.findByRole('button', { name: 'Abrir contrato TESTE-A' })
  expect(within(screen.getByRole('navigation', { name: 'Áreas do acompanhamento contratual' })).getAllByRole('button')).toHaveLength(4)
  expect(within(screen.getByRole('region', { name: 'Indicadores' })).getAllByRole('button')).toHaveLength(4)
  expect(screen.getByText(/Saldo apurado em 1 de 2 contratos/)).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(contractControlAPI.detail).not.toHaveBeenCalled()
  expect(contractControlAPI.catalog).not.toHaveBeenCalled()
  expect(contractControlAPI.opening).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Configuração pendente/ }))
  await waitFor(() => expect(contractControlAPI.contracts).toHaveBeenLastCalledWith(expect.objectContaining({ indicator: 'pending_setup' })))
  expect(screen.getByText(/Saldo apurado em 1 de 2 contratos/)).toBeInTheDocument()
})

it('mantém o detalhe entre abas, carrega configuração sob demanda e fecha devolvendo foco à lista', async () => {
  mount()
  const source = await screen.findByRole('button', { name: 'Abrir contrato TESTE-A' })
  fireEvent.click(source)
  const drawer = await screen.findByRole('dialog', { name: 'Contrato TESTE-A' })
  fireEvent.click(within(drawer).getByRole('button', { name: 'Movimentações', exact: true }))
  await screen.findByRole('region', { name: 'Extrato do contrato' })
  fireEvent.click(within(drawer).getByRole('button', { name: 'Configuração', exact: true }))
  await waitFor(() => expect(contractControlAPI.catalog).toHaveBeenCalledTimes(1))
  expect(contractControlAPI.detail).toHaveBeenCalledTimes(1)
  expect(contractControlAPI.contracts).toHaveBeenCalledTimes(1)
  fireEvent.click(within(drawer).getByRole('button', { name: 'Fechar', exact: true }))
  await waitFor(() => expect(source).toHaveFocus())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('consulta a elegibilidade do contrato aberto quando ele não pertence mais ao filtro da lista', async () => {
  contractControlAPI.contracts.mockImplementation(async ({ search } = {}) => ({ data: {
    data: search === 'TESTE-A' ? [opened] : [pending], indicators: { all: 2, opened: 1 }, totals: {},
  } }))
  mount('/processos-pagamento?contract_indicator=pending_setup&contract_id=a')
  const drawer = await screen.findByRole('dialog', { name: 'Contrato TESTE-A' })
  expect(await within(drawer).findByRole('link', { name: 'Novo pedido de abastecimento' })).toBeInTheDocument()
  expect(contractControlAPI.contracts).toHaveBeenLastCalledWith({ search: 'TESTE-A' })
  expect(screen.queryByRole('button', { name: 'Abrir contrato TESTE-A' })).not.toBeInTheDocument()
})

it('não abre saldo automaticamente e mantém operações de escrita ocultas para consulta sem permissão', async () => {
  access.edit = false; access.create = false
  mount('/processos-pagamento?view=overview&contract_id=b')
  const drawer = await screen.findByRole('dialog', { name: 'Contrato TESTE-B' })
  expect(within(drawer).getByText(/Configure este contrato/)).toBeInTheDocument()
  expect(within(drawer).queryByRole('button', { name: 'Conferir saldo inicial' })).not.toBeInTheDocument()
  expect(within(drawer).queryByRole('link', { name: /Novo pedido/ })).not.toBeInTheDocument()
  expect(contractControlAPI.opening).not.toHaveBeenCalled()
})

it('espera 300ms pela última busca e preserva os demais parâmetros', async () => {
  mount('/processos-pagamento?kind=FUEL')
  await screen.findByRole('button', { name: 'Abrir contrato TESTE-A' })
  vi.useFakeTimers()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar contrato ou empresa' }), { target: { value: 'Te' } })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar contrato ou empresa' }), { target: { value: 'Teste' } })
  await act(async () => vi.advanceTimersByTimeAsync(299))
  expect(contractControlAPI.contracts).toHaveBeenCalledTimes(1)
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(contractControlAPI.contracts).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'FUEL', search: 'Teste' }))
  expect(screen.getByLabelText('Endereço')).toHaveTextContent('kind=FUEL')
})

it('retorna do módulo com os filtros e o painel restaurados e reconsulta o saldo', async () => {
  mount('/processos-pagamento?view=overview&search=Teste&kind=FUEL')
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir contrato TESTE-A' }))
  const order = await screen.findByRole('link', { name: 'Novo pedido de abastecimento' })
  fireEvent.click(order)
  expect(screen.getByLabelText('Endereço')).toHaveTextContent('/abastecimentos?')
  contractControlAPI.detail.mockResolvedValue({ data: { contract: { ...opened, available_balance: '700' }, providers: [provider], prices: [price] } })
  fireEvent.click(screen.getByRole('link', { name: 'Voltar ao contrato' }))
  const drawer = await screen.findByRole('dialog', { name: 'Contrato TESTE-A' })
  await waitFor(() => expect(within(drawer).getByText(/700,00/)).toBeInTheDocument())
  expect(screen.getByRole('searchbox', { name: 'Buscar contrato ou empresa' })).toHaveValue('Teste')
  expect(screen.getByRole('combobox', { name: 'Objeto do contrato' })).toHaveValue('FUEL')
  expect(contractControlAPI.detail).toHaveBeenCalledTimes(2)
  await waitFor(() => expect(window.scrollTo).toHaveBeenCalled())
})

it('desconsidera um detalhe atrasado depois de selecionar outro contrato', async () => {
  let resolveOld
  contractControlAPI.detail.mockImplementation((id) => id === 'a' ? new Promise((resolve) => { resolveOld = resolve }) : Promise.resolve({ data: { contract: pending, providers: [], prices: [] } }))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir contrato TESTE-A' }))
  await screen.findByText('Carregando contrato…')
  fireEvent.click(screen.getByRole('button', { name: 'Fechar', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Abrir contrato TESTE-B' }))
  await screen.findByRole('dialog', { name: 'Contrato TESTE-B' })
  await act(async () => resolveOld({ data: { contract: opened, providers: [provider], prices: [price] } }))
  expect(screen.getByRole('dialog', { name: 'Contrato TESTE-B' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'Contrato TESTE-A' })).not.toBeInTheDocument()
})

it('reconsulta a lista ao voltar de uma atualização financeira, sem remontar a tela de faturas', async () => {
  mount()
  await screen.findByRole('button', { name: 'Abrir contrato TESTE-A' })
  fireEvent.click(screen.getByRole('button', { name: 'Faturas e pagamentos', exact: true }))
  const financialAction = await screen.findByRole('button', { name: 'Simular atualização financeira' })
  fireEvent.click(financialAction)
  expect(financialAction).toBeInTheDocument()
  expect(contractControlAPI.contracts).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Contratos', exact: true }))
  await waitFor(() => expect(contractControlAPI.contracts).toHaveBeenCalledTimes(2))
})

it('oferece apenas o posto do contrato e preserva o formulário após rejeição da emissão', async () => {
  fuelSupplyOrdersAPI.create.mockRejectedValue({ response: { data: { detail: 'Preço alterado. Confira novamente.' } } })
  render(<MemoryRouter><FuelSupplyOrderCreateForm {...catalogs} initialContractId="a" returnTo="/processos-pagamento?contract_id=a" /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Posto')).toHaveValue('station-a'))
  expect(within(screen.getByLabelText('Posto')).queryByRole('option', { name: 'Posto B' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Veículo'), { target: { value: 'car' } })
  fireEvent.change(screen.getByPlaceholderText(/Informações adicionais/), { target: { value: 'Observação mantida' } })
  const create = screen.getByRole('button', { name: 'Criar ordem' })
  await waitFor(() => expect(create).toBeEnabled())
  expect(fuelSupplyOrdersAPI.create).not.toHaveBeenCalled()
  fireEvent.click(create)
  await screen.findByText(/Preço alterado/)
  expect(screen.getByLabelText('Veículo')).toHaveValue('car')
  expect(screen.getByLabelText('Posto')).toHaveValue('station-a')
  expect(screen.getByLabelText('Litros previstos')).toHaveValue(30)
  expect(screen.getByPlaceholderText(/Informações adicionais/)).toHaveValue('Observação mantida')
  expect(fuelSupplyOrdersAPI.create).toHaveBeenCalledWith(expect.objectContaining({ contract_id: 'a', fuel_station_id: 'station-a' }))
})

it('pede uma escolha quando o contrato possui mais de um posto', async () => {
  contractControlAPI.eligible.mockResolvedValue({ data: [{ ...fuelContract, providers: [provider, { ...provider, id: 'p-b', fuel_station_id: 'station-b' }] }] })
  render(<FuelSupplyOrderCreateForm {...catalogs} initialContractId="a" />)
  await screen.findByText(/Contrato TESTE-A/)
  expect(screen.getByLabelText('Posto')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Criar ordem' })).toBeDisabled()
  expect(contractControlAPI.quote).not.toHaveBeenCalled()
})

it('mantém contrato e oficina de manutenção no escopo e conserva os dados quando falta saldo', async () => {
  contractControlAPI.eligible.mockResolvedValue({ data: [{ ...opened, kind: 'MAINTENANCE', providers: [{ id: 'work-a', name: 'Oficina A' }], prices: [] }, { ...opened, id: 'other', kind: 'MAINTENANCE', providers: [{ id: 'work-b', name: 'Oficina B' }], prices: [] }] })
  maintenanceOrdersAPI.create.mockRejectedValue({ response: { data: { detail: 'Saldo insuficiente' } } })
  render(<MaintenanceOrderForm vehicles={catalogs.vehicles} initialContractId="a" />)
  await waitFor(() => expect(screen.getByLabelText('Contrato para reserva')).toHaveValue('a'))
  expect(screen.getByLabelText('Contrato para reserva')).toBeDisabled()
  expect(within(screen.getByLabelText('Prestador para reserva')).queryByRole('option', { name: 'Oficina B' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Veículo para manutenção'), { target: { value: 'car' } })
  fireEvent.change(screen.getByLabelText('Orçamento previsto'), { target: { value: '500' } })
  fireEvent.change(screen.getByLabelText('Serviço solicitado'), { target: { value: 'Revisão de testes completa' } })
  fireEvent.click(screen.getByRole('button', { name: 'Autorizar e reservar saldo' }))
  await screen.findByText('Saldo insuficiente')
  expect(screen.getByLabelText('Orçamento previsto')).toHaveValue('500')
  expect(screen.getByLabelText('Serviço solicitado')).toHaveValue('Revisão de testes completa')
  expect(maintenanceOrdersAPI.create).toHaveBeenCalledWith(expect.objectContaining({ contract_id: 'a', provider_id: 'work-a' }))
})

it('consulta serviços sem conciliação no servidor e oferece seleção explícita da fatura', async () => {
  contractControlAPI.operations.mockResolvedValue({ data: { data: [{ id: 'op', source_type: 'FUEL_SUPPLY', source_id: 'order-123', occurred_at: '2026-10-23T12:00:00Z', amount: '120' }], total: 1, pages: 1 } })
  mount('/processos-pagamento?contract_id=a&operations_start=2026-10-01', <ContractCommitmentsBrowser contract={opened} mode="operations" />)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Sem conciliação' }))
  await waitFor(() => expect(contractControlAPI.operations).toHaveBeenLastCalledWith('a', expect.objectContaining({ unbilled: true, start: expect.any(String), page: 1 })))
  const target = new URL((await screen.findByRole('link', { name: 'Selecionar fatura existente' })).getAttribute('href'), 'https://local.test')
  expect(target.searchParams.get('contract_id')).toBe('a')
  expect(target.searchParams.get('view')).toBe('payments')
  expect(target.searchParams.get('operations_unbilled')).toBe('1')
  const draft = new URL(screen.getByRole('link', { name: 'Criar processo', exact: true }).getAttribute('href'), 'https://local.test')
  expect(draft.searchParams.get('contract_id')).toBe('a')
  expect(draft.searchParams.get('new_process_operation')).toBe('op')
  expect(draft.searchParams.has('focus_process')).toBe(false)
})

it('carrega faturas do contrato escolhido e abre o processo sem conciliar automaticamente', async () => {
  const open = vi.fn()
  paymentProcessesAPI.list.mockResolvedValue({ data: { data: [{ id: 'invoice-a', process_number: 'NF-TESTE', stage_label: 'Montagem', amount: '120' }], pagination: { total: 1, pages: 1 } } })
  render(<ContractInvoicesPanel contract={opened} onOpen={open} onBrowse={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'NF-TESTE' }))
  expect(paymentProcessesAPI.list).toHaveBeenCalledWith(expect.objectContaining({ contract_id: 'a' }))
  expect(open).toHaveBeenCalledWith('invoice-a')
})
