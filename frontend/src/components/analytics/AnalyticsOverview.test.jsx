import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AnalyticsOverview from './AnalyticsOverview'
import { analyticsV2API } from '../../api/analyticsV2'
import { closedPeriod, deltaText, formatValue } from './analyticsV2Format'

vi.mock('../../api/analyticsV2', () => ({ analyticsV2API: { summary: vi.fn(), attention: vi.fn(), fleet: vi.fn() } }))
vi.mock('recharts', () => {
  const Container = ({ children }) => <div>{children}</div>
  return Object.fromEntries(['ResponsiveContainer', 'LineChart', 'Line', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend'].map((key) => [key, Container]))
})
const amount = (value) => ({ value, known_value: value, missing_or_invalid: 0 })
const totals = { fuel: amount('100'), maintenance: amount('20'), fines: amount('0'), claim_estimate: amount('40'), operational_cost: amount('120') }
const summary = {
  previous_period: { date_from: '2025-12-02', date_to: '2025-12-31' },
  current: totals, previous: totals, monthly: [],
  kpis: [{ key: 'distance_km', label: 'Distância válida', value: '250', unit: 'km', quality: 'partial',
    comparison: { delta: '50', delta_percent: '25' }, calculation: { formula: 'Soma das posses válidas', limitations: ['Somente posses encerradas'] } }],
  quality: { records: 3, operational_cost_missing_or_invalid: 0, events_without_driver: 1 },
  mileage: { valid_records: 2, excluded_records: 1, crossing_records: 1, overlapping_records: 0 },
}
const attention = { basis: 'Anomalias primeiro', alert_basis: 'Flags registradas', anomaly_records: 2, anomaly_vehicles: 1, total_attention_vehicles: 1,
  items: [{ vehicle_id: 'vehicle-test', plate: 'TST0A01', vehicle_type: 'PERUA_SW', anomalies: 2, comparison: { delta: '10', delta_percent: null } }] }
const region = (name) => within(screen.getByRole('region', { name }))
beforeEach(() => {
  vi.clearAllMocks()
  analyticsV2API.summary.mockResolvedValue({ data: summary })
  analyticsV2API.attention.mockResolvedValue({ data: attention })
  analyticsV2API.fleet.mockResolvedValue({ data: { counts: { ATIVO: 4, MANUTENCAO: 1, INATIVO: 2 }, total: 7 } })
})

describe('Cockpit V2', () => {
  it('exibe fontes, comparação, cobertura e entidade acionável por teclado', async () => {
    const open = vi.fn(), user = userEvent.setup()
    render(<AnalyticsOverview onOpenEntity={open} />)
    expect(await screen.findByText('250 km')).toBeInTheDocument()
    expect(screen.getByText('+50 km (+25%)')).toBeInTheDocument()
    await user.click(screen.getByText('Cobertura parcial · fórmula'))
    expect(screen.getByText('Somente posses encerradas')).toBeVisible()
    const vehicle = region('Veículos que exigem atenção').getByRole('button', { name: /TST0A01/ })
    vehicle.focus(); await user.keyboard('{Enter}')
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'vehicle', entityId: 'vehicle-test' }))
    expect(region('Qualidade dos dados').getByText('Posses excluídas do km')).toBeInTheDocument()
    expect(region('Situação da frota').getByText(/Não representa disponibilidade operacional/)).toBeInTheDocument()
  })

  it('mantém fontes saudáveis e repete somente a falha, sem confundir erro com vazio', async () => {
    analyticsV2API.attention.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    render(<AnalyticsOverview onOpenEntity={vi.fn()} />)
    await screen.findByText('250 km')
    expect(region('Veículos que exigem atenção').getByRole('alert')).toBeInTheDocument()
    expect(region('Resumo de alertas').getByRole('alert')).toBeInTheDocument()
    expect(region('Situação da frota').getByText('Ativos')).toBeInTheDocument()
    await user.click(region('Resumo de alertas').getByRole('button', { name: 'Tentar novamente' }))
    await region('Veículos que exigem atenção').findByRole('button', { name: /TST0A01/ })
    expect(analyticsV2API.attention).toHaveBeenCalledTimes(2)
    expect(analyticsV2API.summary).toHaveBeenCalledTimes(1)
    expect(analyticsV2API.fleet).toHaveBeenCalledTimes(1)
  })

  it('aplica datas e tipo juntos somente ao confirmar, permite remover chip e preserva ao ocultar', async () => {
    const user = userEvent.setup(), view = render(<AnalyticsOverview />)
    await screen.findByText('250 km')
    fireEvent.change(screen.getByLabelText('De', { exact: true }), { target: { value: '2025-01-01' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2025-01-31' } })
    await user.click(screen.getByRole('button', { name: 'Tipo de veículo da Visão Geral' }))
    await user.click(screen.getByRole('button', { name: 'Perua/SW', exact: true }))
    expect(analyticsV2API.summary).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await waitFor(() => expect(analyticsV2API.summary).toHaveBeenLastCalledWith(expect.objectContaining({ date_from: '2025-01-01', date_to: '2025-01-31', vehicle_type: 'PERUA_SW' }), expect.any(AbortSignal)))
    view.rerender(<AnalyticsOverview enabled={false} />)
    expect(analyticsV2API.summary).toHaveBeenCalledTimes(2)
    view.rerender(<AnalyticsOverview />)
    expect(screen.getByLabelText('De', { exact: true })).toHaveValue('2025-01-01')
    await user.click(screen.getByRole('button', { name: 'Tipo: Perua/SW ×' }))
    await waitFor(() => expect(analyticsV2API.fleet).toHaveBeenLastCalledWith(expect.objectContaining({ vehicle_type: undefined, date_from: '2025-01-01' }), expect.any(AbortSignal)))
  })

  it('rejeita janela invertida sem consultar novamente', async () => {
    const user = userEvent.setup()
    render(<AnalyticsOverview />)
    await screen.findByText('250 km')
    fireEvent.change(screen.getByLabelText('De', { exact: true }), { target: { value: '2025-02-01' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2025-01-01' } })
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Selecione de 1 a 366 dias encerrados')
    expect(analyticsV2API.summary).toHaveBeenCalledTimes(1)
  })

  it('descarta resposta antiga e não exibe zeros durante carregamento', async () => {
    let resolveOld
    analyticsV2API.summary.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const user = userEvent.setup()
    render(<AnalyticsOverview />)
    expect(region('Indicadores do período').getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('0 km')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Atualizar' }))
    await screen.findByText('250 km')
    await act(async () => resolveOld({ data: { ...summary, kpis: [] } }))
    expect(screen.getByText('250 km')).toBeInTheDocument()
  })

  it('distingue ausência de dados, zero e comparação sem base', async () => {
    analyticsV2API.attention.mockResolvedValue({ data: { ...attention, items: [], total_attention_vehicles: 0, anomaly_records: 0, anomaly_vehicles: 0 } })
    analyticsV2API.summary.mockResolvedValue({ data: { ...summary, kpis: [{ ...summary.kpis[0], value: null, comparison: { delta: null } }] } })
    render(<AnalyticsOverview catalogError />)
    expect(await region('Indicadores do período').findByText('Não disponível')).toBeInTheDocument()
    expect(region('Indicadores do período').getByText('Comparação indisponível')).toBeInTheDocument()
    expect(await region('Veículos que exigem atenção').findByText(/Sem aumento de custo/)).toBeInTheDocument()
    expect(region('Resumo de alertas').getByText(/Isso não comprova ausência de problemas/)).toBeInTheDocument()
    expect(screen.getByText(/Catálogo de secretarias indisponível/)).toBeInTheDocument()
  })
})

describe('Apresentação de períodos e valores V2', () => {
  it('usa dia civil da Bahia, virada de ano e somente dias encerrados', () => {
    expect(closedPeriod(2, new Date('2026-01-02T01:00:00Z'))).toEqual({ date_from: '2025-12-30', date_to: '2025-12-31' })
  })
  it('não converte ausência em zero nem divisão por zero em percentual', () => {
    expect(formatValue(null, 'BRL')).toBe('Não disponível')
    expect(formatValue('0', 'km')).toBe('0 km')
    expect(deltaText({ delta: '10', delta_percent: null }, 'km')).toBe('+10 km · sem base percentual')
    expect(deltaText({ delta: '-2', delta_percent: '-20' }, 'km')).toBe('−2 km (−20%)')
  })
})
