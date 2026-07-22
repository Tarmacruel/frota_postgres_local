import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FuelSuppliesPage from './FuelSuppliesPage'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  listOrganizations: vi.fn(),
  listStations: vi.fn(),
  listSupplies: vi.fn(),
  listOrders: vi.fn(),
  canCreate: vi.fn(),
}))

vi.mock('../api/client', () => ({ default: { get: mocks.get } }))
vi.mock('../api/masterData', () => ({
  masterDataAPI: { listOrganizations: mocks.listOrganizations },
}))
vi.mock('../api/fuelStations', () => ({
  fuelStationsAPI: { list: mocks.listStations },
}))
vi.mock('../api/fuelSupplies', () => ({
  fuelSuppliesAPI: { list: mocks.listSupplies },
}))
vi.mock('../api/fuelSupplyOrders', () => ({
  fuelSupplyOrdersAPI: {
    list: mocks.listOrders,
    listAllForReport: vi.fn(),
    cancel: vi.fn(),
  },
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    canCreate: mocks.canCreate,
    canEdit: () => true,
    canView: () => true,
    isAdmin: true,
    isProduction: false,
  }),
}))
vi.mock('../components/Modal', () => ({
  default: ({ open, title, children }) => (open ? <section role="dialog" aria-label={title}>{children}</section> : null),
}))
vi.mock('../components/Pagination', () => ({ default: () => null }))
vi.mock('../components/SearchableSelect', () => ({ default: ({ placeholder }) => <button type="button">{placeholder}</button> }))
vi.mock('../components/FuelSupplyOrderCreateForm', () => ({ default: () => <div>Formulário de nova ordem</div> }))
vi.mock('../utils/fuelSupplyOrderDocument', () => ({
  downloadFuelSupplyOrderDocument: vi.fn(),
  previewFuelSupplyOrderDocument: vi.fn(),
}))
vi.mock('../utils/exportData', () => ({
  exportRowsToXlsx: vi.fn(),
  previewRowsToPdf: vi.fn(),
}))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function renderPage(initialEntry = '/abastecimentos?acao=nova-ordem') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/abastecimentos" element={<><FuelSuppliesPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FuelSuppliesPage quick order action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canCreate.mockReturnValue(true)
    mocks.get.mockResolvedValue({ data: [] })
    mocks.listOrganizations.mockResolvedValue({ data: [] })
    mocks.listStations.mockResolvedValue({ data: [] })
    mocks.listSupplies.mockResolvedValue({ data: { data: [] } })
    mocks.listOrders.mockResolvedValue({ data: { data: [] } })
  })

  it('abre o formulário oficial e remove apenas o comando da URL', async () => {
    renderPage('/abastecimentos?acao=nova-ordem&origem=mobile')

    expect(await screen.findByRole('dialog', { name: 'Nova ordem de abastecimento' })).toHaveTextContent('Formulário de nova ordem')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/abastecimentos\?origem=mobile$/))
    expect(screen.getByTestId('location')).not.toHaveTextContent('acao=nova-ordem')
  })

  it('não abre o formulário quando o perfil não pode criar ordens', async () => {
    mocks.canCreate.mockReturnValue(false)

    renderPage()

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/abastecimentos$/))
    expect(screen.queryByRole('dialog', { name: 'Nova ordem de abastecimento' })).not.toBeInTheDocument()
  })
})

describe('FuelSuppliesPage administrative adjustments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canCreate.mockReturnValue(true)
    mocks.get.mockResolvedValue({ data: [] })
    mocks.listOrganizations.mockResolvedValue({ data: [] })
    mocks.listStations.mockResolvedValue({ data: [] })
    mocks.listSupplies.mockResolvedValue({ data: { data: [] } })
    mocks.listOrders.mockResolvedValue({ data: { data: [] } })
  })

  it('oferece retificação auditável para abastecimento confirmado por ordem', async () => {
    mocks.listSupplies.mockResolvedValue({
      data: {
        data: [{
          id: 'supply-1',
          fuel_supply_order_id: 'order-1',
          vehicle_plate: 'THE3C94',
          supplied_at: '2026-07-10T17:45:00Z',
          organization_name: 'Secretaria de Segurança e Transporte',
          fuel_station_name: 'LJ POSTO',
          liters: 30,
          total_amount: 225.30,
          odometer_km: 9278,
          fuel_type: 'Gasolina comum',
          receipt_url: '/api/fuel-supplies/supply-1/receipt',
        }],
      },
    })

    renderPage('/abastecimentos')

    fireEvent.click(await screen.findByRole('button', { name: 'Retificar' }))
    expect(screen.getByRole('dialog', { name: 'Retificar confirmação de abastecimento' })).toBeInTheDocument()
    expect(screen.getByLabelText('Valor total (R$)')).toHaveValue(225.3)
    expect(screen.getByLabelText('Justificativa da retificação')).toBeRequired()
  })

  it('oferece reabertura auditável para ordem expirada', async () => {
    mocks.listOrders.mockResolvedValue({
      data: {
        data: [{
          id: 'order-expired',
          status: 'EXPIRED',
          vehicle_plate: 'THE3C94',
          expires_at: '2026-07-10T17:45:00Z',
          requested_liters: 30,
        }],
      },
    })

    renderPage('/abastecimentos')

    fireEvent.click(await screen.findByRole('button', { name: 'Reabrir prazo' }))
    expect(screen.getByRole('dialog', { name: 'Reabrir prazo da ordem' })).toBeInTheDocument()
    expect(screen.getByLabelText('Novo prazo')).toBeRequired()
    expect(screen.getByLabelText('Justificativa')).toBeRequired()
  })
})
