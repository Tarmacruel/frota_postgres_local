import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AnalyticsEntityDrawer from './AnalyticsEntityDrawer'
import AnalyticsEntityLink from './AnalyticsEntityLink'
import useAnalyticsDetailStack from './useAnalyticsDetailStack'
import { analyticsV2API } from '../../api/analyticsV2'
import api from '../../api/client'

vi.mock('../../api/analyticsV2', () => ({ analyticsV2API: { entity: vi.fn(), costEvents: vi.fn(), fuelEvents: vi.fn(), mileageEvents: vi.fn(), maintenanceEvents: vi.fn() } }))
vi.mock('../../api/client', () => ({ default: { get: vi.fn() } }))

const filters = { date_from: '2026-09-01', date_to: '2026-09-30', organization: 'org-1' }
function DetailHarness() {
  const detail = useAnalyticsDetailStack()
  return <><AnalyticsEntityLink entityId="vehicle-1" entityType="vehicle" entityName="ABC1D23"
    origin={{ label: 'Alerta', formula: 'Flag registrada no abastecimento.' }}
    onOpen={(item) => detail.open({ ...item, filters })}>Abrir alerta</AnalyticsEntityLink>
    <AnalyticsEntityDrawer detail={detail.current} canGoBack={detail.canGoBack} onOpen={detail.open} onBack={detail.back} onClose={detail.close} />
  </>
}

beforeEach(() => {
  vi.clearAllMocks()
  const amount = { value: '10', known_value: '10', records: 1, missing_or_invalid: 0 }
  analyticsV2API.entity.mockResolvedValue({ data: { subtitle: 'Sedan', period: filters, methodology: 'Valores registrados.',
    totals: { operational_cost: amount, fuel: amount, maintenance: amount, fines: amount, claim_estimate: amount },
    risk_score: null, total_events: 1, timeline_limit: 100,
    events: [{ id: 'supply-1', source: 'fuel_supply', date: '2026-09-10', vehicle_id: 'vehicle-1', plate: 'ABC1D23',
      driver_id: 'driver-1', driver_name: 'Condutora', amount: '10', anomaly: true, status: null }] } })
  api.get.mockResolvedValue({ data: { supplied_at: '2026-09-10T12:00:00Z', liters: '5', total_amount: '10', is_consumption_anomaly: true } })
  analyticsV2API.costEvents.mockResolvedValue({ data: { total_events: 1, offset: 0, events: [{ id: 'supply-1', source: 'fuel_supply',
    date: '2026-09-10', vehicle_id: 'vehicle-1', plate: 'ABC1D23', driver_id: null, driver_name: null,
    amount: '10', anomaly: false, status: null }] } })
  analyticsV2API.fuelEvents.mockResolvedValue({ data: { total_events: 1, offset: 0, events: [{ id: 'supply-1', source: 'fuel_supply',
    date: '2026-09-10', vehicle_id: 'vehicle-1', plate: 'ABC1D23', driver_id: null, driver_name: null,
    amount: '10', anomaly: false, status: null }] } })
  analyticsV2API.mileageEvents.mockResolvedValue({ data: { total_events: 1, total_distance_km: '100', offset: 0,
    events: [{ id: 'possession-1', public_number: 42, vehicle_id: 'vehicle-1', plate: 'ABC1D23',
      start_date: '2026-09-10T10:00:00Z', end_date: '2026-09-11T10:00:00Z',
      start_odometer_km: '1000', end_odometer_km: '1100', distance_km: '100' }] } })
  analyticsV2API.maintenanceEvents.mockResolvedValue({ data: { total_events: 1, offset: 0,
    events: [{ id: 'maintenance-1', vehicle_id: 'vehicle-1', plate: 'ABC1D23',
      start_date: '2026-09-10T10:00:00Z', end_date: null, cost: '100', duration_hours: null }] } })
})

function Harness() {
  const detail = useAnalyticsDetailStack()
  return <><AnalyticsEntityLink entityId={1} entityType="vehicle" entityName="Veículo de teste" onOpen={detail.open}>Abrir veículo</AnalyticsEntityLink>
    <AnalyticsEntityDrawer detail={detail.current} canGoBack={detail.canGoBack} onBack={detail.back} onClose={detail.close}>
      <button onClick={() => detail.open({ entityId: 2, entityType: 'driver', title: 'Condutor de teste' })}>Abrir condutor</button>
    </AnalyticsEntityDrawer></>
}

