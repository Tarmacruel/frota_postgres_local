import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Layout from './Layout'

const mocks = vi.hoisted(() => ({
  allowedModules: new Set(),
  creatableModules: new Set(),
  canView: vi.fn(),
  canCreate: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
  registerCpf: vi.fn(),
  pendingSignatures: vi.fn(() => new Promise(() => {})),
  pendingLoans: vi.fn(),
  getFuelSupplyOrdersBatchGuide: vi.fn(),
  acknowledgeFuelSupplyOrdersBatchGuide: vi.fn(),
  mustChangePassword: false,
  mustRegisterCpf: false,
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Servidor responsável' },
    logout: mocks.logout,
    changePassword: mocks.changePassword,
    registerCpf: mocks.registerCpf,
    mustChangePassword: mocks.mustChangePassword,
    mustRegisterCpf: mocks.mustRegisterCpf,
    isAdmin: false,
    canView: mocks.canView,
    canCreate: mocks.canCreate,
    roleLabel: 'Produção',
  }),
}))

vi.mock('../api/adminNotifications', () => ({
  adminNotificationsAPI: {
    unreadCount: vi.fn(),
    list: vi.fn(),
    markAsRead: vi.fn(),
  },
}))

vi.mock('../api/vehicleLoans', () => ({ vehicleLoansAPI: { pendingSummary: mocks.pendingLoans } }))

vi.mock('../api/documentSignatures', () => ({
  documentSignaturesAPI: {
    pending: mocks.pendingSignatures,
    declineRequest: vi.fn(),
  },
}))

vi.mock('../api/featureGuides', () => ({
  featureGuidesAPI: {
    getFuelSupplyOrdersBatch: mocks.getFuelSupplyOrdersBatchGuide,
    acknowledgeFuelSupplyOrdersBatch: mocks.acknowledgeFuelSupplyOrdersBatchGuide,
  },
}))

vi.mock('./SearchOverlay', () => ({ default: () => null }))
vi.mock('./Modal', () => ({
  default: ({ open, title, description, children }) => (open ? (
    <section role="dialog" aria-label={title}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ) : null),
}))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-location">{`${location.pathname}${location.search}`}</output>
}

function renderLayout(initialEntry = '/', { strict = false } = {}) {
  const layout = strict ? <StrictMode><Layout /></StrictMode> : <Layout />
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      {layout}
      <LocationProbe />
    </MemoryRouter>,
  )
}

function mobileRoutes() {
  const navigation = screen.getByRole('navigation', { name: 'Navegação móvel' })
  return within(navigation).getAllByRole('link').map((link) => link.getAttribute('href'))
}

describe('Layout global shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.scrollTo = vi.fn()
    mocks.allowedModules = new Set(['vehicles', 'vehicle_loans', 'possession', 'drivers'])
    mocks.creatableModules = new Set()
    mocks.canView.mockImplementation((module) => mocks.allowedModules.has(module))
    mocks.canCreate.mockReturnValue(false)
    mocks.mustChangePassword = false
    mocks.mustRegisterCpf = false
    mocks.pendingLoans.mockResolvedValue({ data: { total: 0 } })
  })

  it('mantém o teclado no drawer aberto e restaura o acionador ao fechar por Escape', async () => {
    const user = userEvent.setup()
    renderLayout('/vehicles')
    const trigger = screen.getByRole('button', { name: 'Abrir navegação' })
    await user.click(trigger)
    const navigation = screen.getByRole('complementary', { name: 'Navegação principal' })
    await waitFor(() => expect(navigation.contains(document.activeElement)).toBe(true))
    const first = document.activeElement
    await user.tab({ shift: true })
    expect(within(navigation).getByRole('button', { name: 'Encerrar sessão' })).toHaveFocus()
    await user.tab()
    expect(first).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(navigation).not.toHaveClass('is-open')
    expect(trigger).toHaveFocus()
  })

  it('preserva navegação, identidade, tema e preferência da sidebar', async () => {
    const user = userEvent.setup()
    const { container } = renderLayout('/vehicles')

    expect(screen.getByRole('complementary', { name: 'Navegação principal' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Visão geral' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Veículos. Frota' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByLabelText('Usuário: Servidor responsável. Perfil: Produção')).toHaveTextContent('SR')

    await user.click(screen.getByRole('button', { name: 'Ativar modo escuro' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(window.localStorage.getItem('frota-theme')).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Abrir navegação' }))
    expect(container.querySelector('.app-sidebar')).toHaveClass('is-open')
    await user.click(screen.getAllByRole('button', { name: 'Fechar navegação' })[0])
    expect(container.querySelector('.app-sidebar')).not.toHaveClass('is-open')

    await user.click(screen.getByRole('button', { name: 'Rebater menu lateral' }))
    expect(container.querySelector('.app-shell')).toHaveClass('sidebar-compact')
    expect(window.localStorage.getItem('frota-sidebar-compact')).toBe('1')
  })
})

it('exibe contador de empréstimos no menu sem apagá-lo ao abrir a guia', async () => {
  mocks.allowedModules = new Set(['vehicle_loans'])
  mocks.canView.mockImplementation((module) => mocks.allowedModules.has(module))
  mocks.canCreate.mockReturnValue(false)
  mocks.mustChangePassword = false
  mocks.mustRegisterCpf = false
  mocks.pendingLoans.mockResolvedValue({ data: { total: 2 } })
  renderLayout()
  const link = await screen.findByRole('link', { name: /Empréstimos.*2 solicitações pendentes/ })
  expect(link).toHaveTextContent('2')
  await userEvent.click(link)
  expect(screen.getByRole('link', { name: /Empréstimos.*2 solicitações pendentes/ })).toBeInTheDocument()
})

describe('Layout mobile quick actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.allowedModules = new Set([
      'vehicles',
      'possession',
      'drivers',
      'maintenance',
      'claims',
      'fines',
      'fuel_supplies',
      'fuel_supply_orders',
    ])
    mocks.creatableModules = new Set(['fuel_supply_orders'])
    mocks.canView.mockImplementation((module) => mocks.allowedModules.has(module))
    mocks.canCreate.mockImplementation((module) => mocks.creatableModules.has(module))
    mocks.mustChangePassword = false
    mocks.mustRegisterCpf = false
    mocks.getFuelSupplyOrdersBatchGuide.mockResolvedValue({ data: { acknowledged: true } })
    mocks.acknowledgeFuelSupplyOrdersBatchGuide.mockResolvedValue({ data: { acknowledged: true } })
    window.scrollTo = vi.fn()
  })

  it('abre o registro de ordem sem remover as listagens do menu principal', () => {
    renderLayout('/abastecimentos')

    expect(mobileRoutes()).toEqual([
      '/',
      '/vehicles',
      '/posses',
      '/condutores',
      '/abastecimentos?acao=nova-ordem',
    ])

    const mobileNavigation = screen.getByRole('navigation', { name: 'Navegação móvel' })
    expect(within(mobileNavigation).getByText('Nova ordem')).toBeInTheDocument()
    const createOrderLink = within(mobileNavigation).getByRole('link', { name: 'Registrar ordem de abastecimento' })
    expect(createOrderLink).toHaveAttribute('href', '/abastecimentos?acao=nova-ordem')
    expect(createOrderLink).not.toHaveAttribute('aria-current')
    expect(within(mobileNavigation).getByRole('link', { name: 'Condutores' })).toHaveTextContent('Condut.')
    expect(within(mobileNavigation).queryByText('Manutenções')).not.toBeInTheDocument()

    const operationalNavigation = screen.getByRole('navigation', { name: 'Operacional' })
    expect(within(operationalNavigation).getByRole('link', { name: 'Manutenções. Custos' })).toHaveAttribute('href', '/manutencoes')
    expect(within(operationalNavigation).getByRole('link', { name: 'Ordens abertas. Pendentes' })).toHaveAttribute('href', '/ordens-abastecimento')
  })

  it('mantém os atalhos condicionados às permissões de visualização', () => {
    mocks.allowedModules = new Set(['vehicles', 'drivers', 'maintenance', 'fuel_supply_orders'])

    renderLayout()

    expect(mobileRoutes()).toEqual(['/', '/vehicles', '/condutores'])
  })

  it('não oferece registro de ordem sem permissão de criação', () => {
    mocks.creatableModules = new Set()

    renderLayout()

    expect(mobileRoutes()).toEqual(['/', '/vehicles', '/posses', '/condutores'])
  })
})

