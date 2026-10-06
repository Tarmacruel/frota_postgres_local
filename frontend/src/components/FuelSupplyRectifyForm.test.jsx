import '../test/mockJustificationSuggestions'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fuelSuppliesAPI } from '../api/fuelSupplies'
import FuelSupplyRectifyForm from './FuelSupplyRectifyForm'

vi.mock('../api/fuelSupplies', () => ({ fuelSuppliesAPI: { rectify: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'fuel-operator' } }) }))

const record = {
  id: 'supply-1', vehicle_plate: 'ABC1D23', supplied_at: '2026-09-23T13:21:00Z',
  odometer_km: 8839, liters: 30, total_amount: 225.3, fuel_type: 'Gasolina comum',
  receipt_url: '/api/fuel-supplies/supply-1/receipt',
}
const reason = 'Substituição do comprovante anexado incorretamente.'
const receipt = () => new File(['%PDF-1.4 corrected'], 'corrigido.pdf', { type: 'application/pdf' })
const selectReceipt = (file) => fireEvent.change(screen.getByLabelText('Novo comprovante (opcional)'), { target: { files: [file] } })

function setup() {
  const callbacks = { onSuccess: vi.fn(), onClose: vi.fn() }
  render(<FuelSupplyRectifyForm record={record} {...callbacks} />)
  fireEvent.change(screen.getByLabelText('Justificativa da retificação'), { target: { value: reason } })
  return callbacks
}

describe('retificação do comprovante de abastecimento', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fuelSuppliesAPI.rectify.mockResolvedValue({ data: {} })
  })

  it('preserva o contrato JSON e o comprovante quando só os dados mudam', async () => {
    setup()
    expect(screen.getByRole('link', { name: 'Ver comprovante atual' })).toHaveAttribute('href', record.receipt_url)
    expect(screen.getByLabelText('Novo comprovante (opcional)')).not.toBeRequired()
    fireEvent.change(screen.getByLabelText('Valor total (R$)'), { target: { value: '240' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar retificação' }))
    await waitFor(() => expect(fuelSuppliesAPI.rectify).toHaveBeenCalledWith(record.id, expect.objectContaining({ total_amount: 240, reason })))
    expect(fuelSuppliesAPI.rectify.mock.calls[0][1]).not.toBeInstanceOf(FormData)
  })

  it('permite trocar somente o arquivo, na mesma requisição auditável', async () => {
    const callbacks = setup()
    const file = receipt()
    selectReceipt(file)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar retificação' }))
    await waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalled())
    const [id, payload] = fuelSuppliesAPI.rectify.mock.calls[0]
    expect(id).toBe(record.id)
    expect(payload).toBeInstanceOf(FormData)
    expect(payload.get('receipt')).toMatchObject({ name: file.name, size: file.size, type: file.type })
    expect(JSON.parse(payload.get('payload'))).toMatchObject({ reason, liters: record.liters, total_amount: record.total_amount, notes: null, additive_type: null })
    expect(callbacks.onClose).toHaveBeenCalledOnce()
  })

  it('permite desistir da substituição antes de salvar', async () => {
    setup()
    selectReceipt(receipt())
    fireEvent.click(screen.getByRole('button', { name: 'Manter comprovante atual' }))
    fireEvent.change(screen.getByLabelText('Valor total (R$)'), { target: { value: '240' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar retificação' }))
    await waitFor(() => expect(fuelSuppliesAPI.rectify).toHaveBeenCalled())
    expect(fuelSuppliesAPI.rectify.mock.calls[0][1]).not.toBeInstanceOf(FormData)
  })

  it.each([
    ['tipo', () => new File(['text'], 'arquivo.txt', { type: 'text/plain' }), 'Comprovante deve ser PDF, JPG, PNG ou WEBP.'],
    ['vazio', () => new File([], 'vazio.pdf', { type: 'application/pdf' }), 'Comprovante enviado está vazio.'],
    ['tamanho', () => new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'grande.pdf', { type: 'application/pdf' }), 'Comprovante deve ter no máximo 8 MB.'],
  ])('bloqueia arquivo inválido por %s até corrigir a seleção', (_, file, message) => {
    setup()
    selectReceipt(file())
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Salvar retificação' })).toBeDisabled()
    expect(fuelSuppliesAPI.rectify).not.toHaveBeenCalled()
    selectReceipt(receipt())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar retificação' })).toBeEnabled()
  })

  it('exige justificativa mesmo na troca exclusiva do comprovante', () => {
    setup()
    selectReceipt(receipt())
    fireEvent.change(screen.getByLabelText('Justificativa da retificação'), { target: { value: 'curta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar retificação' }))
    expect(screen.getByText('A justificativa deve ter pelo menos 10 caracteres.')).toBeInTheDocument()
    expect(fuelSuppliesAPI.rectify).not.toHaveBeenCalled()
  })

  it('mantém o arquivo e a justificativa após falha e permite tentar novamente', async () => {
    fuelSuppliesAPI.rectify.mockRejectedValueOnce({ response: { data: { detail: 'Falha de gravação' } } })
    const callbacks = setup()
    selectReceipt(receipt())
    fireEvent.click(screen.getByRole('button', { name: 'Salvar retificação' }))
    expect(await screen.findByText('Falha de gravação')).toBeInTheDocument()
    expect(callbacks.onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Justificativa da retificação')).toHaveValue(reason)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar retificação' }))
    await waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalledOnce())
    expect(fuelSuppliesAPI.rectify.mock.calls[1][1].get('receipt').name).toBe('corrigido.pdf')
  })

  it('bloqueia envio repetido enquanto salva', async () => {
    let finish
    fuelSuppliesAPI.rectify.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    setup()
    selectReceipt(receipt())
    const form = screen.getByRole('button', { name: 'Salvar retificação' }).closest('form')
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(fuelSuppliesAPI.rectify).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Novo comprovante (opcional)')).toBeDisabled()
    await act(async () => finish({ data: {} }))
  })

  it('seleciona modelo, confirma substituição e salva o texto escolhido', async () => {
    const callbacks = setup()
    selectReceipt(receipt())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver modelos', exact: true })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Ver modelos', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Comprovante', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Substituir texto', exact: true }))
    expect(fuelSuppliesAPI.rectify).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Justificativa da retificação').value).toContain('Substituição do comprovante')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar retificação' }))
    await waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalledOnce())
  })

  it('apresenta rejeição da API sem fechar a retificação', async () => {
    fuelSuppliesAPI.rectify.mockRejectedValueOnce({ response: { data: { detail: 'Correção rejeitada' } } })
    setup()
    selectReceipt(receipt())
    fireEvent.click(screen.getByRole('button', { name: 'Salvar retificação' }))
    await screen.findByText('Correção rejeitada')
  })
})