describe('AnalyticsEntityDrawer', () => {
  it('abre histórico de manutenção, registro de domínio e volta com fórmula', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValueOnce({ data: { start_date: '2026-09-10T10:00:00Z', end_date: null,
      total_cost: '100', service_description: 'Serviço registrado' } })
    function MaintenanceHarness() {
      const detail = useAnalyticsDetailStack()
      return <><button onClick={() => detail.open({ entityType: 'maintenance-events', title: 'Manutenções abertas',
        maintenanceSubset: 'open', filters, origin: { label: 'Abertas', formula: 'Fim ausente.' } })}>Abrir manutenção</button>
        <AnalyticsEntityDrawer detail={detail.current} canGoBack={detail.canGoBack} onOpen={detail.open} onBack={detail.back} onClose={detail.close} /></>
    }
    render(<MaintenanceHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir manutenção' }))
    expect(await screen.findByText(/1 intervenção\(ões\) no recorte/)).toBeInTheDocument()
    expect(analyticsV2API.maintenanceEvents).toHaveBeenCalledWith({ ...filters, subset: 'open' }, expect.any(AbortSignal))
    await user.click(screen.getByRole('button', { name: /Manutenção · 10\/09\/2026/ }))
    expect(await screen.findByText('Serviço registrado')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/maintenance/maintenance-1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    await user.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(screen.getByRole('region', { name: 'Como foi calculado?' })).toHaveTextContent('Fim ausente.')
  })
  it('lista as posses válidas que compõem o denominador e preserva o contexto', async () => {
    const user = userEvent.setup()
    function MileageHarness() {
      const detail = useAnalyticsDetailStack()
      return <><button onClick={() => detail.open({ entityType: 'mileage-events', title: 'Posses do denominador', filters,
        origin: { label: 'Km válido', formula: 'Posses encerradas válidas.' } })}>Abrir km</button>
        <AnalyticsEntityDrawer detail={detail.current} canGoBack={detail.canGoBack} onOpen={detail.open} onBack={detail.back} onClose={detail.close} /></>
    }
    render(<MileageHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir km' }))
    expect(await screen.findByText(/Posse nº 42/)).toBeInTheDocument()
    expect(screen.getAllByText(/100 km/).length).toBeGreaterThan(0)
    expect(analyticsV2API.mileageEvents).toHaveBeenCalledWith(filters, expect.any(AbortSignal))
    await user.click(screen.getByRole('button', { name: 'ABC1D23' }))
    expect(analyticsV2API.entity).toHaveBeenCalledWith('vehicle', 'vehicle-1', filters, expect.any(AbortSignal))
    await user.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(screen.getByRole('dialog', { name: 'Posses do denominador' })).toBeInTheDocument()
  })
  it('abre abastecimentos de um posto, registro original e comprovante preservando o filtro', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValueOnce({ data: { supplied_at: '2026-09-10T12:00:00Z', odometer_km: 1200,
      liters: '5', total_amount: '10', fuel_type: 'DIESEL', fuel_station_name: 'Posto teste',
      receipt_url: '/api/fuel-supplies/supply-1/receipt', is_consumption_anomaly: false } })
    function FuelHarness() {
      const detail = useAnalyticsDetailStack()
      return <><button onClick={() => detail.open({ entityType: 'fuel-events', title: 'Posto teste',
        stationKey: 'name:posto teste', filters, origin: { label: 'Posto teste', formula: 'Soma de litros.' } })}>Abrir posto</button>
        <AnalyticsEntityDrawer detail={detail.current} canGoBack={detail.canGoBack} onOpen={detail.open} onBack={detail.back} onClose={detail.close} /></>
    }
    render(<FuelHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir posto' }))
    expect(await screen.findByText(/1 registro\(s\) de origem/)).toBeInTheDocument()
    expect(analyticsV2API.fuelEvents).toHaveBeenCalledWith({ ...filters, station: 'name:posto teste' }, expect.any(AbortSignal))
    await user.click(screen.getByRole('button', { name: /Abastecimento · 10\/09\/2026/ }))
    expect(await screen.findByRole('link', { name: 'Abrir comprovante no fluxo original' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir comprovante no fluxo original' })).toHaveAttribute('href', '/api/fuel-supplies/supply-1/receipt')
    expect(screen.getByRole('region', { name: 'Como foi calculado?' })).toHaveTextContent('Soma de litros.')
    await user.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(screen.getByRole('dialog', { name: 'Posto teste' })).toBeInTheDocument()
  })
  it('abre custo agregado, registro de domínio e volta preservando a origem', async () => {
    const user = userEvent.setup()
    function CostHarness() {
      const detail = useAnalyticsDetailStack()
      return <><button onClick={() => detail.open({ entityType: 'costs', title: 'Combustível', costSource: 'fuel_supply',
        filters, origin: { label: 'Combustível', formula: 'Valor registrado.' } })}>Abrir custo</button>
        <AnalyticsEntityDrawer detail={detail.current} canGoBack={detail.canGoBack} onOpen={detail.open} onBack={detail.back} onClose={detail.close} /></>
    }
    render(<CostHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir custo' }))
    expect(await screen.findByText(/1 registro\(s\) de origem/)).toBeInTheDocument()
    expect(analyticsV2API.costEvents).toHaveBeenCalledWith(expect.objectContaining({ source: 'fuel_supply', ...filters }), expect.any(AbortSignal))
    await user.click(screen.getByRole('button', { name: /Abastecimento · 10\/09\/2026/ }))
    expect(await screen.findByText(/consulta ao registro de domínio/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(screen.getByRole('region', { name: 'Como foi calculado?' })).toHaveTextContent('Valor registrado.')
  })
  it('vai do alerta ao registro via API de domínio e volta com explicação e filtros', async () => {
    const user = userEvent.setup()
    render(<DetailHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir alerta' }))
    expect(await screen.findByText('Registros do período')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Como foi calculado?' })).toHaveTextContent('Flag registrada')
    expect(analyticsV2API.entity).toHaveBeenCalledWith('vehicle', 'vehicle-1', filters, expect.any(AbortSignal))
    await user.click(screen.getByRole('button', { name: /Abastecimento · 10\/09\/2026/ }))
    expect(await screen.findByText('consulta ao registro de domínio', { exact: false })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/fuel-supplies/supply-1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    await user.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(screen.getByText('Registros do período')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Como foi calculado?' })).toBeInTheDocument()
  })

  it('carrega a continuação da timeline sem perder o recorte', async () => {
    analyticsV2API.entity.mockResolvedValueOnce({ data: {
      subtitle: 'Sedan', period: filters, methodology: 'Valores registrados.',
      totals: Object.fromEntries(['operational_cost', 'fuel', 'maintenance', 'fines', 'claim_estimate'].map((key) => [key, { value: '0' }])),
      risk_score: null, total_events: 2, events: [{ id: 'one', source: 'fuel_supply', date: '2026-09-10', amount: '10',
        vehicle_id: 'vehicle-1', plate: 'ABC1D23', driver_id: null, driver_name: null, anomaly: false, status: null }],
    } })
    analyticsV2API.entity.mockResolvedValueOnce({ data: { events: [{ id: 'two', source: 'fine', date: '2026-09-09', amount: '20',
      vehicle_id: 'vehicle-1', plate: 'ABC1D23', driver_id: null, driver_name: null, anomaly: false, status: 'PENDENTE' }] } })
    const user = userEvent.setup()
    render(<DetailHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir alerta' }))
    await user.click(await screen.findByRole('button', { name: 'Carregar mais registros' }))
    expect(await screen.findByRole('button', { name: /Multa · 09\/09\/2026/ })).toBeInTheDocument()
    expect(analyticsV2API.entity).toHaveBeenLastCalledWith('vehicle', 'vehicle-1', { ...filters, offset: 1 })
  })
  it('Escape volta um nível, Voltar preserva pilha e Fechar restaura foco', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: /Abrir veículo/ })
    trigger.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement))
    await user.click(screen.getByRole('button', { name: 'Abrir condutor' }))
    expect(screen.getByRole('dialog', { name: 'Condutor de teste' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Veículo de teste' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abrir condutor' }))
    await user.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(screen.getByRole('dialog', { name: 'Veículo de teste' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abrir condutor' }))
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    await user.keyboard('{Enter}{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mantém Tab e Shift+Tab dentro do diálogo', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /Abrir veículo/ }))
    await waitFor(() => expect(document.activeElement).toHaveClass('analytics-drawer__content'))
    await act(() => new Promise((resolve) => window.requestAnimationFrame(resolve)))
    const last = screen.getByRole('button', { name: 'Abrir condutor' })
    last.focus()
    await user.tab()
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement)
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  it('substitui somente o topo da pilha', () => {
    const { result } = renderHook(() => useAnalyticsDetailStack())
    act(() => result.current.open({ entityId: 1 }))
    act(() => result.current.open({ entityId: 2 }))
    act(() => result.current.replace({ entityId: 3 }))
    expect(result.current.stack).toEqual([{ entityId: 1 }, { entityId: 3 }])
    act(() => result.current.back())
    expect(result.current.current).toEqual({ entityId: 1 })
    act(() => result.current.close())
    expect(result.current.isOpen).toBe(false)
  })
})
