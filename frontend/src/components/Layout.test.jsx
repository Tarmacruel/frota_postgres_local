import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Servidor responsável' },
    logout: mocks.logout,
    changePassword: mocks.changePassword,
    registerCpf: mocks.registerCpf,
    mustChangePassword: false,
    mustRegisterCpf: false,
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

vi.mock('./SearchOverlay', () => ({ default: () => null }))
vi.mock('./Modal', () => ({ default: () => null }))

function renderLayout(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Layout />
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
