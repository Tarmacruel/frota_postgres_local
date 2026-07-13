import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PossessionPage from './PossessionPage'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  listActive: vi.fn(),
  list: vi.fn(),
  listTrips: vi.fn(),
  reload: vi.fn(),
}))

vi.mock('../api/client', () => ({ default: { get: mocks.get } }))
vi.mock('../api/possession', () => ({
  possessionAPI: {
    listActive: mocks.listActive,
    list: mocks.list,
    listTrips: mocks.listTrips,
    end: vi.fn(),
    update: vi.fn(),
  },
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    canCreate: (module) => module === 'possession',
    canEdit: (module) => module === 'possession',
    isAdmin: false,
    reload: mocks.reload,
  }),
}))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [] }) }))
vi.mock('../components/DriverBadge', () => ({ default: ({ name }) => <span>{name}</span> }))
vi.mock('../components/Pagination', () => ({ default: () => null }))
vi.mock('../components/PossessionTripsModal', () => ({ default: () => null }))
vi.mock('../components/PossessionReportBuilder', () => ({ default: () => <button type="button">Mais opções</button> }))
vi.mock('../components/SearchableSelect', () => ({
  default: ({ placeholder }) => <button type="button">{placeholder}</button>,
}))

const vehicle = {
  id: 'vehicle-1',
  plate: 'ABC1D23',
  brand: 'Marca',
  model: 'Modelo',
  ownership_type: 'PROPRIO',
  current_location: { display_name: 'Garagem municipal', organization_name: 'Secretaria de Teste', organization_id: 'org-1' },
}

const possession = {
  id: 'possession-1',
  public_number: 'POS-2026-000001',
  vehicle_id: vehicle.id,
  vehicle_plate: vehicle.plate,
  driver_name: 'Condutor Teste',
  driver_document: '***.***.***-**',
  driver_contact: 'restrito',
  start_date: '2026-07-13T12:00:00Z',
  end_date: null,
  is_active: true,
  start_odometer_km: '100.0',
  end_odometer_km: null,
  kilometers_driven: null,
  observation: null,
  photo_available: false,
  loan_term_available: false,
  return_term_available: false,
}

describe('PossessionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue({ data: [vehicle] })
    mocks.listActive.mockResolvedValue({ data: [possession] })
    mocks.list.mockResolvedValue({ data: [possession] })
    mocks.listTrips.mockResolvedValue({
      data: {
        data: [{ id: 'trip-1', status: 'EM_ANDAMENTO', sequence_number: 1 }],
        pagination: { page: 1, pages: 1, total: 1, has_next: false, has_prev: false },
      },
    })
  })

  it('bloqueia o encerramento da posse ao confirmar uma rota aberta no backend', async () => {
    render(<MemoryRouter><PossessionPage /></MemoryRouter>)

    expect(await screen.findByRole('button', { name: 'Registrar retorno' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar destino' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar rota' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encerrar posse bloqueado' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Retificar' })).not.toBeInTheDocument()
    expect(mocks.listTrips).toHaveBeenCalledWith(
      possession.id,
      { page: 1, limit: 1, status: 'EM_ANDAMENTO' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
})
