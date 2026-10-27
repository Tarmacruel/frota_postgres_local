import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FuelSuppliesPage from './FuelSuppliesPage'
import { exportRowsToXlsx } from '../utils/exportData'

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
  default: ({ open, title, children, onClose }) => (open ? <section role="dialog" aria-label={title}><button onClick={onClose}>Fechar</button>{children}</section> : null),
}))
vi.mock('../components/Pagination', () => ({ default: () => null }))
vi.mock('../components/SearchableSelect', () => ({ default: ({ placeholder }) => <button type="button">{placeholder}</button> }))
vi.mock('../components/FuelSupplyOrderCreateForm', () => ({ default: () => <div>Formulário de nova ordem</div> }))
vi.mock('../components/FuelSupplyOrderBatchCreateForm', () => ({ default: () => <div>Formulário de ordens em lote</div> }))
vi.mock('../components/GuidedTour', () => ({
  default: ({ replayToken }) => <div data-testid="fuel-batch-guided-tour">Tour de lote {replayToken}</div>,
}))
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

const paged = (rows) => ({ data: { data: rows, pagination: { page: 1, pages: 1, total: rows.length, limit: 10 } } })

describe('FuelSuppliesPage quick order action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canCreate.mockReturnValue(true)
    mocks.get.mockResolvedValue({ data: [] })
    mocks.listOrganizations.mockResolvedValue({ data: [] })
    mocks.listStations.mockResolvedValue({ data: [] })
    mocks.listSupplies.mockResolvedValue(paged([]))
    mocks.listOrders.mockResolvedValue(paged([]))
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

  it('abre o lote e inicia o guia pela URL de novidade', async () => {
    renderPage('/abastecimentos?acao=nova-ordem-lote&guia=1&origem=novidade')

    expect(await screen.findByRole('dialog', { name: 'Nova ordem de abastecimento em lote' })).toHaveTextContent('Formulário de ordens em lote')
    expect(screen.getByTestId('fuel-batch-guided-tour')).toHaveTextContent('Tour de lote 1')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/abastecimentos\?origem=novidade$/))
  })

  it('oferece o guia rápido manualmente para quem pode emitir ordens', async () => {
    renderPage('/abastecimentos')

    fireEvent.click(await screen.findByRole('button', { name: 'Ver guia rápido' }))

    expect(screen.getByRole('dialog', { name: 'Nova ordem de abastecimento em lote' })).toBeInTheDocument()
    expect(screen.getByTestId('fuel-batch-guided-tour')).toHaveTextContent('Tour de lote 1')
  })
})

