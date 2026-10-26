import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { contractControlAPI } from '../../api/contractControl'
import useContractFunding from '../../hooks/useContractFunding'
import ContractFundingFields from './ContractFundingFields'
import ContractSetupDialog from './ContractSetupDialog'

vi.mock('../../api/contractControl', () => ({ contractControlAPI: { config: vi.fn(), eligible: vi.fn(), quote: vi.fn(), provider: vi.fn() } }))
vi.mock('../../api/paymentProcesses', () => ({ paymentContractsAPI: {}, paymentSuppliersAPI: {} }))

const contractFor = (station, id = `contract-${station}`) => ({
  id, number: `Contrato ${station}`, kind: 'FUEL', available_balance: '1000',
  providers: [{ id: `provider-${station}`, fuel_station_id: station, station_name: `Posto ${station}` }],
  prices: [{ provider_id: `provider-${station}`, fuel_type: 'GASOLINA COMUM', valid_from: '2020-01-01T00:00:00Z' }],
})
const quote = { price_id: 'price', unit_price: '6', reserve_amount: '180', available_after: '820', sufficient: true }

beforeEach(() => {
  vi.clearAllMocks()
  contractControlAPI.config.mockResolvedValue({ data: { enabled: true } })
  contractControlAPI.eligible.mockImplementation(async ({ fuel_station_id }) => ({ data: [contractFor(fuel_station_id)] }))
  contractControlAPI.quote.mockResolvedValue({ data: quote })
})

it('bloqueia um posto de outro contrato quando o pedido parte de um contrato definido', async () => {
  const { result } = renderHook(() => useContractFunding({ stationId: 'individual', liters: 30, initialContractId: 'rede' }))
  await waitFor(() => expect(result.current.error).toMatch(/não pertence ao contrato de origem/))
  expect(result.current.ready).toBe(false)
  expect(result.current.payload).toEqual({})
  render(<ContractFundingFields funding={result.current} />)
  expect(screen.queryByText('Contrato individual')).not.toBeInTheDocument()
  expect(screen.queryByText('Posto individual')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Contrato para reserva')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Prestador para reserva')).not.toBeInTheDocument()
})

it('exige a escolha do contrato e recalcula a reserva ao trocar entre vínculos do mesmo posto', async () => {
  contractControlAPI.eligible.mockResolvedValue({ data: [contractFor('posto'), contractFor('posto', 'outra-rede')] })
  const { result } = renderHook(() => useContractFunding({ stationId: 'posto', liters: 30 }))
  await waitFor(() => expect(result.current.contracts).toHaveLength(2))
  expect(result.current.error).toBe('')
  expect(result.current.ready).toBe(false)
  expect(result.current.payload).toEqual({})
  expect(contractControlAPI.quote).not.toHaveBeenCalled()
  const view = render(<ContractFundingFields funding={result.current} />)
  fireEvent.change(screen.getByLabelText('Contrato para reserva'), { target: { value: 'outra-rede' } })
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.payload.contract_id).toBe('outra-rede')
  act(() => result.current.selectContract('contract-posto'))
  expect(result.current.ready).toBe(false)
  expect(result.current.quote).toBeNull()
  expect(result.current.payload).toEqual({})
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.payload.contract_id).toBe('contract-posto')
  view.rerender(<ContractFundingFields funding={result.current} />)
  expect(screen.getByLabelText('Contrato para reserva')).toHaveValue('contract-posto')
})

it('preserva o contrato de origem quando o posto pertence a vários contratos', async () => {
  contractControlAPI.eligible.mockResolvedValue({ data: [contractFor('posto'), contractFor('posto', 'rede')] })
  const { result } = renderHook(() => useContractFunding({ stationId: 'posto', liters: 30, initialContractId: 'rede' }))
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.payload.contract_id).toBe('rede')
  expect(result.current.lockedContract).toBe(true)
})

