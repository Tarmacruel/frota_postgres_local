import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { possessionAPI } from '../api/possession'
import PossessionForm from './PossessionForm'

vi.mock('../api/possession', () => ({ possessionAPI: { create: vi.fn() } }))
vi.mock('./SearchableSelect', () => ({
  default: ({ onChange }) => <button type="button" onClick={() => onChange('vehicle-1')}>Selecionar veículo de teste</button>,
}))
vi.mock('./DriverSelect', () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange({ id: 'driver-1', nome_completo: 'Condutor Teste', documento: '***.***.***-**', contato: 'restrito' })}>
      Selecionar condutor de teste
    </button>
  ),
}))

const vehicle = {
  id: 'vehicle-1',
  plate: 'ABC1D23',
  brand: 'Marca',
  model: 'Modelo',
  ownership_type: 'PROPRIO',
  current_location: { display_name: 'Garagem municipal' },
}

describe('PossessionForm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envia a rota inicial no contrato multipart e exige confirmação explícita no conflito', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    possessionAPI.create
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: {
            detail: {
              code: 'ACTIVE_POSSESSION_EXISTS',
              message: 'Já existe posse ativa',
              active_possession: { id: 'old-1', public_number: 'POS-2026-000010', start_date: '2026-07-12T10:00:00Z' },
            },
          },
        },
      })
      .mockResolvedValueOnce({ data: { id: 'new-1' } })

    render(<PossessionForm vehicles={[vehicle]} onClose={vi.fn()} onSuccess={onSuccess} onUnauthorized={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Selecionar veículo de teste' }))
    await user.click(screen.getByRole('button', { name: 'Selecionar condutor de teste' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Odômetro inicial (km)' }), '100')
    await user.click(screen.getByRole('checkbox', { name: /Rota inicial/ }))
    expect(screen.getByRole('textbox', { name: 'Origem' })).toHaveValue('Garagem municipal')
    await user.type(screen.getByRole('textbox', { name: 'Finalidade' }), 'Entrega de documentos')

    await user.click(screen.getByRole('button', { name: 'Registrar posse' }))

    await waitFor(() => expect(possessionAPI.create).toHaveBeenCalledTimes(1))
    const firstPayload = possessionAPI.create.mock.calls[0][0]
    expect(firstPayload.get('replace_active')).toBeNull()
    expect(JSON.parse(firstPayload.get('initial_trip_json'))).toEqual(expect.objectContaining({
      origin: 'Garagem municipal',
      purpose: 'Entrega de documentos',
      start_odometer_km: '100',
      destinations: [],
    }))

    expect(await screen.findByRole('heading', { name: 'Substituir a posse atual?' })).toBeInTheDocument()
    expect(screen.getByText(/POS-2026-000010/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar substituição e registrar posse' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: /Confirmo que revisei/ }))
    await user.type(screen.getByRole('textbox', { name: 'Justificativa da substituição' }), 'Troca formal de responsável')
    await user.click(screen.getByRole('button', { name: 'Confirmar substituição e registrar posse' }))

    await waitFor(() => expect(possessionAPI.create).toHaveBeenCalledTimes(2))
    const replacementPayload = possessionAPI.create.mock.calls[1][0]
    expect(replacementPayload.get('replace_active')).toBe('true')
    expect(replacementPayload.get('replacement_reason')).toBe('Troca formal de responsável')
    expect(replacementPayload.get('initial_trip_json')).toBe(firstPayload.get('initial_trip_json'))
    expect(onSuccess).toHaveBeenCalledWith('Nova posse registrada após substituição explícita e justificada da posse anterior.')
  })
})