describe('FuelSuppliesPage administrative adjustments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canCreate.mockReturnValue(true)
    mocks.get.mockResolvedValue({ data: [] })
    mocks.listOrganizations.mockResolvedValue({ data: [] })
    mocks.listStations.mockResolvedValue({ data: [] })
    mocks.listSupplies.mockResolvedValue(paged([]))
    mocks.listOrders.mockResolvedValue(paged([]))
  })

  it('carrega todas as ordens filtradas somente ao solicitar o XLSX', async () => {
    mocks.listOrders.mockResolvedValue(paged([{ id: 'order-1', status: 'EXPIRED' }]))
    const reportRows = Array.from({ length: 12 }, (_, index) => ({ id: `order-${index + 1}`, status: 'EXPIRED' }))
    const { fuelSupplyOrdersAPI } = await import('../api/fuelSupplyOrders')
    fuelSupplyOrdersAPI.listAllForReport.mockResolvedValue(reportRows)
    renderPage('/abastecimentos')

    await waitFor(() => expect(mocks.listOrders).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 })))
    expect(fuelSupplyOrdersAPI.listAllForReport).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Exportar XLSX' }))
    await waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalledWith(expect.objectContaining({ rows: reportRows })))
  })

  it('oferece retificação auditável para abastecimento confirmado por ordem', async () => {
    mocks.listSupplies.mockResolvedValue(paged([{
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
        }]))

    renderPage('/abastecimentos')

    fireEvent.click(await screen.findByRole('button', { name: 'Retificar' }))
    expect(screen.getByRole('dialog', { name: 'Retificar confirmação de abastecimento' })).toBeInTheDocument()
    expect(screen.getByLabelText('Valor total (R$)')).toHaveValue('R$ 225,30')
    expect(screen.getByLabelText('Justificativa da retificação')).toBeRequired()
  })

  it('oferece reabertura auditável para ordem expirada', async () => {
    mocks.listOrders.mockResolvedValue(paged([{
          id: 'order-expired',
          status: 'EXPIRED',
          vehicle_plate: 'THE3C94',
          expires_at: '2026-07-10T17:45:00Z',
          requested_liters: 30,
        }]))

    renderPage('/abastecimentos')

    fireEvent.click(await screen.findByRole('button', { name: 'Mais ações da ordem AB-ORDER-EX' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reabrir prazo' }))
    expect(screen.getByRole('dialog', { name: 'Reabrir prazo da ordem' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Novo prazo')).toBeRequired()
    expect(screen.getByLabelText('Justificativa')).toBeRequired()
  })

  it('exibe motivo persistido por hover e clique, preservando filtros e ações', async () => {
    const reason = 'Alerta: consumo 6.45 km/l está mais de 30% abaixo da média histórica (10.20 km/l).'
    mocks.listSupplies.mockResolvedValue(paged([{
      id: 'alert-1', vehicle_plate: 'ABC1D23', supplied_at: '2026-10-06T14:01:00Z',
      is_consumption_anomaly: true, anomaly_details: reason, liters: 40, consumption_km_l: 6.45,
      fuel_supply_order_id: 'order-1', receipt_url: '/api/fuel-supplies/alert-1/receipt',
    }]))
    renderPage('/abastecimentos?vehicle_id=vehicle-1')
    const trigger = await screen.findByRole('button', { name: 'Ver motivo do alerta de ABC1D23' })
    const search = screen.getByPlaceholderText('Buscar por placa, secretaria, posto, combustível ou aditivo')
    fireEvent.change(search, { target: { value: 'ABC1D23' } })
    fireEvent.mouseEnter(trigger)
    expect(screen.getByRole('tooltip')).toHaveTextContent(reason)
    fireEvent.click(trigger)
    const drawer = screen.getByRole('dialog', { name: 'Alerta de abastecimento — ABC1D23' })
    expect(drawer).toHaveTextContent(reason)
    expect(drawer).toHaveTextContent('Rendimento registrado (km/l)')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(search).toHaveValue('ABC1D23')
    expect(screen.getByTestId('location')).toHaveTextContent('/abastecimentos?vehicle_id=vehicle-1')
    expect(screen.getByRole('link', { name: 'Comprovante' })).toHaveAttribute('href', '/api/fuel-supplies/alert-1/receipt')
    expect(screen.getByRole('button', { name: 'Retificar' })).toBeInTheDocument()
  })

  it('informa motivo ausente sem fabricar regra e mantém Regular sem ação de alerta', async () => {
    mocks.listSupplies.mockResolvedValue(paged([
      { id: 'missing', vehicle_plate: 'ABC1D23', is_consumption_anomaly: true, anomaly_details: '   ' },
      { id: 'regular', vehicle_plate: 'DEF4G56', is_consumption_anomaly: false },
    ]))
    renderPage('/abastecimentos')
    fireEvent.click(await screen.findByRole('button', { name: 'Ver motivo do alerta de ABC1D23' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Motivo não informado no registro deste abastecimento.')
    expect(screen.getByText('Regular')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver motivo do alerta de DEF4G56' })).not.toBeInTheDocument()
  })

  it('mantém apenas um resumo ao percorrer alertas e remove todos ao rolar', async () => {
    mocks.listSupplies.mockResolvedValue(paged([
      { id: 'first', vehicle_plate: 'ABC1D23', is_consumption_anomaly: true, anomaly_details: 'Motivo do primeiro registro.' },
      { id: 'second', vehicle_plate: 'DEF4G56', is_consumption_anomaly: true, anomaly_details: 'Motivo do segundo registro.' },
    ]))
    renderPage('/abastecimentos')
    const first = await screen.findByRole('button', { name: 'Ver motivo do alerta de ABC1D23' })
    const second = screen.getByRole('button', { name: 'Ver motivo do alerta de DEF4G56' })
    fireEvent.mouseEnter(first)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Motivo do primeiro registro.')
    // A previous mouseleave is not guaranteed when rows move under a stationary pointer.
    fireEvent.mouseEnter(second)
    expect(screen.getAllByRole('tooltip')).toHaveLength(1)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Motivo do segundo registro.')
    expect(first).not.toHaveAttribute('aria-describedby')
    fireEvent.scroll(window)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.focus(first)
    expect(screen.getAllByRole('tooltip')).toHaveLength(1)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Motivo do primeiro registro.')
    fireEvent.click(first)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('Motivo do primeiro registro.')
  })
})

vi.mock('../api/contractControl', () => ({ contractControlAPI: { config: async () => ({ data: { enabled: false } }) }, maintenanceOrdersAPI: {} }))
