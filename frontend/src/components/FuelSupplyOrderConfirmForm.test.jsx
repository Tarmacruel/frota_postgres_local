import { reviewGuidedForm } from '../test/guidedForms'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import FuelSupplyOrderConfirmForm from './FuelSupplyOrderConfirmForm'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'

vi.mock('../api/fuelSupplyOrders', () => ({ fuelSupplyOrdersAPI: { confirmSupply: vi.fn() } }))

const order = Object.freeze({ id: 'order', requested_fuel_type: 'GASOLINA COMUM', requested_liters: 30,
  suggested_odometer_km: 100, contract_funding: Object.freeze({ contract_number: 'TESTE-01', reserved_amount: 183 }) })

beforeEach(() => {
  vi.clearAllMocks()
  fuelSupplyOrdersAPI.confirmSupply.mockResolvedValue({ data: {} })
})

function fillActuals(fuel, liters, amount) {
  fireEvent.change(screen.getByLabelText('Combustível efetivamente abastecido'), { target: { value: fuel } })
  fireEvent.change(screen.getByLabelText('Litros abastecidos'), { target: { value: String(liters) } })
  fireEvent.change(screen.getByLabelText('Valor total abastecido (R$)'), { target: { value: String(amount) } })
}

function addReceipt() {
  fireEvent.change(screen.getByLabelText('Comprovante'), { target: { files: [new File(['comprovante fictício'], 'teste.png', { type: 'image/png' })] } })
}

function submit() {
  reviewGuidedForm()
  fireEvent.submit(screen.getByRole('button', { name: 'Confirmar abastecimento' , hidden: true }).closest('form'))
}

it.each([
  ['Etanol', 28, 126],
  ['Gasolina aditivada', 32.5, 211.25],
])('confirma %s com litros e valor reais, preservando a solicitação original', async (fuel, liters, amount) => {
  const onSuccess = vi.fn()
  render(<FuelSupplyOrderConfirmForm order={order} onSuccess={onSuccess} />)
  expect(screen.getByText(/GASOLINA COMUM · 30 L previstos/)).toBeInTheDocument()
  expect(screen.getByLabelText('Combustível efetivamente abastecido')).toHaveValue('Gasolina comum')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  fillActuals(fuel, liters, amount)
  expect(screen.getByRole('status')).toHaveTextContent(`será registrado ${fuel} no lugar de GASOLINA COMUM`)
  addReceipt()
  submit()
  await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
  const [id, payload] = fuelSupplyOrdersAPI.confirmSupply.mock.calls[0]
  expect(id).toBe(order.id)
  expect(payload.get('fuel_type')).toBe(fuel)
  expect(payload.get('liters')).toBe(String(liters))
  expect(payload.get('total_amount')).toBe(String(amount))
  expect(payload.get('receipt').name).toBe('teste.png')
  expect(payload.has('requested_fuel_type')).toBe(false)
  expect(order.requested_fuel_type).toBe('GASOLINA COMUM')
  expect(order.requested_liters).toBe(30)
  expect(order.contract_funding.reserved_amount).toBe(183)
})

it('retira o aviso ao voltar ao solicitado e normaliza espaços e letras ao preencher a seleção', () => {
  render(<FuelSupplyOrderConfirmForm order={{ ...order, requested_fuel_type: ' gasolina   comum ' }} />)
  expect(screen.getByLabelText('Combustível efetivamente abastecido')).toHaveValue('Gasolina comum')
  fillActuals('Etanol', 28, 126)
  expect(screen.getByRole('status')).toBeInTheDocument()
  fillActuals('Gasolina comum', 30, 183)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('mantém o comprovante obrigatório mesmo quando o combustível foi trocado', () => {
  render(<FuelSupplyOrderConfirmForm order={order} />)
  fillActuals('Etanol', 28, 126)
  expect(screen.getByLabelText('Comprovante')).toBeRequired()
  submit()
  expect(screen.getByText('Envie o comprovante para confirmar o abastecimento.')).toBeInTheDocument()
  expect(fuelSupplyOrdersAPI.confirmSupply).not.toHaveBeenCalled()
})

it('preserva os dados reais após erro de gravação para permitir nova tentativa', async () => {
  fuelSupplyOrdersAPI.confirmSupply.mockRejectedValueOnce({ response: { data: { detail: 'Falha temporária' } } })
  render(<FuelSupplyOrderConfirmForm order={order} />)
  fillActuals('Gasolina aditivada', 32.5, 211.25)
  addReceipt()
  submit()
  expect(await screen.findByText('Falha temporária')).toBeInTheDocument()
  expect(screen.getByLabelText('Combustível efetivamente abastecido')).toHaveValue('Gasolina aditivada')
  expect(screen.getByLabelText('Litros abastecidos')).toHaveValue(32.5)
  submit()
  await waitFor(() => expect(fuelSupplyOrdersAPI.confirmSupply).toHaveBeenCalledTimes(2))
  expect(fuelSupplyOrdersAPI.confirmSupply.mock.calls[1][1].get('receipt').name).toBe('teste.png')
})

it('acompanha câmera e remoção no progresso, bloqueia sem anexo e envia somente o arquivo atual', async () => {
  render(<FuelSupplyOrderConfirmForm order={order} />)
  fillActuals('Etanol', 28, 126)
  const progress = screen.getByRole('progressbar')
  expect(progress).toHaveAttribute('aria-valuemax', '6')
  expect(progress).toHaveAttribute('aria-valuenow', '5')
  const cameraPhoto = new File(['foto fictícia'], 'camera.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByLabelText('Fotografar comprovante'), { target: { files: [cameraPhoto] } })
  expect(progress).toHaveAttribute('aria-valuemax', '6')
  expect(progress).toHaveAttribute('aria-valuenow', '6')
  reviewGuidedForm()
  fireEvent.click(screen.getByRole('button', { name: 'Remover comprovante' }))
  expect(progress).toHaveAttribute('aria-valuemax', '6')
  expect(progress).toHaveAttribute('aria-valuenow', '5')
  submit()
  expect(fuelSupplyOrdersAPI.confirmSupply).not.toHaveBeenCalled()
  expect(screen.getByText('Envie o comprovante para confirmar o abastecimento.')).toBeInTheDocument()
  expect(screen.getByLabelText('Litros abastecidos')).toHaveValue(28)
  const pdf = new File(['nota fictícia'], 'nota.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Comprovante'), { target: { files: [pdf] } })
  submit()
  await waitFor(() => expect(fuelSupplyOrdersAPI.confirmSupply).toHaveBeenCalledOnce())
  expect(fuelSupplyOrdersAPI.confirmSupply.mock.calls[0][1].get('receipt').name).toBe('nota.pdf')
  expect(fuelSupplyOrdersAPI.confirmSupply.mock.calls[0][1].get('fuel_type')).toBe('Etanol')
})

it('envia a foto escolhida pela câmera no mesmo campo receipt da API atual', async () => {
  render(<FuelSupplyOrderConfirmForm order={order} />)
  fillActuals('Gasolina comum', 30, 183)
  const cameraPhoto = new File(['foto fictícia'], 'camera.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByLabelText('Fotografar comprovante'), { target: { files: [cameraPhoto] } })
  submit()
  await waitFor(() => expect(fuelSupplyOrdersAPI.confirmSupply).toHaveBeenCalledOnce())
  const payload = fuelSupplyOrdersAPI.confirmSupply.mock.calls[0][1]
  expect(payload.get('receipt').name).toBe('camera.jpg')
  expect(payload.get('receipt').type).toBe('image/jpeg')
  expect(payload.getAll('receipt')).toHaveLength(1)
})