describe('Layout feature guide for batch fuel supply orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.allowedModules = new Set([
      'vehicles',
      'possession',
      'drivers',
      'maintenance',
      'claims',
      'fines',
      'fuel_supplies',
      'fuel_supply_orders',
    ])
    mocks.creatableModules = new Set(['fuel_supply_orders'])
    mocks.canView.mockImplementation((module) => mocks.allowedModules.has(module))
    mocks.canCreate.mockImplementation((module) => mocks.creatableModules.has(module))
    mocks.mustChangePassword = false
    mocks.mustRegisterCpf = false
    mocks.getFuelSupplyOrdersBatchGuide.mockResolvedValue({ data: { acknowledged: true } })
    mocks.acknowledgeFuelSupplyOrdersBatchGuide.mockResolvedValue({ data: { acknowledged: true } })
    window.scrollTo = vi.fn()
  })

  it('não consulta o guia para quem não pode criar ordens ou ainda está com acesso bloqueado', () => {
    mocks.creatableModules = new Set()
    renderLayout()

    expect(mocks.getFuelSupplyOrdersBatchGuide).not.toHaveBeenCalled()

    mocks.creatableModules = new Set(['fuel_supply_orders'])
    mocks.mustChangePassword = true
    renderLayout()

    expect(mocks.getFuelSupplyOrdersBatchGuide).not.toHaveBeenCalled()
  })

  it('mostra a novidade não reconhecida e registra Agora não antes de fechar', async () => {
    const user = userEvent.setup()
    mocks.getFuelSupplyOrdersBatchGuide.mockResolvedValue({ data: { acknowledged: false } })
    renderLayout('/', { strict: true })

    expect(await screen.findByRole('dialog', { name: 'Novo: pedidos de abastecimento em lote' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agora não' }))

    await waitFor(() => expect(mocks.acknowledgeFuelSupplyOrdersBatchGuide).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog', { name: 'Novo: pedidos de abastecimento em lote' })).not.toBeInTheDocument()
  })

  it('reconhece a novidade e abre o guia rápido na tela de abastecimentos', async () => {
    const user = userEvent.setup()
    mocks.getFuelSupplyOrdersBatchGuide.mockResolvedValue({ data: { acknowledged: false } })
    renderLayout()

    await screen.findByRole('dialog', { name: 'Novo: pedidos de abastecimento em lote' })
    await user.click(screen.getByRole('button', { name: 'Ver guia rápido' }))

    await waitFor(() => expect(mocks.acknowledgeFuelSupplyOrdersBatchGuide).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('current-location')).toHaveTextContent('/abastecimentos?acao=nova-ordem-lote&guia=1')
  })
})
