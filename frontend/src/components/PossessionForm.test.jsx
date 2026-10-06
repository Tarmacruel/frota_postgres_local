import '../test/mockJustificationSuggestions'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { possessionAPI } from '../api/possession'
import PossessionForm from './PossessionForm'

vi.mock('../api/possession', () => ({ possessionAPI: { create: vi.fn(), getOdometerSuggestion: vi.fn() } }))
vi.mock('./SearchableSelect', () => ({
  default: ({ onChange }) => <><button type="button" onClick={() => onChange('vehicle-1')}>Selecionar veículo de teste</button><button type="button" onClick={() => onChange('vehicle-2')}>Outro veículo</button></>,
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
  beforeEach(() => {
    vi.resetAllMocks()
    possessionAPI.getOdometerSuggestion.mockResolvedValue({ data: null })
  })

  const odometerInput = () => screen.getByRole('spinbutton', { name: 'Odômetro inicial (km)' })
  function renderForm() {
    return render(<PossessionForm vehicles={[vehicle, { ...vehicle, id: 'vehicle-2' }]} onClose={vi.fn()} onSuccess={vi.fn()} onUnauthorized={vi.fn()} />)
  }

  it('preenche zero, mostra a referência e deixa vazio para veículo sem histórico', async () => {
    possessionAPI.getOdometerSuggestion.mockResolvedValueOnce({ data: { odometer_km: 0, end_date: '2026-07-12T12:00:00Z' } })
    renderForm()
    fireEvent.click(screen.getByText('Selecionar veículo de teste'))
    await waitFor(() => expect(odometerInput()).toHaveValue(0))
    expect(screen.getByText(/Último encerramento em .*: 0 km/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Outro veículo'))
    await waitFor(() => expect(possessionAPI.getOdometerSuggestion).toHaveBeenCalledTimes(2))
    expect(odometerInput()).toHaveValue(null)
  })

  it('preserva edição manual ao mudar data e avisa sem bloquear envio do valor menor', async () => {
    possessionAPI.getOdometerSuggestion.mockResolvedValue({ data: { odometer_km: 100, end_date: '2026-07-12T12:00:00Z' } })
    possessionAPI.create.mockResolvedValue({ data: { id: 'new' } })
    renderForm()
    fireEvent.click(screen.getByText('Selecionar veículo de teste'))
    await waitFor(() => expect(odometerInput()).toHaveValue(100))
    fireEvent.change(odometerInput(), { target: { value: '90' } })
    fireEvent.change(screen.getByLabelText('Início da posse'), { target: { value: '2026-07-14T10:00' } })
    await waitFor(() => expect(possessionAPI.getOdometerSuggestion).toHaveBeenCalledTimes(2))
    expect(possessionAPI.getOdometerSuggestion).toHaveBeenLastCalledWith({ vehicle_id: 'vehicle-1', start_date: new Date('2026-07-14T10:00').toISOString() })
    expect(odometerInput()).toHaveValue(90)
    expect(await screen.findByText(/O odômetro informado é menor/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Selecionar condutor de teste'))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar posse' }))
    await waitFor(() => expect(possessionAPI.create).toHaveBeenCalledTimes(1))
    expect(possessionAPI.create.mock.calls[0][0].get('start_odometer_km')).toBe('90')
  })

  it('ignora resposta de veículo anterior e preserva edição durante carregamento', async () => {
    let resolveOld
    let resolveCurrent
    possessionAPI.getOdometerSuggestion
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveCurrent = resolve }))
    renderForm()
    fireEvent.click(screen.getByText('Selecionar veículo de teste'))
    fireEvent.click(screen.getByText('Outro veículo'))
    fireEvent.change(odometerInput(), { target: { value: '75' } })
    await act(async () => resolveCurrent({ data: { odometer_km: 70, end_date: '2026-07-12T12:00:00Z' } }))
    await act(async () => resolveOld({ data: { odometer_km: 999, end_date: '2026-07-12T12:00:00Z' } }))
    expect(odometerInput()).toHaveValue(75)
    expect(screen.getByText(/Último encerramento em .*: 70 km/)).toBeInTheDocument()
  })

  it('atualiza sugestão ao mudar data e permite digitar após falha', async () => {
    possessionAPI.getOdometerSuggestion
      .mockResolvedValueOnce({ data: { odometer_km: 100, end_date: '2026-07-12T12:00:00Z' } })
      .mockResolvedValueOnce({ data: { odometer_km: 50, end_date: '2026-07-10T12:00:00Z' } })
      .mockRejectedValueOnce(new Error('offline'))
    renderForm()
    fireEvent.click(screen.getByText('Selecionar veículo de teste'))
    await waitFor(() => expect(odometerInput()).toHaveValue(100))
    fireEvent.change(screen.getByLabelText('Início da posse'), { target: { value: '2026-07-11T10:00' } })
    await waitFor(() => expect(odometerInput()).toHaveValue(50))
    fireEvent.click(screen.getByText('Outro veículo'))
    expect(await screen.findByText(/Sugestão de odômetro indisponível/)).toBeInTheDocument()
    fireEvent.change(odometerInput(), { target: { value: '20' } })
    expect(odometerInput()).toHaveValue(20)
  })

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
