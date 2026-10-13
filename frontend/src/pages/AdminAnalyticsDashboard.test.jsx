import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyticsAPI } from '../api/analytics'
import { analyticsV2API } from '../api/analyticsV2'
import AdminAnalyticsDashboard from './AdminAnalyticsDashboard'

vi.mock('../components/analytics/AnalyticsOverview', () => ({ default: ({ enabled }) => enabled ? <div>Cockpit atual</div> : null }))
vi.mock('../components/analytics/AnalyticsFuel', () => ({ default: ({ enabled }) => enabled ? <div>Combustível V2</div> : null }))
vi.mock('../components/analytics/AnalyticsMaintenance', () => ({ default: ({ enabled }) => enabled ? <div>Manutenção V2</div> : null }))
vi.mock('../components/analytics/AnalyticsUtilization', () => ({ default: ({ enabled }) => enabled ? <div>Utilização V2</div> : null }))
vi.mock('../components/analytics/AnalyticsDrivers', () => ({ default: ({ enabled }) => enabled ? <div>Condutores V2</div> : null }))
vi.mock('../components/analytics/AnalyticsAlerts', () => ({ default: ({ enabled }) => enabled ? <div>Casos persistidos V2</div> : null }))
vi.mock('../api/analytics', () => ({ analyticsAPI: Object.fromEntries(
  ['overview', 'efficiency', 'tco', 'driverRisk', 'insights', 'costTrend', 'exportReport'].map((name) => [name, vi.fn()]),
) }))
vi.mock('../api/analyticsV2', () => ({ analyticsV2API: { entity: vi.fn(), costs: vi.fn(), exportReport: vi.fn() } }))
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
  it('conserva o recorte de Custos ao sair e retornar à aba', async () => {
    const user = userEvent.setup()
    mount('/analytics?view=costs')
    const filters = within(screen.getByRole('form', { name: 'Filtros de Custos' }))
    await user.clear(filters.getByLabelText('De'))
    await user.type(filters.getByLabelText('De'), '2026-09-01')
    await user.clear(filters.getByLabelText('Até'))
    await user.type(filters.getByLabelText('Até'), '2026-09-30')
    await user.click(filters.getByRole('button', { name: 'Aplicar filtros' }))
    await user.click(screen.getByRole('button', { name: 'Relatórios', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Custos', exact: true }))
    const restored = within(screen.getByRole('form', { name: 'Filtros de Custos' }))
    expect(restored.getByLabelText('De')).toHaveValue('2026-09-01')
    expect(restored.getByLabelText('Até')).toHaveValue('2026-09-30')
  })

  it('mantém insights V1 sob demanda na aba de casos persistidos', async () => {
    mount('/analytics?view=alerts')
    expect(screen.getByText('Casos persistidos V2')).toBeInTheDocument()
    expect(analyticsAPI.insights).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('Consultar insights anteriores (V1)'))
    await screen.findByText('Sem alertas no período selecionado.')
    expect(analyticsAPI.insights).toHaveBeenCalledOnce()
    for (const key of ['overview', 'efficiency', 'tco', 'driverRisk', 'costTrend']) {
      expect(analyticsAPI[key]).not.toHaveBeenCalled()
    }
  })
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
    for (const key of ['efficiency', 'tco']) {
      expect(analyticsAPI[key]).toHaveBeenCalledWith({ period_days: 30, vehicle_type: undefined, organization: undefined }, expect.any(AbortSignal))
    }
    for (const key of ['overview', 'driverRisk', 'insights', 'costTrend']) expect(analyticsAPI[key]).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent('/analytics')
  })

  it('navega por teclado sem refazer consultas e conserva filtro ao abrir/fechar drawer', async () => {
    const user = userEvent.setup()
    mount('/analytics?keep=1&view=fuel')
    await ready()
    await user.click(screen.getByRole('button', { name: 'Período', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Últimos 90 dias' }))
    await waitFor(() => expect(analyticsAPI.efficiency).toHaveBeenLastCalledWith(expect.objectContaining({ period_days: 90 }), expect.any(AbortSignal)))
    const before = analyticsAPI.efficiency.mock.calls.length
    const driverCallsBefore = analyticsAPI.driverRisk.mock.calls.length
    const tab = screen.getByRole('button', { name: 'Condutores', exact: true })
    tab.focus()
    await user.keyboard('{Enter}')
    expect(tab).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('location')).toHaveTextContent('/analytics?keep=1&view=drivers')
    expect(screen.getByText('Condutores V2')).toBeInTheDocument()
    expect(analyticsAPI.efficiency).toHaveBeenCalledTimes(before)
    expect(analyticsAPI.driverRisk).toHaveBeenCalledTimes(driverCallsBefore)
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
    await user.click(screen.getByText('Consultar insights anteriores (V1)'))
    await screen.findByRole('alert')
    const section = screen.getByRole('region', { name: 'Alertas inteligentes' })
    expect(within(section).getByRole('alert')).toBeInTheDocument()
    expect(within(section).queryByText('Sem alertas no período selecionado.')).not.toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Tentar novamente' }))
    await within(section).findByText('Sem alertas no período selecionado.')
    expect(analyticsAPI.insights).toHaveBeenCalledTimes(2)
    expect(analyticsAPI.overview).not.toHaveBeenCalled()
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
    expect(analyticsAPI.efficiency.mock.calls[0][1].aborted).toBe(true)
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

  it('seção utilization usa somente a visão V2 específica', () => {
    mount('/analytics?view=utilization')
    expect(screen.getByText('Utilização V2')).toBeInTheDocument()
    expect(analyticsAPI.overview).not.toHaveBeenCalled()
  })

  it('seção inválida usa Visão Geral', async () => {
    mount('/analytics?view=unknown')
    expect(screen.getByText('Cockpit atual')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Visão Geral' })).toHaveAttribute('aria-current', 'page')
  })

  it.each(['xlsx', 'pdf'])('exporta relatório V2 %s com filtros aceitos', async (format) => {
    const user = userEvent.setup()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const create = vi.fn(() => 'blob:test')
    const revoke = vi.fn()
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: create })
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: revoke })
    analyticsV2API.exportReport.mockResolvedValue({ data: new Blob(['test']) })
    mount('/analytics?view=reports')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Formato' }), format)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Perfil' }), 'costs')
    await user.click(screen.getByRole('button', { name: 'Exportar relatório' }))
    await waitFor(() => expect(analyticsV2API.exportReport).toHaveBeenCalledOnce())
    expect(analyticsV2API.exportReport).toHaveBeenCalledWith({ date_from: expect.any(String), date_to: expect.any(String),
      organization: undefined, vehicle_type: undefined, profile: 'costs', export_format: format })
    expect(analyticsAPI.exportReport).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox', { name: /gráficos|detalhados/i })).not.toBeInTheDocument()
    expect(click).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:test')
    click.mockRestore()
  })

  it('informa falha de exportação V2 sem perder filtros', async () => {
    analyticsV2API.exportReport.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    mount('/analytics?view=reports')
    await user.click(screen.getByRole('button', { name: 'Exportar relatório' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar relatório' })).toBeEnabled()
  })

  it('explica a permissão negada pelo exportador V2 quando a resposta é blob', async () => {
    const failure = new Error('Request failed with status code 403')
    const body = new Blob([JSON.stringify({ detail: 'Permissão insuficiente para relatório de condutores' })],
      { type: 'application/json' })
    body.text = vi.fn().mockResolvedValue(JSON.stringify({ detail: 'Permissão insuficiente para relatório de condutores' }))
    failure.response = { status: 403, data: body }
    analyticsV2API.exportReport.mockRejectedValue(failure)
    const user = userEvent.setup()
    mount('/analytics?view=reports')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Perfil' }), 'drivers')
    await user.click(screen.getByRole('button', { name: 'Exportar relatório' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Permissão insuficiente para relatório de condutores')
    expect(screen.getByRole('combobox', { name: 'Perfil' })).toHaveValue('drivers')
  })

  it('preserva o exportador V1 sem parâmetros ignorados', async () => {
    const user = userEvent.setup()
    analyticsAPI.exportReport.mockResolvedValue({ data: new Blob(['test']) })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') })
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    mount('/analytics?view=fuel')
    await user.click(screen.getByRole('button', { name: 'Exportar insights anteriores' }))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Exportar', exact: true }))
    await waitFor(() => expect(analyticsAPI.exportReport).toHaveBeenCalledWith({ period_days: 30,
      vehicle_type: undefined, organization: undefined, export_format: 'xlsx' }))
    click.mockRestore()
  })

  it('mostra a justificativa da API também na falha de exportação V1 binária', async () => {
    const body = new Blob([], { type: 'application/json' })
    body.text = vi.fn().mockResolvedValue(JSON.stringify({ detail: 'Permissão insuficiente para exportar' }))
    analyticsAPI.exportReport.mockRejectedValue({ response: { data: body } })
    const user = userEvent.setup()
    mount('/analytics?view=alerts')
    await user.click(screen.getByText('Consultar insights anteriores (V1)'))
    await screen.findByText('Sem alertas no período selecionado.')
    await user.click(screen.getByRole('button', { name: 'Exportar insights anteriores' }))
    await user.click(screen.getByRole('button', { name: 'Exportar', exact: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Permissão insuficiente para exportar')
    expect(screen.getByRole('button', { name: 'Exportar', exact: true })).toBeEnabled()
  })
})
