import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { analyticsV2API } from '../../api/analyticsV2'
import AnalyticsUtilization from './AnalyticsUtilization'

vi.mock('../../api/analyticsV2', () => ({ analyticsV2API: { utilization: vi.fn() } }))

const measured = { vehicle_id: '11111111-1111-1111-1111-111111111111', plate: 'ABC1D23', status: 'ATIVO',
  organization_id: 'org-1', started: 1, ended: 1, valid_duration_count: 1, duration_hours: '24',
  valid_km_count: 1, distance_km: '100', last_possession_event_at: '2026-09-11T12:00:00Z',
  days_since_last_event: 19, open_maintenance_records: 0 }
const unseen = { ...measured, vehicle_id: '22222222-2222-2222-2222-222222222222', plate: 'XYZ9A87',
  organization_id: null, status: 'MANUTENCAO', started: 0, ended: 0, valid_duration_count: 0,
  duration_hours: null, valid_km_count: 0, distance_km: null, last_possession_event_at: null,
  days_since_last_event: null, open_maintenance_records: 1 }
const data = { roster_vehicles: 2, started: 1, ended: 1, valid_duration_count: 1, duration_hours: '24',
  valid_km_count: 1, distance_km: '100', km_per_valid_closed_possession: '100', without_possession_event: 1,
  status_counts: { ATIVO: 1, MANUTENCAO: 1, INATIVO: 0 }, vehicles_with_open_maintenance: 1,
  open_maintenance_records: 1, vehicles: [measured, unseen],
  organizations: [{ organization_id: 'org-1', name: 'Secretaria teste', vehicles: 1,
    without_possession_event: 0, started: 1, ended: 1, distance_km: '100' },
  { organization_id: null, name: 'Sem lotação', vehicles: 1,
    without_possession_event: 1, started: 0, ended: 0, distance_km: null }],
  methodology: { roster: 'Cadastro atual.', events: 'Inícios e fins observáveis.', distance: 'Km válido.',
    duration: 'Intervalo válido.', last: 'Última posse.', without: 'Sem evento no recorte.',
    status: 'Status atual.', ranking: 'Amostra medida.', organization: 'Lotação atual.' } }

beforeEach(() => { vi.clearAllMocks(); analyticsV2API.utilization.mockResolvedValue({ data }) })

it('mostra métricas descritivas e abre posses e veículo com contexto', async () => {
  const user = userEvent.setup()
  const onOpenEntity = vi.fn()
  render(<AnalyticsUtilization onOpenEntity={onOpenEntity} />)
  expect(await screen.findByRole('region', { name: 'Registros de posse no período' })).toHaveTextContent('100 km')
  expect(screen.getByRole('region', { name: 'Sem evento de posse no recorte' })).toHaveTextContent('1 de 2')
  expect(screen.queryByText(/^Taxa de utilização$/i)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Ver posses', exact: true }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'utilization-events',
    utilizationMode: 'km', origin: expect.objectContaining({ formula: 'Km válido.' }) }))
  await user.click(within(screen.getByRole('region', { name: 'Sem abertura/encerramento no período' })).getByRole('button', { name: 'XYZ9A87' }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'utilization-events',
    utilizationMode: 'history', filters: expect.objectContaining({ vehicle_id: unseen.vehicle_id }) }))
})

it('seleciona secretaria sem lotação e status na tabela, preservando filtros da API', async () => {
  const user = userEvent.setup()
  render(<AnalyticsUtilization onOpenEntity={vi.fn()} />)
  await screen.findByRole('region', { name: 'Visão por secretaria operadora atual' })
  await user.click(screen.getByRole('button', { name: 'Sem lotação' }))
  expect(within(screen.getByRole('region', { name: 'Veículos do cadastro atual' })).getByText(/1 de 2 veículo/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Limpar seleção local' }))
  await user.click(screen.getByRole('button', { name: 'Em manutenção' }))
  expect(within(screen.getByRole('region', { name: 'Veículos do cadastro atual' })).getByText(/1 de 2 veículo/)).toBeInTheDocument()
  expect(analyticsV2API.utilization).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
  await waitFor(() => expect(analyticsV2API.utilization).toHaveBeenCalledTimes(2))
})