it('limpa o vínculo ao trocar o posto e descarta a consulta antiga que chega atrasada', async () => {
  let finishB
  contractControlAPI.eligible.mockImplementation(({ fuel_station_id: station }) => station === 'B'
    ? new Promise((resolve) => { finishB = resolve }) : Promise.resolve({ data: [contractFor(station)] }))
  const { result, rerender } = renderHook(({ stationId }) => useContractFunding({ stationId, liters: 30 }), { initialProps: { stationId: 'A' } })
  await waitFor(() => expect(result.current.ready).toBe(true))
  rerender({ stationId: 'B' })
  expect(result.current.ready).toBe(false)
  expect(result.current.contract).toBeNull()
  expect(result.current.quote).toBeNull()
  expect(result.current.payload).toEqual({})
  await waitFor(() => expect(finishB).toBeDefined())
  rerender({ stationId: 'C' })
  await waitFor(() => expect(result.current.ready).toBe(true))
  await act(async () => finishB({ data: [contractFor('B')] }))
  expect(result.current.contract.id).toBe('contract-C')
  expect(result.current.payload.contract_provider_id).toBe('provider-C')
  rerender({ stationId: '' })
  expect(result.current.ready).toBe(false)
  expect(result.current.contract).toBeNull()
  expect(result.current.payload).toEqual({})
})

it('invalida a prévia imediatamente quando os litros mudam', async () => {
  const { result, rerender } = renderHook(({ liters }) => useContractFunding({ stationId: 'A', liters }), { initialProps: { liters: 30 } })
  await waitFor(() => expect(result.current.ready).toBe(true))
  contractControlAPI.quote.mockImplementation(() => new Promise(() => {}))
  rerender({ liters: 50 })
  expect(result.current.ready).toBe(false)
  expect(result.current.quote).toBeNull()
  expect(result.current.payload).toEqual({})
})

it('explica o posto sem contrato liberado e mantém a emissão bloqueada', async () => {
  contractControlAPI.eligible.mockResolvedValue({ data: [] })
  const { result } = renderHook(() => useContractFunding({ stationId: 'sem-vinculo', liters: 30 }))
  await waitFor(() => expect(result.current.loading).toBe(false))
  render(<ContractFundingFields funding={result.current} />)
  expect(screen.getByText(/Este posto não possui contrato liberado/)).toBeInTheDocument()
  expect(result.current.ready).toBe(false)
})

it('mantém a escolha de contrato e oficina no fluxo de manutenção', () => {
  const selectContract = vi.fn(), selectProvider = vi.fn()
  render(<ContractFundingFields funding={{ enabled: true, kind: 'MAINTENANCE', contracts: [{ id: 'm1', number: 'MAN-01' }, { id: 'm2', number: 'MAN-02' }],
    contract: { id: 'm1' }, providers: [{ id: 'oficina', name: 'Oficina teste' }], provider: null, selectContract, selectProvider }} />)
  fireEvent.change(screen.getByLabelText('Contrato para reserva'), { target: { value: 'm2' } })
  fireEvent.change(screen.getByLabelText('Prestador para reserva'), { target: { value: 'oficina' } })
  expect(selectContract).toHaveBeenCalledWith('m2')
  expect(selectProvider).toHaveBeenCalledWith('oficina')
})

it('permite posto de outro contrato e bloqueia somente duplicação no contrato atual', () => {
  render(<ContractSetupDialog dialog={{ type: 'provider', contract: { id: 'rede', kind: 'FUEL' } }} suppliers={[]}
    stations={[{ id: 'free', name: 'Posto livre', active: true }, { id: 'bound', name: 'Posto individual', active: true,
      active_contract_id: 'individual', active_contract_number: 'IND-01' }]} providers={[{ fuel_station_id: 'free', active: false }]} onClose={() => {}} onSuccess={() => {}} />)
  expect(screen.getByRole('option', { name: 'Posto individual' })).toBeEnabled()
  expect(screen.getByRole('option', { name: 'Posto livre' })).toBeDisabled()
  expect(screen.getByText(/O mesmo posto pode ser vinculado a vários contratos/)).toBeInTheDocument()
})
