import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import MaintenancePage from './MaintenancePage'
import api from '../api/client'
import { maintenanceAPI } from '../api/maintenance'

const auth = vi.hoisted(() => ({ create: true, edit: true, remove: true }))

vi.mock('../api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('../api/maintenance', () => ({ maintenanceAPI: { list: vi.fn(), remove: vi.fn() } }))
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
vi.mock('../components/Pagination', () => ({ default: () => null }))
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
  api.get.mockResolvedValue({ data: [vehicle] })
  maintenanceAPI.list.mockResolvedValue({ data: [maintenance] })
})

it('mantém as fontes atuais e apresenta miniatura, status e ações da manutenção', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><MaintenancePage /></MemoryRouter>)

  expect(await screen.findByText('Revisão preventiva')).toBeInTheDocument()
  expect(api.get).toHaveBeenCalledWith('/vehicles', { params: { limit: expect.any(Number) } })
  expect(maintenanceAPI.list).toHaveBeenCalledWith({})
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
