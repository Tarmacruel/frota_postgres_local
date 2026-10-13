import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { analyticsV2API } from '../../api/analyticsV2'
import AnalyticsDrivers from './AnalyticsDrivers'

vi.mock('../../api/analyticsV2', () => ({ analyticsV2API: { drivers: vi.fn() } }))

const driver = { driver_id: '11111111-1111-1111-1111-111111111111', name: 'Ana Condutora', organization_id: 'org-1',
  active: true, possessions: 2, valid_km_possessions: 1, distance_km: '120', vehicles_with_possession: 1,
  fines: 1, claims: 0, fuel_supplies: 1, anomaly_rules: 2, anomalous_supplies: 1,
  license_expires_at: '2026-10-20', license_status: 'expiring' }
const other = { ...driver, driver_id: '22222222-2222-2222-2222-222222222222', name: 'Bia Condutora',
  possessions: 1, distance_km: null, valid_km_possessions: 0, fines: 0, fuel_supplies: 0,
  anomaly_rules: 0, anomalous_supplies: 0, license_expires_at: null, license_status: 'missing' }
const data = { drivers: [driver, other], drivers_with_records: 2,
  totals: { drivers: 2, possessions: 3, valid_km_possessions: 1, distance_km: '120', fines: 1, claims: 0,
    fuel_supplies: 1, anomaly_rules: 2 },
  readable_sources: ['possession', 'fine', 'fuel_supply', 'anomaly'],
  unlinked_records: { possession: 1, fine: 0, claim: 0, fuel_supply: 2, anomaly_rule: 1 },
  license: { as_of: '2026-10-11', active_drivers: 2, expired: 0, expiring: 1, missing: 1 },
  methodology: { scope: 'Vínculos explícitos.', possession: 'Inícios no recorte.', distance: 'Km válido.',
    incidents: 'Ocorrências registradas.', fuel: 'Regras fuel-v2.1.', license: 'Cadastro atual; 30 dias.',
    coverage: 'Sem driver_id fora dos totais.', ranking: 'Contagens absolutas.' } }

beforeEach(() => { vi.clearAllMocks(); analyticsV2API.drivers.mockResolvedValue({ data }) })

it('mostra contagens absolutas, CNH separada e abre a fonte do condutor com regra', async () => {
  const user = userEvent.setup()
  const onOpenEntity = vi.fn()
  render(<AnalyticsDrivers onOpenEntity={onOpenEntity} />)
  expect(await screen.findByRole('region', { name: 'Registros vinculados a condutores' })).toHaveTextContent('120 km')
  expect(screen.queryByText(/Pontuação de risco/)).not.toBeInTheDocument()
  const license = screen.getByRole('region', { name: 'CNH — acompanhamento administrativo atual' })
  expect(license).toHaveTextContent('A vencer em 30 dias')
  expect(license).toHaveTextContent('Ana Condutora')
  const table = within(screen.getByRole('region', { name: 'Condutores e fontes' }))
  const ana = within(table.getByRole('table')).getAllByRole('row')[1]
  await user.click(within(within(ana).getAllByRole('cell')[1]).getByRole('button', { name: '2' }))
  expect(onOpenEntity).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'driver-analysis',
    driverSource: 'possession', filters: expect.objectContaining({ date_from: expect.any(String) }),
    origin: expect.objectContaining({ formula: expect.stringContaining('Km válido.') }) }))
  await user.click(screen.getByRole('button', { name: 'Mais multas' }))
  expect(screen.getByRole('region', { name: 'Ranking por medida registrada' })).toHaveTextContent('Ana Condutora')
})

it('não oferece leitura individual de fonte sem permissão e aplica o recorte explicitamente', async () => {
  const user = userEvent.setup()
  analyticsV2API.drivers.mockResolvedValue({ data: { ...data, readable_sources: ['possession'] } })
  render(<AnalyticsDrivers onOpenEntity={vi.fn()} />)
  await screen.findByRole('region', { name: 'Condutores e fontes' })
  const table = within(screen.getByRole('region', { name: 'Condutores e fontes' })).getByRole('table')
  const ana = within(table).getAllByRole('row')[1]
  expect(within(within(ana).getAllByRole('cell')[4]).queryByRole('button')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
  await waitFor(() => expect(analyticsV2API.drivers).toHaveBeenCalledTimes(2))
})

it('mantém a CNH administrativa fora do filtro de tipo de veículo', async () => {
  const user = userEvent.setup()
  render(<AnalyticsDrivers onOpenEntity={vi.fn()} />)
  await screen.findByRole('region', { name: 'CNH — acompanhamento administrativo atual' })
  await user.click(screen.getByRole('button', { name: 'Tipo de veículo em Condutores' }))
  await user.click(await screen.findByRole('button', { name: 'Sedan', exact: true }))
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
  await waitFor(() => expect(analyticsV2API.drivers).toHaveBeenLastCalledWith(
    expect.objectContaining({ vehicle_type: 'SEDAN' }), expect.any(AbortSignal)))
  const license = screen.getByRole('region', { name: 'CNH — acompanhamento administrativo atual' })
  expect(license).toHaveTextContent('A vencer em 30 dias')
  expect(license).toHaveTextContent('A lista individual de CNH é exibida sem filtro de tipo/veículo')
  expect(within(license).queryByRole('table')).not.toBeInTheDocument()
})

it('permite trocar a medida quando o ranking inicial está vazio', async () => {
  const user = userEvent.setup()
  analyticsV2API.drivers.mockResolvedValue({ data: { ...data,
    drivers: [{ ...driver, possessions: 0, distance_km: null, valid_km_possessions: 0 }] } })
  render(<AnalyticsDrivers onOpenEntity={vi.fn()} />)
  const ranking = await screen.findByRole('region', { name: 'Ranking por medida registrada' })
  await waitFor(() => expect(ranking).toHaveTextContent('Sem dados para os filtros selecionados.'))
  await user.click(within(ranking).getByRole('button', { name: 'Mais multas' }))
  expect(within(ranking).getByRole('button', { name: 'Ana Condutora' })).toBeInTheDocument()
})
