import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import FuelSupplyOrderCreateForm from './FuelSupplyOrderCreateForm'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'

const auth = vi.hoisted(() => ({ user: { organization_id: 'org-2' } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../api/fuelSupplyOrders', () => ({ fuelSupplyOrdersAPI: { create: vi.fn() } }))

const catalogs = {
  vehicles: [{ id: 'car', plate: 'ABC1234', brand: 'Fiat', model: 'Uno' }],
  organizations: [{ id: 'org-1', name: 'Administração' }, { id: 'org-2', name: 'Segurança' }],
  fuelStations: [{ id: 'station-1', name: 'Primeiro posto' }, { id: 'station-2', name: 'Segundo posto' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { organization_id: 'org-2' }
  fuelSupplyOrdersAPI.create.mockResolvedValue({ data: { id: 'order' } })
})

async function choose(label, option) {
  fireEvent.click(screen.getByRole('button', { name: label, exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: option }))
}

it('envia os padrões da nova ordem: 30 litros, secretaria do usuário e primeiro posto', async () => {
  render(<FuelSupplyOrderCreateForm {...catalogs} />)
  expect(screen.getByLabelText('Litros previstos')).toHaveValue(30)
  expect(screen.getByRole('button', { name: 'Órgão solicitante' })).toHaveTextContent('Segurança')
  expect(screen.getByRole('button', { name: 'Posto', exact: true })).toHaveTextContent('Primeiro posto')
  await choose('Veículo', /ABC1234/)
  fireEvent.click(screen.getByRole('button', { name: 'Criar ordem' }))
  await waitFor(() => expect(fuelSupplyOrdersAPI.create).toHaveBeenCalledWith(expect.objectContaining({
    vehicle_id: 'car', organization_id: 'org-2', fuel_station_id: 'station-1', requested_liters: 30,
  })))
})

it('preenche após carregar os catálogos e preserva valores editados ou apagados', async () => {
  const { rerender } = render(<FuelSupplyOrderCreateForm />)
  rerender(<FuelSupplyOrderCreateForm {...catalogs} />)
  expect(screen.getByRole('button', { name: 'Órgão solicitante' })).toHaveTextContent('Segurança')
  await choose('Veículo', /ABC1234/)
  await choose('Posto', 'Segundo posto')
  await choose('Órgão solicitante', 'Não informado')
  fireEvent.change(screen.getByLabelText('Litros previstos'), { target: { value: '42.5' } })
  rerender(<FuelSupplyOrderCreateForm {...catalogs} fuelStations={[...catalogs.fuelStations]} />)
  expect(screen.getByRole('button', { name: 'Posto', exact: true })).toHaveTextContent('Segundo posto')
  expect(screen.getByRole('button', { name: 'Órgão solicitante' })).toHaveTextContent('Não informado')
  fireEvent.click(screen.getByRole('button', { name: 'Criar ordem' }))
  await waitFor(() => expect(fuelSupplyOrdersAPI.create).toHaveBeenCalledOnce())
  expect(fuelSupplyOrdersAPI.create.mock.calls[0][0]).toMatchObject({ requested_liters: 42.5, fuel_station_id: 'station-2' })
  expect(fuelSupplyOrdersAPI.create.mock.calls[0][0]).not.toHaveProperty('organization_id')
})

it('não inventa secretaria ou posto quando não estão disponíveis e permite apagar os litros', async () => {
  auth.user = { organization_id: null }
  const { rerender } = render(<FuelSupplyOrderCreateForm {...catalogs} fuelStations={[]} />)
  expect(screen.getByRole('button', { name: 'Órgão solicitante' })).toHaveTextContent('Não informado')
  expect(screen.getByRole('button', { name: 'Posto', exact: true })).toHaveTextContent('Selecione o posto')
  fireEvent.change(screen.getByLabelText('Litros previstos'), { target: { value: '' } })
  rerender(<FuelSupplyOrderCreateForm {...catalogs} />)
  await choose('Veículo', /ABC1234/)
  fireEvent.click(screen.getByRole('button', { name: 'Criar ordem' }))
  await waitFor(() => expect(fuelSupplyOrdersAPI.create).toHaveBeenCalledOnce())
  expect(fuelSupplyOrdersAPI.create.mock.calls[0][0]).not.toHaveProperty('requested_liters')
})
