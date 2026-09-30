import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import DashboardPage from './DashboardPage'
import api from '../api/client'

const auth = vi.hoisted(() => ({
  user: { name: 'Ana Souza', role: 'ADMIN' },
  isAdmin: true,
  canWrite: true,
  permissions: { vehicles: true, maintenance: true, possession: true },
  canCreateVehicle: true,
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: auth.user,
    isAdmin: auth.isAdmin,
    canWrite: auth.canWrite,
    canView: (module) => Boolean(auth.permissions[module]),
    canCreate: (module) => module === 'vehicles' && auth.canCreateVehicle,
  }),
}))

vi.mock('../api/client', () => ({ default: { get: vi.fn() } }))

function mount() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>)
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.user = { name: 'Ana Souza', role: 'ADMIN' }
  auth.isAdmin = true
  auth.canWrite = true
  auth.permissions = { vehicles: true, maintenance: true, possession: true }
  auth.canCreateVehicle = true
  api.get.mockImplementation((url) => {
    if (url === '/vehicles') {
      return Promise.resolve({ data: [
        { id: 'v1', status: 'ATIVO', current_driver_name: 'Condutor' },
        { id: 'v2', status: 'ATIVO', current_driver_name: null },
        { id: 'v3', status: 'MANUTENCAO' },
        { id: 'v4', status: 'INATIVO' },
      ] })
    }
    if (url === '/maintenance') {
      return Promise.resolve({ data: [
        { id: 'm1', vehicle_plate: 'ABC1D23', service_description: 'Troca de óleo', start_date: '2026-09-30T08:00:00', updated_at: '2026-09-30T09:00:00', end_date: null },
        { id: 'm2', end_date: '2026-09-29T10:00:00' },
      ] })
    }
    if (url === '/possession/active') return Promise.resolve({ data: [{ id: 'p1' }, { id: 'p2' }] })
    return Promise.reject(new Error(`Consulta inesperada: ${url}`))
  })
})

it('mantém as três consultas existentes e apresenta os indicadores calculados', async () => {
  mount()

  expect(await screen.findByRole('heading', { name: 'Olá, Ana!' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('Troca de óleo')).toBeInTheDocument())

  expect(api.get).toHaveBeenCalledTimes(3)
  expect(api.get).toHaveBeenNthCalledWith(1, '/vehicles', { params: { limit: expect.any(Number) } })
  expect(api.get).toHaveBeenNthCalledWith(2, '/maintenance')
  expect(api.get).toHaveBeenNthCalledWith(3, '/possession/active')
  expect(within(screen.getByLabelText('Veículos ativos')).getByText('2')).toBeInTheDocument()
  expect(within(screen.getByLabelText('Em manutenção')).getByText('1')).toBeInTheDocument()
  expect(within(screen.getByLabelText('Sem condutor')).getByText('1')).toBeInTheDocument()
  expect(within(screen.getByLabelText('Pendências abertas')).getByText('1')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Gestão de usuários/ })).toHaveAttribute('href', '/users')
  expect(screen.getByRole('link', { name: /Auditoria administrativa/ })).toHaveAttribute('href', '/auditoria')
})

it('não consulta nem oferece ações de módulos sem permissão', async () => {
  auth.user = { name: 'Rui', role: 'LEITURA' }
  auth.isAdmin = false
  auth.canWrite = false
  auth.permissions = { vehicles: false, maintenance: false, possession: false }
  auth.canCreateVehicle = false

  mount()

  await screen.findByText('A base reúne 0 veículos cadastrados.')
  expect(api.get).not.toHaveBeenCalled()
  expect(screen.queryByText('Abrir veículos ativos')).not.toBeInTheDocument()
  expect(screen.queryByText('Revisar manutenções abertas')).not.toBeInTheDocument()
  expect(screen.queryByText('Ver veículos sem condutor')).not.toBeInTheDocument()
  expect(screen.queryByText('Gestão de usuários')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Consulta e relatórios' })).toBeInTheDocument()
  expect(screen.getByText('Acesso para consulta, filtros e exportações.')).toBeInTheDocument()
})
