import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { analyticsV2API } from '../../api/analyticsV2'
import AnalyticsMaintenance from './AnalyticsMaintenance'

vi.mock('../../api/analyticsV2', () => ({ analyticsV2API: { maintenance: vi.fn() } }))

const amount = { value: '100', known_value: '100', records: 2, missing_or_invalid: 0 }
const vehicleId = '11111111-1111-1111-1111-111111111111'
const data = { cost: amount, measured_cost: amount, measured_distance_km: '50', measured_vehicles: 1,
  cost_per_km: '2', interventions: 2, open_interventions: 1, valid_duration_count: 1,
  invalid_duration_count: 0, average_duration_hours: '3', repeated_vehicles: 1,
  vehicles: [{ vehicle_id: vehicleId, plate: 'ABC1D23', cost: amount, interventions: 2,
    open_interventions: 1, valid_duration_count: 1, average_duration_hours: '3', cost_per_km: '2' }],
  methodology: { cohort: 'Início no recorte.', cost: 'Custo registrado.', mileage: 'Posses válidas.',
    duration: 'Intervalos encerrados válidos.', open: 'Fim ausente.', recurrence: 'Duas ou mais no período.' } }

beforeEach(() => { vi.clearAllMocks(); analyticsV2API.maintenance.mockResolvedValue({ data }) })

it('mostra métricas da fase e abre histórico, veículo e denominador com fórmula e filtros', async () => {
  const user = userEvent.setup()
  const onOpenEntity = vi.fn()
  render(<AnalyticsMaintenance onOpenEntity={onOpenEntity} />)
  expect((await screen.findAllByText(/R\$\s*100,00/)).length).toBeGreaterThan(0)
  expect(screen.getByText(/veículo\(s\) com duas ou mais intervenções/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Manutenções abertas' }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'maintenance-events',
    maintenanceSubset: 'open', origin: expect.objectContaining({ formula: expect.stringContaining('Fim ausente.') }) }))
  await user.click(within(screen.getByRole('region', { name: 'Ranking por veículo' })).getByRole('button', { name: 'ABC1D23' }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'maintenance-events',
    filters: expect.objectContaining({ vehicle_id: vehicleId }) }))
  await user.click(screen.getByRole('button', { name: 'Ver posses do denominador' }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'mileage-events',
    origin: expect.objectContaining({ formula: 'Posses válidas.' }) }))
})

it('aplica o recorte explicitamente', async () => {
  const user = userEvent.setup()
  render(<AnalyticsMaintenance onOpenEntity={vi.fn()} />)
  await screen.findByRole('region', { name: 'Manutenções registradas' })
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
  await waitFor(() => expect(analyticsV2API.maintenance).toHaveBeenCalledTimes(2))
})
