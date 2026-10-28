import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import OriginalContractItemForm from './OriginalContractItemForm'
import { contractControlAPI } from '../../api/contractControl'

vi.mock('../../api/contractControl', () => ({ contractControlAPI: { complementOriginalItem: vi.fn() } }))
const contract = { id: 'c', kind: 'MAINTENANCE', number: 'CONTRATO-TESTE' }
const provider = { id: 'p', name: 'Oficina de teste', active: true }
beforeEach(() => { vi.resetAllMocks(); contractControlAPI.complementOriginalItem.mockResolvedValue({ data: { id: 'new' } }) })

function fillOriginal() {
  for (const [label, value] of [
    ['Código permanente do item', 'PECA-02'], ['Número no contrato original', '02'], ['Descrição', 'Peça prevista originalmente'],
    ['Quantidade original', '100'], ['Preço unitário original (R$)', '12,345678'], ['Quantidade restante não executada', '50'],
    ['Acréscimos anteriores (quantidade)', '0'], ['Documento ou cláusula do contrato original', 'Contrato, item 02'],
    ['Justificativa da inclusão', 'Item previsto originalmente e omitido no cadastro'],
  ]) fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } })
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que este item/ }))
}

it('inclui somente após conferência, usando o preço original e o executante sugerido', async () => {
  const success = vi.fn(), close = vi.fn()
  render(<OriginalContractItemForm contract={contract} providers={[provider]} onSuccess={success} onClose={close} />)
  expect(screen.getByLabelText('Quantidade restante não executada')).toHaveValue(null)
  expect(screen.getByLabelText('Acréscimos anteriores (quantidade)')).toHaveValue(null)
  expect(screen.queryByLabelText('Preço de referência atualizado (R$)')).not.toBeInTheDocument()
  fillOriginal()
  expect(screen.getByRole('checkbox', { name: 'Vincular Oficina de teste' })).toBeChecked()
  expect(screen.getByLabelText('Preço cobrado em Oficina de teste')).toHaveValue('R$ 12,345678')
  expect(contractControlAPI.complementOriginalItem).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Incluir item original' }))
  await waitFor(() => expect(contractControlAPI.complementOriginalItem).toHaveBeenCalledTimes(1))
  expect(contractControlAPI.complementOriginalItem).toHaveBeenCalledWith('c', expect.objectContaining({
    code: 'PECA-02', original_unit_price: '12.345678', remaining_quantity: '50', historical_added_quantity: '0',
    original_contract_confirmed: true, prices: [{ provider_id: 'p', unit_price: '12.345678', fuel_price_id: null }],
  }))
  expect(contractControlAPI.complementOriginalItem.mock.calls[0][1]).not.toHaveProperty('reference_unit_price')
  expect(success).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1)
})

it('não presume conferência nem quantidade histórica', async () => {
  render(<OriginalContractItemForm contract={contract} providers={[provider]} />)
  fillOriginal()
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que este item/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Incluir item original' }))
  expect(contractControlAPI.complementOriginalItem).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que este item/ }))
  fireEvent.change(screen.getByLabelText('Acréscimos anteriores (quantidade)'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Incluir item original' }))
  expect(contractControlAPI.complementOriginalItem).not.toHaveBeenCalled()
})

