import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { analyticsV2API } from '../../api/analyticsV2'
import AnalyticsCosts from './AnalyticsCosts'

vi.mock('../../api/analyticsV2', () => ({ analyticsV2API: { costs: vi.fn() } }))
vi.mock('recharts', () => {
  const Container = ({ children }) => <div>{children}</div>
  return Object.fromEntries(['ResponsiveContainer', 'LineChart', 'Line', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend'].map((key) => [key, Container]))
})

const amount = (value, records = 1, missing_or_invalid = 0) => ({ value, known_value: value ?? '0', records, missing_or_invalid })
const totals = { fuel: amount('100'), maintenance: amount('50'), fines: amount('20'), claim_estimate: amount('900'),
  operational_cost: amount('170') }
const data = { totals, cost_per_km: '1.7', measured_distance_km: '100', measured_vehicles: 1,
  monthly: [{ month: '2026-09', totals }],
  vehicles: [{ vehicle_id: '11111111-1111-1111-1111-111111111111', plate: 'ABC1D23', totals, distance_km: '100', cost_per_km: '1.7' }],
  organizations: [{ organization_id: '22222222-2222-2222-2222-222222222222', name: 'Secretaria teste', totals, vehicle_count: 1 }],
  methodology: { cost: 'Combustível + manutenção + multas pela data da infração.', claims: 'Estimativas separadas.',
    missing: 'Sem imputação.', organization: 'Responsabilidade histórica.', mileage: 'Posses encerradas válidas.' } }

beforeEach(() => { vi.clearAllMocks(); analyticsV2API.costs.mockResolvedValue({ data }) })

it('mostra composição, estimativa separada, Pareto e abre registros de fonte e secretaria', async () => {
  const user = userEvent.setup()
  const onOpenEntity = vi.fn()
  render(<AnalyticsCosts organizations={[{ id: data.organizations[0].organization_id, name: 'Secretaria teste' }]} onOpenEntity={onOpenEntity} />)
  expect(await within(screen.getByRole('region', { name: 'Custo operacional registrado' })).findByText(/R\$.*170,00/)).toBeInTheDocument()
  expect(screen.getByText(/Sinistros estimados · fora do total/)).toBeInTheDocument()
  await user.click(within(screen.getByRole('region', { name: 'Composição' })).getByRole('button', { name: 'Multas' }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'costs', costSource: 'fine',
    origin: expect.objectContaining({ label: 'Multas' }) }))
  await user.click(within(screen.getByRole('region', { name: 'Custos por secretaria' })).getByRole('button', { name: 'Secretaria teste', exact: true }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ organizationBucket: data.organizations[0].organization_id }))
  await user.click(screen.getByRole('button', { name: 'Ver posses do denominador' }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'mileage-events',
    origin: expect.objectContaining({ label: 'Quilometragem do custo operacional por km' }) }))
  await user.click(within(screen.getByRole('region', { name: 'Ranking de veículos' })).getByRole('button', { name: 'ABC1D23' }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'vehicle', entityId: data.vehicles[0].vehicle_id }))
})

it('mantém total incompleto como subtotal conhecido e permite reaplicar filtros', async () => {
  const user = userEvent.setup()
  analyticsV2API.costs.mockResolvedValue({ data: { ...data, totals: { ...totals,
    operational_cost: { value: null, known_value: '170', records: 4, missing_or_invalid: 1 } } } })
  render(<AnalyticsCosts onOpenEntity={vi.fn()} />)
  expect(await screen.findByText(/O total completo não está disponível/)).toBeInTheDocument()
  expect(screen.getByText(/Subtotal conhecido: R\$/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
  await waitFor(() => expect(analyticsV2API.costs).toHaveBeenCalledTimes(2))
})
