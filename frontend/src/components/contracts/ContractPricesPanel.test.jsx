import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ContractPricesPanel from './ContractPricesPanel'
import ContractSetupDialog from './ContractSetupDialog'
import { contractControlAPI } from '../../api/contractControl'

vi.mock('../../api/contractControl', () => ({ contractControlAPI: { updatePrice: vi.fn(), deletePrice: vi.fn() } }))
vi.mock('../../api/paymentProcesses', () => ({ paymentContractsAPI: {}, paymentSuppliersAPI: {} }))

const instant = Date.now()
const price = { id: 'price', provider_id: 'provider', station_name: 'Posto Teste', fuel_type: 'GASOLINA COMUM',
  unit_price: '6.145000', valid_from: new Date(instant-86400000).toISOString(), valid_until: null }
const providers = [{ id: 'provider', fuel_station_id: 'station', active: true }]
const versions = [price,
  { ...price, id: 'future', fuel_type: 'ETANOL', valid_from: new Date(instant+86400000).toISOString() },
  { ...price, id: 'old', fuel_type: 'DIESEL S10', valid_until: new Date(instant-3600000).toISOString() },
  { ...price, id: 'deleted', fuel_type: 'GASOLINA ADITIVADA', deleted_at: new Date(instant-60000).toISOString() },
]
beforeEach(() => {
  vi.clearAllMocks()
  contractControlAPI.updatePrice.mockResolvedValue({ data: { id: 'new-price' } })
  contractControlAPI.deletePrice.mockResolvedValue({ data: { id: price.id, deleted_at: new Date().toISOString() } })
})

function dialog(type, callbacks = {}) {
  const props = { onClose: vi.fn(), onSuccess: vi.fn(), ...callbacks }
  render(<ContractSetupDialog dialog={{ type, contract: { id: 'contract' }, price }} suppliers={[]} stations={[]} providers={providers} {...props} />)
  return props
}

it('mostra ações para vigentes/agendados e conserva as versões anteriores no histórico', () => {
  const onEdit = vi.fn(), onDelete = vi.fn()
  render(<ContractPricesPanel prices={versions} providers={providers} manage onEdit={onEdit} onDelete={onDelete} />)
  expect(screen.getByText('Vigente')).toBeInTheDocument()
  expect(screen.getByText('Agendado')).toBeInTheDocument()
  expect(screen.queryByText('DIESEL S10')).not.toBeInTheDocument()
  expect(screen.queryByText('GASOLINA ADITIVADA')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Editar preço de GASOLINA COMUM/ }))
  expect(onEdit).toHaveBeenCalledWith(price)
  fireEvent.click(screen.getByRole('button', { name: /Excluir preço de GASOLINA COMUM/ }))
  expect(onDelete).toHaveBeenCalledWith(price)
  expect(contractControlAPI.deletePrice).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar histórico de preços' }))
  expect(screen.getByText('Encerrado')).toBeInTheDocument()
  expect(screen.getByText('Excluído')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Editar preço de DIESEL/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Excluir preço de GASOLINA ADITIVADA/ })).not.toBeInTheDocument()
})

it('não oferece mutações a leitores e mantém a consulta ao histórico', () => {
  render(<ContractPricesPanel prices={versions} providers={providers} manage={false} />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar histórico de preços' }))
  expect(screen.getByText('Excluído')).toBeInTheDocument()
})

it('retira versões substituídas do catálogo e orienta consultar o histórico', () => {
  const replaced = { ...price, valid_from: new Date(instant+86400000).toISOString(), valid_until: new Date(instant+86400000).toISOString() }
  render(<ContractPricesPanel prices={[replaced]} providers={[]} manage />)
  expect(screen.getByText(/Nenhum preço vigente ou agendado/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Novo preço' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar histórico de preços' }))
  expect(screen.getByText('Substituído')).toBeInTheDocument()
})

it('preenche o preço e salva a nova versão mantendo posto e combustível', async () => {
  const callbacks = dialog('priceEdit')
  expect(screen.getByLabelText('Preço por litro (R$)')).toHaveValue(6.145)
  expect(screen.getByText('Posto Teste')).toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Preço por litro (R$)'), { target: { value: '6.234567' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar', exact: true }))
  await waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalledWith({ id: 'new-price' }, 'priceEdit'))
  expect(contractControlAPI.updatePrice).toHaveBeenCalledWith('contract', 'price', { unit_price: '6.234567', valid_from: null })
  expect(price.unit_price).toBe('6.145000')
  expect(callbacks.onClose).toHaveBeenCalledOnce()
})

it('envia o início opcional com fuso horário', async () => {
  dialog('priceEdit')
  const localDate = '2030-01-02T10:30'
  fireEvent.change(screen.getByLabelText('Nova vigência a partir de (opcional)'), { target: { value: localDate } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar', exact: true }))
  await waitFor(() => expect(contractControlAPI.updatePrice).toHaveBeenCalledWith('contract', 'price',
    { unit_price: '6.145000', valid_from: new Date(localDate).toISOString() }))
})

it('só exclui após confirmação explícita e permite voltar sem alterar dados', () => {
  const callbacks = dialog('priceDelete')
  expect(within(screen.getByRole('dialog')).getByText(/As reservas e os abastecimentos anteriores serão preservados/)).toBeInTheDocument()
  expect(contractControlAPI.deletePrice).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
  expect(callbacks.onClose).toHaveBeenCalledOnce()
  expect(contractControlAPI.deletePrice).not.toHaveBeenCalled()
})

it('exclui a versão selecionada sem emitir ajuste de saldo', async () => {
  const callbacks = dialog('priceDelete')
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  await waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalled())
  expect(contractControlAPI.deletePrice).toHaveBeenCalledExactlyOnceWith('contract', 'price')
  expect(contractControlAPI.updatePrice).not.toHaveBeenCalled()
})

it('mantém o diálogo e permite nova tentativa quando o servidor recusa a exclusão', async () => {
  contractControlAPI.deletePrice.mockRejectedValueOnce({ response: { data: { detail: 'Preço alterado por outro usuário. Atualize a lista.' } } })
  const callbacks = dialog('priceDelete')
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Preço alterado por outro usuário')
  expect(callbacks.onClose).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce())
  expect(contractControlAPI.deletePrice).toHaveBeenCalledTimes(2)
})
