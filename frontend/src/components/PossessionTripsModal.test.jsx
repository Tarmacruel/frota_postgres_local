import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { possessionAPI } from '../api/possession'
import PossessionTripsModal from './PossessionTripsModal'

vi.mock('../api/possession', () => ({
  possessionAPI: {
    listTrips: vi.fn(),
    createTrip: vi.fn(),
    addTripDestinations: vi.fn(),
    endTrip: vi.fn(),
    cancelTrip: vi.fn(),
  },
}))

const possession = {
  id: 'possession-1',
  public_number: 'POS-2026-000001',
  vehicle_plate: 'ABC1D23',
  driver_name: 'Condutor Teste',
  is_active: true,
  start_odometer_km: '100.0',
}

const openTrip = {
  id: 'trip-1',
  possession_id: possession.id,
  sequence_number: 1,
  status: 'EM_ANDAMENTO',
  purpose: 'Vistoria técnica',
  origin: 'Garagem municipal',
  departure_at: '2026-07-13T12:00:00Z',
  return_at: null,
  start_odometer_km: '100.0',
  end_odometer_km: null,
  kilometers_driven: null,
  observation: null,
  cancellation_reason: null,
  destinations: [],
  operational_details_restricted: false,
}

function tripPage(trips) {
  return {
    data: {
      data: trips,
      pagination: { page: 1, pages: 1, total: trips.length, has_next: false, has_prev: false },
    },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('PossessionTripsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('diferencia retorno de encerramento da posse e impede envio duplicado', async () => {
    const user = userEvent.setup()
    const request = deferred()
    possessionAPI.listTrips
      .mockResolvedValueOnce(tripPage([openTrip]))
      .mockResolvedValueOnce(tripPage([{ ...openTrip, status: 'ENCERRADA', return_at: '2026-07-13T13:00:00Z', end_odometer_km: '110.0' }]))
    possessionAPI.endTrip.mockReturnValue(request.promise)

    render(
      <PossessionTripsModal
        possession={possession}
        canCreate
        canEdit
        onClose={vi.fn()}
        onStateChange={vi.fn()}
        onUnauthorized={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Registrar retorno da rota' }))
    expect(screen.getByText('Esta ação encerra apenas a rota.')).toBeInTheDocument()
    expect(screen.getByText(/posse continuará ativa/i)).toBeInTheDocument()
    expect(screen.queryByText('Encerrar posse')).not.toBeInTheDocument()

    const odometer = screen.getByRole('spinbutton', { name: 'Hodômetro final (km)' })
    await user.clear(odometer)
    await user.type(odometer, '110')
    const submit = screen.getByRole('button', { name: 'Registrar retorno da rota' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(possessionAPI.endTrip).toHaveBeenCalledTimes(1)
    expect(possessionAPI.endTrip).toHaveBeenCalledWith(possession.id, openTrip.id, expect.objectContaining({ end_odometer_km: '110' }))

    request.resolve({ data: {} })
    expect(await screen.findByRole('status')).toHaveTextContent(/Apenas a rota foi encerrada; a posse continua ativa/)
  })

  it('trata sessão expirada sem contornar a autorização do backend', async () => {
    const onUnauthorized = vi.fn()
    possessionAPI.listTrips.mockRejectedValue({ response: { status: 401, data: { detail: 'Não autenticado' } } })

    render(
      <PossessionTripsModal
        possession={possession}
        canCreate
        canEdit
        onClose={vi.fn()}
        onStateChange={vi.fn()}
        onUnauthorized={onUnauthorized}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Sua sessão expirou')
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1))
  })

  it('exibe a validação 422 devolvida pelo contrato ao iniciar rota', async () => {
    const user = userEvent.setup()
    possessionAPI.listTrips.mockResolvedValue(tripPage([]))
    possessionAPI.createTrip.mockRejectedValue({
      response: {
        status: 422,
        data: { detail: [{ loc: ['body', 'origin'], msg: 'Origem inválida' }] },
      },
    })

    render(
      <PossessionTripsModal
        possession={possession}
        initialAction="create"
        suggestedOrigin="Garagem municipal"
        canCreate
        canEdit
        onClose={vi.fn()}
        onStateChange={vi.fn()}
        onUnauthorized={vi.fn()}
      />,
    )

    await user.type(await screen.findByRole('textbox', { name: 'Finalidade' }), 'Entrega de documentos')
    const odometer = screen.getByRole('spinbutton', { name: 'Hodômetro inicial (km)' })
    await user.clear(odometer)
    await user.type(odometer, '100')
    await user.click(screen.getByRole('button', { name: 'Iniciar rota' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Origem inválida')
    expect(screen.getByRole('textbox', { name: 'Origem' })).toHaveAccessibleDescription('Origem inválida')
    expect(possessionAPI.createTrip).toHaveBeenCalledTimes(1)
  })

  it('expõe a negativa 403 sem oferecer um caminho alternativo', async () => {
    possessionAPI.listTrips.mockRejectedValue({ response: { status: 403, data: { detail: 'Acesso negado' } } })

    render(
      <PossessionTripsModal
        possession={possession}
        canCreate={false}
        canEdit={false}
        onClose={vi.fn()}
        onStateChange={vi.fn()}
        onUnauthorized={vi.fn()}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Seu perfil não possui permissão')
    expect(screen.queryByRole('button', { name: 'Iniciar rota' })).not.toBeInTheDocument()
  })

  it('atualiza a timeline após conflito 409 e mantém o motivo visível', async () => {
    const user = userEvent.setup()
    possessionAPI.listTrips
      .mockResolvedValueOnce(tripPage([openTrip]))
      .mockResolvedValueOnce(tripPage([{ ...openTrip, status: 'CANCELADA', cancellation_reason: 'Cancelada em outra sessão' }]))
    possessionAPI.cancelTrip.mockRejectedValue({
      response: { status: 409, data: { detail: { code: 'TRIP_NOT_OPEN', message: 'A rota já foi encerrada em outra sessão.' } } },
    })

    render(
      <PossessionTripsModal
        possession={possession}
        canCreate
        canEdit
        onClose={vi.fn()}
        onStateChange={vi.fn()}
        onUnauthorized={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Cancelar rota' }))
    await user.type(screen.getByRole('textbox', { name: 'Justificativa do cancelamento' }), 'Mudança operacional')
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento da rota' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A rota já foi encerrada em outra sessão.')
    expect(await screen.findByText('Cancelada')).toBeInTheDocument()
    expect(possessionAPI.cancelTrip).toHaveBeenCalledTimes(1)
  })
})
