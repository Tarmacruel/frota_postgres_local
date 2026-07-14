import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Layout from './Layout'

const mocks = vi.hoisted(() => ({
  allowedModules: new Set(),
  canView: vi.fn(),
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

function renderLayout() {
  return render(
    <MemoryRouter>
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
    mocks.canView.mockImplementation((module) => mocks.allowedModules.has(module))
    window.scrollTo = vi.fn()
  })

  it('prioriza posses e ordens sem remover manutenção do menu principal', () => {
    renderLayout()

    expect(mobileRoutes()).toEqual([
      '/',
      '/vehicles',
      '/posses',
      '/condutores',
      '/ordens-abastecimento',
    ])

    const mobileNavigation = screen.getByRole('navigation', { name: 'Navegação móvel' })
    expect(within(mobileNavigation).getByText('Ordens')).toBeInTheDocument()
    expect(within(mobileNavigation).getByRole('link', { name: 'Ordens de abastecimento' })).toHaveAttribute('href', '/ordens-abastecimento')
    expect(within(mobileNavigation).getByRole('link', { name: 'Condutores' })).toHaveTextContent('Condut.')
    expect(within(mobileNavigation).queryByText('Manutenções')).not.toBeInTheDocument()

    const operationalNavigation = screen.getByRole('navigation', { name: 'Operacional' })
    expect(within(operationalNavigation).getByRole('link', { name: 'Manutenções. Custos' })).toHaveAttribute('href', '/manutencoes')
  })

  it('mantém os atalhos condicionados às permissões de visualização', () => {
    mocks.allowedModules = new Set(['vehicles', 'drivers', 'maintenance'])

    renderLayout()

    expect(mobileRoutes()).toEqual(['/', '/vehicles', '/condutores'])
  })
})
