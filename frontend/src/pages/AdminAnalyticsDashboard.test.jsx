import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyticsAPI } from '../api/analytics'
import { analyticsV2API } from '../api/analyticsV2'
import AdminAnalyticsDashboard from './AdminAnalyticsDashboard'

vi.mock('../components/analytics/AnalyticsOverview', () => ({ default: () => <div>Cockpit atual</div> }))
vi.mock('../components/analytics/AnalyticsFuel', () => ({ default: () => <div>Combustível V2</div> }))
vi.mock('../components/analytics/AnalyticsMaintenance', () => ({ default: () => <div>Manutenção V2</div> }))
vi.mock('../api/analytics', () => ({ analyticsAPI: Object.fromEntries(
  ['overview', 'efficiency', 'tco', 'driverRisk', 'insights', 'costTrend', 'exportReport'].map((name) => [name, vi.fn()]),
) }))
vi.mock('../api/analyticsV2', () => ({ analyticsV2API: { entity: vi.fn(), costs: vi.fn() } }))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [] }) }))
// Chart layout requires a browser. Keep the real analytics wrappers/tables and isolate Recharts.
vi.mock('recharts', () => {
  const Container = ({ children }) => <div>{children}</div>
  return Object.fromEntries(['ResponsiveContainer', 'BarChart', 'ScatterChart', 'LineChart', 'Bar', 'Scatter', 'Line', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend', 'Cell'].map((key) => [key, Container]))
})

function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output> }
function mount(path = '/analytics?view=fuel') {
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AdminAnalyticsDashboard /><Location /></MemoryRouter>)
}
async function ready() { await screen.findByRole('button', { name: 'Detalhes' }) }
const vehicle = { vehicle_id: 7, vehicle_type: 'SEDAN', total_km: 120, consumption_l_100km: 8, category_average: 9, variance_percentage: -10 }

beforeEach(() => {
  vi.clearAllMocks()
  analyticsAPI.overview.mockResolvedValue({ data: { average_consumption_l_100km: 12.5, average_tco_per_km: 2.3, active_alerts: 2, fleet_active: 40 } })
  analyticsAPI.efficiency.mockResolvedValue({ data: [vehicle] })
  analyticsAPI.tco.mockResolvedValue({ data: [{ vehicle_id: 7, vehicle_type: 'SEDAN', tco_cost_per_km: 2.3, market_benchmark: 1, variance_percentage: 130 }] })
  analyticsAPI.driverRisk.mockResolvedValue({ data: [{ driver_id: 2, driver_name: 'Condutor de teste', fines_count: 1, claims_count: 0, anomalies_count: 1, normalized_risk_score: 20 }] })
  analyticsAPI.insights.mockResolvedValue({ data: [] })
  analyticsAPI.costTrend.mockResolvedValue({ data: [] })
  const amount = { value: '0', known_value: '0', records: 0, missing_or_invalid: 0 }
  analyticsV2API.entity.mockResolvedValue({ data: { subtitle: 'Sedan de teste', period: { date_from: '2026-09-01', date_to: '2026-09-30' },
    methodology: 'Valores registrados no período.', totals: { operational_cost: amount, fuel: amount, maintenance: amount, fines: amount, claim_estimate: amount },
    risk_score: null, total_events: 0, timeline_limit: 100, events: [] } })
  analyticsV2API.costs.mockResolvedValue({ data: { totals: { operational_cost: amount, fuel: amount, maintenance: amount,
    fines: amount, claim_estimate: amount }, measured_cost: amount, measured_distance_km: null, cost_per_km: null,
    measured_vehicles: 0, monthly: [], vehicles: [], organizations: [], methodology: { cost: 'Valores registrados.',
      claims: 'Estimativas separadas.', missing: 'Sem imputação.', organization: 'Responsabilidade histórica.', mileage: 'Posses válidas.' } } })
})

