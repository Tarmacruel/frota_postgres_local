import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { analyticsV2API } from '../../api/analyticsV2'
import AnalyticsFuel from './AnalyticsFuel'

vi.mock('../../api/analyticsV2', () => ({ analyticsV2API: { fuel: vi.fn() } }))
vi.mock('recharts', () => {
  const Container = ({ children }) => <div>{children}</div>
  return Object.fromEntries(['ResponsiveContainer', 'LineChart', 'Line', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend'].map((key) => [key, Container]))
})

const amount = (value) => ({ value, known_value: value ?? '0', records: 1, missing_or_invalid: 0 })
const totals = { records: 1, liters: amount('10'), cost: amount('50'), price_per_liter: '5', priced_records: 1 }
const vehicleId = '11111111-1111-1111-1111-111111111111'
const supplyId = '22222222-2222-2222-2222-222222222222'
const stationKey = 'name:posto teste'
const anomaly = { kind: 'capacity', label: 'Volume acima da capacidade cadastrada', supply_id: supplyId,
  vehicle_id: vehicleId, plate: 'ABC1D23', supplied_at: '2026-09-10T12:00:00Z',
  observed: '60 L', reference: '50 L', sample_size: 1,
  rule: 'litros > capacidade cadastrada × 1,02', limitation: 'Cadastro atual.', rule_version: 'fuel-v2.1' }
const data = { totals, previous_totals: totals, measured_distance_km: '100', measured_vehicles: 1,
  measured_km_per_liter_supplied: '10', measured_liters_per_100km_supplied: '10', can_view_records: true,
  monthly: [{ month: '2026-09', totals }],
  vehicles: [{ vehicle_id: vehicleId, plate: 'ABC1D23', vehicle_type: 'SEDAN', totals,
    distance_km: '100', km_per_liter_supplied: '10', category_sample_vehicles: 0, anomaly_count: 1 }],
  stations: [{ key: stationKey, name: 'Posto teste', totals, anomaly_count: 1 }],
  anomaly_counts: { capacity: 1, odometer: 0, close: 0, consumption: 0, price: 0 }, anomalies: [anomaly],
  quality: { missing_value: 0, invalid_liters: 0, missing_tank_capacity: 0, missing_station: 0,
    insufficient_consumption_reference: 1, insufficient_price_reference: 1, registered_operational_flags: 0 },
  methodology: { period: 'Dias civis encerrados.', liters: 'Litros abastecidos registrados.', cost: 'Soma de valores registrados.',
    price: 'Valor dividido por litros.', mileage: 'Posses válidas.', category: 'Pares do mesmo tipo.',
    anomalies: 'Regras somente leitura.' } }

beforeEach(() => { vi.clearAllMocks(); analyticsV2API.fuel.mockResolvedValue({ data }) })

it('mostra medidas registradas e abre anomalia, veículo, posto e mês com contexto', async () => {
  const user = userEvent.setup()
  const onOpenEntity = vi.fn()
  render(<AnalyticsFuel onOpenEntity={onOpenEntity} />)
  expect(await within(screen.getByRole('region', { name: 'Abastecimentos do período' })).findByText(/^R\$\s*50,00$/)).toBeInTheDocument()
  expect(screen.getByText(/não há medição estruturada de tanque cheio/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Abrir abastecimento e regra' }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'record',
    entityId: supplyId, source: 'fuel_supply', origin: expect.objectContaining({ formula: anomaly.rule,
      limitations: expect.arrayContaining([expect.stringContaining('Amostra: 1')]) }) }))
  await user.click(within(screen.getByRole('region', { name: 'Ranking de veículos' })).getByRole('button', { name: 'ABC1D23' }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'vehicle', entityId: vehicleId }))
  await user.click(screen.getByRole('button', { name: 'Posto teste' }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'fuel-events', stationKey }))
  await user.click(screen.getByRole('button', { name: /2026-09 · 1 registro/ }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'fuel-events',
    filters: expect.objectContaining({ date_from: analyticsV2API.fuel.mock.calls[0][0].date_from,
      date_to: '2026-09-30' }) }))
})

it('respeita leitura individual e não transforma valor incompleto em preço', async () => {
  analyticsV2API.fuel.mockResolvedValue({ data: { ...data, can_view_records: false, anomalies: [],
    totals: { ...totals, cost: { value: null, known_value: '50', records: 2, missing_or_invalid: 1 }, price_per_liter: null } } })
  render(<AnalyticsFuel onOpenEntity={vi.fn()} />)
  expect(await screen.findByText(/Subtotal conhecido: R\$/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Abrir abastecimento e regra' })).not.toBeInTheDocument()
  expect(screen.getByText(/consulta individual exige permissão/)).toBeInTheDocument()
  expect(screen.queryByText('Não disponível/L')).not.toBeInTheDocument()
})

it('reaplica somente o recorte escolhido', async () => {
  const user = userEvent.setup()
  render(<AnalyticsFuel onOpenEntity={vi.fn()} />)
  await screen.findByRole('region', { name: 'Abastecimentos do período' })
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
  await waitFor(() => expect(analyticsV2API.fuel).toHaveBeenCalledTimes(2))
})
