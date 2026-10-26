import '../../test/mockJustificationSuggestions'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import FuelOrderFundingForm from './FuelOrderFundingForm'
import { contractControlAPI } from '../../api/contractControl'

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator' } }) }))
vi.mock('../../api/contractControl', () => ({ contractControlAPI: { fundOrder: vi.fn() } }))
vi.mock('../../hooks/useContractFunding', () => ({ default: () => ({
  ready: true, networkValue: true, payload: { contract_id: 'contract', contract_provider_id: 'provider' },
}) }))
vi.mock('./ContractFundingFields', () => ({ default: () => null }))

const order = { id: 'order', fuel_station_id: 'station', requested_liters: '40', expires_at: '2030-01-01T12:00:00Z' }
beforeEach(() => vi.clearAllMocks())

it('insere um modelo editável para o vínculo sem enviar nem reservar até a confirmação', async () => {
  contractControlAPI.fundOrder.mockResolvedValue({})
  render(<FuelOrderFundingForm order={order} />)
  const reason = screen.getByLabelText('Justificativa do vínculo e prazo')
  expect(reason).toBeRequired()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver modelos' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ver modelos' }))
  fireEvent.click(screen.getByRole('button', { name: 'Rede credenciada por valor' }))
  expect(reason.value).toContain('sem reserva prévia')
  expect(contractControlAPI.fundOrder).not.toHaveBeenCalled()
  fireEvent.change(reason, { target: { value: `${reason.value} Atendimento reprogramado para o veículo.` } })
  fireEvent.click(screen.getByRole('button', { name: 'Vincular sem reserva prévia' }))
  await waitFor(() => expect(contractControlAPI.fundOrder).toHaveBeenCalledWith('order', expect.objectContaining({
    justification: reason.value, contract_id: 'contract', requested_liters: '40',
  })))
})

it('preserva o rascunho antes de substituir pela sugestão', async () => {
  render(<FuelOrderFundingForm order={order} />)
  const reason = screen.getByLabelText('Justificativa do vínculo e prazo')
  fireEvent.change(reason, { target: { value: 'Justificativa já preenchida pelo operador.' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver modelos' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ver modelos' }))
  fireEvent.click(screen.getByRole('button', { name: 'Vincular ordem anterior' }))
  expect(reason).toHaveValue('Justificativa já preenchida pelo operador.')
  fireEvent.click(screen.getByRole('button', { name: 'Manter meu texto' }))
  expect(reason).toHaveValue('Justificativa já preenchida pelo operador.')
  expect(contractControlAPI.fundOrder).not.toHaveBeenCalled()
})
