import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import FuelSupplyOrderBatchCreateForm from './FuelSupplyOrderBatchCreateForm'

vi.mock('../api/fuelSupplyOrders', () => ({
  fuelSupplyOrdersAPI: { createBatch: vi.fn() },
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { organization_id: 'organization-1' } }) }))

vi.mock('./SearchableSelect', () => ({
  default: ({ ariaLabel, onChange }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => onChange(ariaLabel === 'Posto responsável' ? 'station-1' : 'organization-1')}
    >
      {ariaLabel}
    </button>
  ),
}))

const vehicles = [
  { id: 'vehicle-1', plate: 'ABC1D23', brand: 'Fiat', model: 'Toro', current_department: 'Transportes' },
  { id: 'vehicle-2', plate: 'DEF4G56', brand: 'Renault', model: 'Master', current_department: 'Saúde' },
  { id: 'vehicle-3', plate: 'HIJ7K89', brand: 'Volkswagen', model: 'Gol', current_department: 'Educação' },
]

const organizations = [{ id: 'organization-1', name: 'Secretaria de Transportes' }]
const fuelStations = [{ id: 'station-1', name: 'Posto Central', address: 'Av. Principal', phone: '0000-0000' }]

describe('FuelSupplyOrderBatchCreateForm', () => {
  it('omite veículos emprestados que estão disponíveis apenas para consulta', () => {
    render(<FuelSupplyOrderBatchCreateForm vehicles={[
      { ...vehicles[0], can_operate_vehicle: false },
      { ...vehicles[1], can_operate_vehicle: true },
    ]} organizations={organizations} fuelStations={fuelStations} />)
    expect(screen.queryByRole('checkbox', { name: /ABC1D23/ })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /DEF4G56/ })).toBeInTheDocument()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    fuelSupplyOrdersAPI.createBatch.mockResolvedValue({
      data: {
        created_count: 2,
        orders: [{ id: 'order-1' }, { id: 'order-2' }],
      },
    })
  })

  it('exige ao menos dois veículos antes de permitir a revisão', async () => {
    const user = userEvent.setup()
    render(<FuelSupplyOrderBatchCreateForm vehicles={vehicles} organizations={organizations} fuelStations={fuelStations} />)

    await user.click(screen.getByRole('checkbox', { name: /ABC1D23/ }))
    await user.click(screen.getByRole('button', { name: 'Revisar 1 ordem' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Selecione pelo menos dois veículos')
    expect(fuelSupplyOrdersAPI.createBatch).not.toHaveBeenCalled()
  })

  it('aplica litros padrão, preserva ajuste individual e envia o lote revisado', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    render(
      <FuelSupplyOrderBatchCreateForm
        vehicles={vehicles}
        organizations={organizations}
        fuelStations={fuelStations}
        onSuccess={onSuccess}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: /ABC1D23/ }))
    await user.click(screen.getByRole('checkbox', { name: /DEF4G56/ }))
    expect(screen.getByRole('spinbutton', { name: 'Litros previstos padrão' })).toHaveValue(30)

    const individualLiters = screen.getByRole('spinbutton', { name: 'Litros previstos para DEF4G56' })
    await user.clear(individualLiters)
    await user.type(individualLiters, '42.5')

    await user.click(screen.getByRole('button', { name: 'Revisar 2 ordens' }))

    expect(screen.getByRole('heading', { name: 'Revise antes de emitir' })).toBeInTheDocument()
    expect(screen.getByText('30 L')).toBeInTheDocument()
    expect(screen.getByText('42,5 L')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Emitir 2 ordens' }))

    await waitFor(() => expect(fuelSupplyOrdersAPI.createBatch).toHaveBeenCalledTimes(1))
    expect(fuelSupplyOrdersAPI.createBatch).toHaveBeenCalledWith(expect.objectContaining({
      items: [
        { vehicle_id: 'vehicle-1', requested_liters: 30 },
        { vehicle_id: 'vehicle-2', requested_liters: 42.5 },
      ],
      fuel_station_id: 'station-1',
      organization_id: 'organization-1',
      expires_at: expect.any(String),
    }))
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({
      message: '2 ordens foram emitidas com sucesso. Cada veículo possui seu próprio comprovante.',
      orders: [{ id: 'order-1' }, { id: 'order-2' }],
    }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