describe('Analytics — fundação V1', () => {
  it('mantém a comparação anterior de custos acessível sob demanda', async () => {
    const user = userEvent.setup()
    mount('/analytics?view=costs')
    expect(await screen.findByRole('region', { name: 'Custo operacional registrado' })).toBeInTheDocument()
    expect(analyticsV2API.costs).toHaveBeenCalledOnce()
    expect(analyticsAPI.tco).not.toHaveBeenCalled()
    await user.click(screen.getByText('Consultar análises anteriores de custos'))
    await waitFor(() => expect(analyticsAPI.tco).toHaveBeenCalledOnce())
    expect(screen.getByText(/não representam TCO completo/)).toBeInTheDocument()
  })
  it('preserva /analytics, oito seções, indicadores e contratos atuais', async () => {
    mount()
    await ready()
    expect(screen.getByText('Combustível V2')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Seções de análises' })).getAllByRole('button')).toHaveLength(8)
    expect(screen.getByText('R$ 2.30')).toBeInTheDocument()
    for (const key of ['overview', 'efficiency', 'tco', 'driverRisk', 'insights']) {
      expect(analyticsAPI[key]).toHaveBeenCalledWith({ period_days: 30, vehicle_type: undefined, organization: undefined })
    }
    expect(analyticsAPI.costTrend).toHaveBeenCalledWith({ months: 12, vehicle_type: undefined, organization: undefined })
    expect(screen.getByTestId('location')).toHaveTextContent('/analytics')
  })

  it('navega por teclado sem refazer consultas e conserva filtro ao abrir/fechar drawer', async () => {
    const user = userEvent.setup()
    mount('/analytics?keep=1&view=fuel')
    await ready()
    await user.click(screen.getByRole('button', { name: 'Período', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Últimos 90 dias' }))
    await waitFor(() => expect(analyticsAPI.overview).toHaveBeenLastCalledWith(expect.objectContaining({ period_days: 90 })))
    const before = analyticsAPI.overview.mock.calls.length
    const tab = screen.getByRole('button', { name: 'Condutores', exact: true })
    tab.focus()
    await user.keyboard('{Enter}')
    expect(tab).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('location')).toHaveTextContent('/analytics?keep=1&view=drivers')
    const trigger = screen.getByRole('button', { name: /Condutor de teste/ })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Condutor de teste' })).toBeInTheDocument()
    expect(await screen.findByText('Registros do período')).toBeInTheDocument()
    expect(analyticsV2API.entity).toHaveBeenCalledWith('driver', 2, expect.objectContaining({ organization: undefined }), expect.any(AbortSignal))
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Período: 90 dias')).toBeInTheDocument()
    expect(analyticsAPI.overview).toHaveBeenCalledTimes(before)
  })

  it('mantém detalhes inline do veículo e permite abrir o shell lateral', async () => {
    const user = userEvent.setup()
    mount('/analytics?view=fuel')
    await user.click(await screen.findByRole('button', { name: 'Detalhes' }))
    expect(screen.getByText(/Média categoria consumo:/)).toBeInTheDocument()
    await user.click(within(screen.getByRole('region', { name: 'Detalhamento por veículo' })).getByRole('button', { name: /SEDAN/ }))
    await user.click(screen.getByRole('button', { name: 'Fechar', exact: true }))
    expect(screen.getByRole('button', { name: 'Ocultar' })).toBeInTheDocument()
  })

  it('não confunde falha parcial com vazio e repete somente a consulta que falhou', async () => {
    analyticsAPI.insights.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    mount('/analytics?view=alerts')
    await screen.findByRole('alert')
    const section = screen.getByRole('region', { name: 'Alertas inteligentes' })
    expect(within(section).getByRole('alert')).toBeInTheDocument()
    expect(within(section).queryByText('Sem alertas no período selecionado.')).not.toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Tentar novamente' }))
    await within(section).findByText('Sem alertas no período selecionado.')
    expect(analyticsAPI.insights).toHaveBeenCalledTimes(2)
    expect(analyticsAPI.overview).toHaveBeenCalledTimes(1)
  })

  it('mostra carregamento sem zeros e descarta resposta antiga após mudar filtros', async () => {
    let resolveOld
    analyticsAPI.efficiency.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const user = userEvent.setup()
    mount()
    expect(screen.getByText('Carregando eficiência por tipo de veículo…')).toBeInTheDocument()
    expect(screen.queryByText('0.00 L/100km')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Período', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Últimos 7 dias' }))
    await ready()
    await act(async () => resolveOld({ data: [{ ...vehicle, consumption_l_100km: 999 }] }))
    expect(screen.getByText('8.00 L/100km')).toBeInTheDocument()
    expect(screen.queryByText('999.00 L/100km')).not.toBeInTheDocument()
  })

  it('seção maintenance usa somente a visão V2 específica', () => {
    mount('/analytics?view=maintenance')
    expect(screen.getByText('Manutenção V2')).toBeInTheDocument()
    expect(analyticsAPI.overview).not.toHaveBeenCalled()
  })

  it('seção utilization informa limite sem inventar dados', async () => {
    const view = 'utilization'
    mount(`/analytics?view=${view}`)
    expect(screen.getByText('Análise específica ainda não disponível')).toBeInTheDocument()
    await waitFor(() => expect(analyticsAPI.overview).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Frota ativa')).not.toBeInTheDocument()
  })

  it('seção inválida usa Visão Geral', async () => {
    mount('/analytics?view=unknown')
    expect(screen.getByText('Cockpit atual')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Visão Geral' })).toHaveAttribute('aria-current', 'page')
  })

  it.each(['xlsx', 'pdf'])('preserva exportação %s, opções e filtros V1', async (format) => {
    const user = userEvent.setup()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const create = vi.fn(() => 'blob:test')
    const revoke = vi.fn()
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: create })
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: revoke })
    analyticsAPI.exportReport.mockResolvedValue({ data: new Blob(['test']) })
    mount('/analytics?view=reports')
    await user.click(screen.getByRole('button', { name: 'Preparar exportação' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Formato' }), format)
    await user.click(screen.getByRole('checkbox', { name: 'Incluir gráficos' }))
    await user.click(screen.getByRole('button', { name: 'Exportar', exact: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(analyticsAPI.exportReport).toHaveBeenCalledWith({ period_days: 30, vehicle_type: undefined, organization: undefined,
      export_format: format, include_charts: false, include_details: true })
    expect(click).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:test')
    click.mockRestore()
  })

  it('mantém modal e opções em caso de erro de exportação', async () => {
    analyticsAPI.exportReport.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    mount('/analytics?view=reports')
    await user.click(screen.getByRole('button', { name: 'Preparar exportação' }))
    await user.click(screen.getByRole('button', { name: 'Exportar', exact: true }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar', exact: true })).toBeEnabled()
  })
})