it('preserva dados e chave idempotente ao repetir após falha', async () => {
  contractControlAPI.complementOriginalItem.mockRejectedValueOnce(new Error('Falha de conexão'))
  render(<OriginalContractItemForm contract={contract} providers={[provider]} onSuccess={vi.fn()} onClose={vi.fn()} />)
  fillOriginal()
  fireEvent.click(screen.getByRole('button', { name: 'Incluir item original' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Quantidade restante não executada')).toHaveValue(50)
  expect(screen.getByLabelText('Documento ou cláusula do contrato original')).toHaveValue('Contrato, item 02')
  expect(screen.getByRole('checkbox', { name: /Confirmo que este item/ })).toBeChecked()
  const first = contractControlAPI.complementOriginalItem.mock.calls[0][1]
  fireEvent.click(screen.getByRole('button', { name: 'Incluir item original' }))
  await waitFor(() => expect(contractControlAPI.complementOriginalItem).toHaveBeenCalledTimes(2))
  expect(contractControlAPI.complementOriginalItem.mock.calls[1][1]).toEqual(first)
})

it('exige seleção explícita com várias oficinas e preserva preço corrigido', async () => {
  render(<OriginalContractItemForm contract={contract} providers={[provider, { id: 'p2', name: 'Outra oficina', active: true }, { id: 'dead', name: 'Inativa', active: false }]} onSuccess={vi.fn()} onClose={vi.fn()} />)
  fillOriginal()
  expect(screen.getByRole('checkbox', { name: 'Vincular Oficina de teste' })).not.toBeChecked()
  expect(screen.queryByRole('checkbox', { name: 'Vincular Inativa' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Incluir item original' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Selecione ao menos uma oficina/posto')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Vincular Outra oficina' }))
  fireEvent.change(screen.getByLabelText('Preço cobrado em Outra oficina'), { target: { value: '15,123456' } })
  fireEvent.change(screen.getByLabelText('Preço unitário original (R$)'), { target: { value: '13' } })
  fireEvent.click(screen.getByRole('button', { name: 'Incluir item original' }))
  await waitFor(() => expect(contractControlAPI.complementOriginalItem).toHaveBeenCalledWith('c', expect.objectContaining({
    original_unit_price: '13', prices: [{ provider_id: 'p2', unit_price: '15.123456', fuel_price_id: null }],
  })))
})

it('reaproveita a versão vigente exata de combustível sem permitir reprecificá-la', async () => {
  const station = { ...provider, station_name: 'Posto teste' }
  render(<OriginalContractItemForm contract={{ ...contract, kind: 'FUEL' }} providers={[station]} legacyPrices={[
    { id: 'current', provider_id: 'p', fuel_type: 'ETANOL', unit_price: '5.123456' },
    { id: 'future', provider_id: 'p', fuel_type: 'ETANOL', unit_price: '6', valid_from: '2999-01-01' },
  ]} onSuccess={vi.fn()} onClose={vi.fn()} />)
  fillOriginal()
  fireEvent.change(screen.getByLabelText('Produto correspondente'), { target: { value: 'ETANOL' } })
  expect(screen.getByLabelText('Preço vigente em Posto teste')).toHaveValue('current')
  expect(screen.getByLabelText('Preço cobrado em Posto teste')).toHaveAttribute('readonly')
  expect(screen.getByLabelText('Preço cobrado em Posto teste')).toHaveValue('R$ 5,123456')
  fireEvent.click(screen.getByRole('button', { name: 'Incluir item original' }))
  await waitFor(() => expect(contractControlAPI.complementOriginalItem).toHaveBeenCalledWith('c', expect.objectContaining({
    product_key: 'ETANOL', prices: [{ provider_id: 'p', unit_price: '5.123456', fuel_price_id: 'current' }],
  })))
})

it('rede por valor inclui só o controle quantitativo sem preços fixos', async () => {
  render(<OriginalContractItemForm contract={{ ...contract, kind: 'FUEL', fuel_pricing_mode: 'NETWORK_VALUE' }} providers={[]} onSuccess={vi.fn()} onClose={vi.fn()} />)
  fillOriginal()
  fireEvent.change(screen.getByLabelText('Produto correspondente'), { target: { value: 'ETANOL' } })
  expect(screen.queryByLabelText(/Preço cobrado em/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Incluir item original' }))
  await waitFor(() => expect(contractControlAPI.complementOriginalItem).toHaveBeenCalledWith('c', expect.objectContaining({ prices: [] })))
})

it('pede lote quando a abertura foi por grupo e bloqueia sem executante cadastrado', () => {
  render(<OriginalContractItemForm contract={contract} adjudication="GROUP" providers={[]} />)
  expect(screen.getByLabelText('Lote/grupo original')).toBeRequired()
  expect(screen.getByRole('button', { name: 'Incluir item original' })).toBeDisabled()
  expect(screen.getByText(/Adicione primeiro uma oficina/)).toBeInTheDocument()
})

it('permite cancelar sem enviar o complemento', () => {
  const close = vi.fn()
  render(<OriginalContractItemForm contract={contract} providers={[provider]} onClose={close} />)
  fillOriginal()
  fireEvent.click(screen.getByRole('button', { name: 'Voltar', exact: true }))
  expect(close).toHaveBeenCalledTimes(1)
  expect(contractControlAPI.complementOriginalItem).not.toHaveBeenCalled()
})
