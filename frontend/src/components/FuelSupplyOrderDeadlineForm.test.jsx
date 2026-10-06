import '../test/mockJustificationSuggestions'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import FuelSupplyOrderDeadlineForm from './FuelSupplyOrderDeadlineForm'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'

vi.mock('../api/fuelSupplyOrders', () => ({ fuelSupplyOrdersAPI: { updateDeadline: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'deadline-operator' } }) }))
beforeEach(() => { vi.resetAllMocks(); fuelSupplyOrdersAPI.updateDeadline.mockResolvedValue({ data: {} }) })

it.each(['EXPIRED', 'OPEN'])('sugere ajuste de prazo e preserva o contrato da operação (%s)', async (status) => {
  const onSuccess = vi.fn()
  render(<FuelSupplyOrderDeadlineForm order={{ id: 'order-1', status, expires_at: new Date(Date.now() + (status === 'EXPIRED' ? -1 : 1) * 86400000).toISOString() }} onSuccess={onSuccess} />)
  expect(screen.getByLabelText('Justificativa')).toBeRequired()
  expect(screen.getByLabelText('Justificativa')).toHaveValue('')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver modelos', exact: true })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ver modelos', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Reprogramação', exact: true }))
  expect(fuelSupplyOrdersAPI.updateDeadline).not.toHaveBeenCalled()
  const reason = screen.getByLabelText('Justificativa').value
  expect(reason).toContain(status === 'EXPIRED' ? 'Reabertura' : 'Prorrogação')
  fireEvent.click(screen.getByRole('button', { name: status === 'EXPIRED' ? 'Reabrir ordem' : 'Prorrogar prazo', exact: true }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
  expect(fuelSupplyOrdersAPI.updateDeadline).toHaveBeenCalledWith('order-1', expect.objectContaining({ reason }))
})
