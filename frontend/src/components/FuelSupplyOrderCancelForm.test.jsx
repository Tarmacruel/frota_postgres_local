import '../test/mockJustificationSuggestions'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import FuelSupplyOrderCancelForm from './FuelSupplyOrderCancelForm'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'

vi.mock('../api/fuelSupplyOrders', () => ({ fuelSupplyOrdersAPI: { cancel: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator' } }) }))
beforeEach(() => vi.resetAllMocks())

it('permite confirmar sem motivo e não envia ao escolher modelo', async () => {
  fuelSupplyOrdersAPI.cancel.mockResolvedValue({})
  const onSaved = vi.fn()
  render(<FuelSupplyOrderCancelForm order={{ id: 'order' }} onSaved={onSaved} onBusy={vi.fn()} onClose={vi.fn()} />)
  const input = screen.getByLabelText('Motivo do cancelamento (opcional)')
  expect(input).not.toBeRequired()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver modelos' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ver modelos' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ordem duplicada', exact: true }))
  expect(input.value).toContain('duplicidade')
  expect(fuelSupplyOrdersAPI.cancel).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  expect(fuelSupplyOrdersAPI.cancel).toHaveBeenCalledWith('order', { reason: null })
})

it('preserva texto em falha e impede envio duplicado', async () => {
  let reject
  fuelSupplyOrdersAPI.cancel.mockReturnValue(new Promise((_, r) => { reject = r }))
  const onSaved = vi.fn()
  render(<FuelSupplyOrderCancelForm order={{ id: 'order' }} onSaved={onSaved} onBusy={vi.fn()} onClose={vi.fn()} />)
  const input = screen.getByLabelText('Motivo do cancelamento (opcional)')
  fireEvent.change(input, { target: { value: 'Cancelamento solicitado por duplicidade' } })
  fireEvent.submit(input.closest('form'))
  fireEvent.submit(input.closest('form'))
  expect(fuelSupplyOrdersAPI.cancel).toHaveBeenCalledOnce()
  expect(input).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Ver modelos' })).toBeDisabled()
  await act(async () => reject({ response: { data: { detail: 'Ordem já confirmada' } } }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Ordem já confirmada')
  expect(input).toHaveValue('Cancelamento solicitado por duplicidade')
  expect(onSaved).not.toHaveBeenCalled()
})
