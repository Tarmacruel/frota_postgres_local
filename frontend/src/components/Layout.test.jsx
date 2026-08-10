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
