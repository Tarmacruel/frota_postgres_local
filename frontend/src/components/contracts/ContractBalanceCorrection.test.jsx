import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ContractSetupDialog from './ContractSetupDialog'
import { contractControlAPI } from '../../api/contractControl'

vi.mock('../../api/contractControl', () => ({ contractControlAPI: { correctBalance: vi.fn(), price: vi.fn() } }))
vi.mock('../../api/paymentProcesses', () => ({ paymentContractsAPI: {}, paymentSuppliersAPI: {} }))

const contract = { id: 'prime', number: '2-860-2022', available_balance: '690380702.50', reserved_amount: '0.00',
  value_updated: '6717878.88', kind: 'FUEL', control_opened: true }
const props = { suppliers: [], stations: [], providers: [], onClose: vi.fn(), onSuccess: vi.fn() }
beforeEach(() => { vi.clearAllMocks(); contractControlAPI.correctBalance.mockResolvedValue({ data: { id: 'movement' } }) })

it('recebe saldo final BRL, mostra diferença e envia saldo esperado com chave estável', async () => {
  render(<ContractSetupDialog {...props} dialog={{ type: 'correction', contract, requestKey: 'request-key' }} />)
  const input = screen.getByLabelText('Saldo disponível correto (R$)')
  expect(input).toHaveValue('R$ 690.380.702,50')
  fireEvent.change(input, { target: { value: 'R$ 6.835.452,50' } })
  fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Correção do erro de digitação informado pelo gestor' } })
  expect(screen.getByLabelText('Prévia da correção do saldo')).toHaveTextContent('6.835.452,50')
  expect(screen.getByLabelText('Prévia da correção do saldo')).toHaveTextContent('-R$ 683.545.250,00')
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar correção' }))
  await waitFor(() => expect(contractControlAPI.correctBalance).toHaveBeenCalledWith('prime', {
    target_available_balance: '6835452.50', expected_available_balance: '690380702.50',
    request_key: 'request-key', justification: 'Correção do erro de digitação informado pelo gestor',
  }))
  expect(props.onClose).toHaveBeenCalledTimes(1)
})

it('preserva o valor e a justificativa quando o saldo muda no servidor', async () => {
  contractControlAPI.correctBalance.mockRejectedValue({ response: { data: { detail: 'O saldo mudou desde a conferência.' } } })
  render(<ContractSetupDialog {...props} dialog={{ type: 'correction', contract, requestKey: 'key' }} />)
  fireEvent.change(screen.getByLabelText('Saldo disponível correto (R$)'), { target: { value: '6.835.452,50' } })
  fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Correção de digitação no saldo' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar correção' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Saldo disponível correto (R$)')).toHaveValue('6.835.452,50')
  expect(screen.getByLabelText('Justificativa')).toHaveValue('Correção de digitação no saldo')
  expect(props.onClose).not.toHaveBeenCalled()
})

it('mostra moeda nos valores contratuais preservados e mantém seis casas no preço', async () => {
  const view = render(<ContractSetupDialog {...props} dialog={{ type: 'edit', contract }} />)
  expect(screen.getByLabelText('Valor atualizado (R$)')).toHaveValue('R$ 6.717.878,88')
  expect(screen.getByLabelText('Valor atualizado (R$)')).toHaveAttribute('readonly')
  view.unmount()
  contractControlAPI.price.mockResolvedValue({ data: {} })
  render(<ContractSetupDialog {...props} providers={[{ id: 'provider', active: true, fuel_station_id: 'station', station_name: 'Posto' }]}
    dialog={{ type: 'price', contract }} />)
  fireEvent.change(screen.getByLabelText('Posto executante'), { target: { value: 'provider' } })
  fireEvent.change(screen.getByLabelText('Preço por litro (R$)'), { target: { value: 'R$ 8,123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  await waitFor(() => expect(contractControlAPI.price).toHaveBeenCalledWith('prime', expect.objectContaining({ unit_price: '8.123456' })))
})
