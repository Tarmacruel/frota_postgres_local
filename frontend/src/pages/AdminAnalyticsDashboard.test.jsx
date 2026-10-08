import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyticsAPI } from '../api/analytics'
import AdminAnalyticsDashboard from './AdminAnalyticsDashboard'

vi.mock('../components/analytics/AnalyticsOverview', () => ({ default: () => <div>Cockpit atual</div> }))
vi.mock('../api/analytics', () => ({ analyticsAPI: Object.fromEntries(
  ['overview', 'efficiency', 'tco', 'driverRisk', 'insights', 'costTrend', 'exportReport'].map((name) => [name, vi.fn()]),
) }))
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
})

describe('Analytics — fundação V1', () => {
  it('preserva /analytics, oito seções, indicadores e contratos atuais', async () => {
    mount()
    await ready()
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
    expect(screen.getByText('Detalhamento ainda não disponível')).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: /SEDAN/ }))
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

  it.each(['maintenance', 'utilization'])('seção %s informa limite sem inventar dados', async (view) => {
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
