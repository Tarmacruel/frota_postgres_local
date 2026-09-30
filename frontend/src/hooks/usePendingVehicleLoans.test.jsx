import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import usePendingVehicleLoans, { LOANS_CHANGED_EVENT } from './usePendingVehicleLoans'
import { vehicleLoansAPI } from '../api/vehicleLoans'

vi.mock('../api/vehicleLoans', () => ({ vehicleLoansAPI: { pendingSummary: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())
afterEach(() => vi.useRealTimers())

it('mantém o aviso ao consultar e em falha temporária; remove após resolução no servidor', async () => {
  vehicleLoansAPI.pendingSummary.mockResolvedValue({ data: { total: 2 } })
  const { result } = renderHook(() => usePendingVehicleLoans('user', true))
  await waitFor(() => expect(result.current).toBe(2))
  vehicleLoansAPI.pendingSummary.mockRejectedValueOnce(new Error('offline'))
  await act(async () => window.dispatchEvent(new Event('focus')))
  expect(result.current).toBe(2)
  vehicleLoansAPI.pendingSummary.mockResolvedValue({ data: { total: 0 } })
  await act(async () => window.dispatchEvent(new Event(LOANS_CHANGED_EVENT)))
  expect(result.current).toBe(0)
})

it('não consulta sem permissão e ignora respostas do usuário anterior', async () => {
  let resolve
  vehicleLoansAPI.pendingSummary.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const { result, rerender } = renderHook(({ id, enabled }) => usePendingVehicleLoans(id, enabled), { initialProps: { id: 'old', enabled: false } })
  expect(vehicleLoansAPI.pendingSummary).not.toHaveBeenCalled()
  rerender({ id: 'old', enabled: true })
  vehicleLoansAPI.pendingSummary.mockResolvedValue({ data: { total: 1 } })
  rerender({ id: 'new', enabled: true })
  await waitFor(() => expect(result.current).toBe(1))
  await act(async () => resolve({ data: { total: 9 } }))
  expect(result.current).toBe(1)
  rerender({ id: 'new', enabled: false })
  expect(result.current).toBe(0)
})

it('atualiza periodicamente e limpa o temporizador ao sair', async () => {
  vi.useFakeTimers()
  vehicleLoansAPI.pendingSummary.mockResolvedValue({ data: { total: 1 } })
  const { result, unmount } = renderHook(() => usePendingVehicleLoans('user', true))
  await act(async () => {})
  expect(result.current).toBe(1)
  vehicleLoansAPI.pendingSummary.mockResolvedValue({ data: { total: 3 } })
  await act(async () => vi.advanceTimersByTime(30000))
  expect(result.current).toBe(3)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
