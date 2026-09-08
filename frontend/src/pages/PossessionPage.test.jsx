import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PossessionPage from './PossessionPage'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  listActive: vi.fn(),
  list: vi.fn(),
  listTrips: vi.fn(),
  reload: vi.fn(),
  update: vi.fn(),
  getReturnContext: vi.fn(),
  correctReturnConfirmation: vi.fn(),
  isAdmin: false,
}))

vi.mock('../api/client', () => ({ default: { get: mocks.get } }))
vi.mock('../api/possession', () => ({
  possessionAPI: {
    listActive: mocks.listActive,
    list: mocks.list,
    listTrips: mocks.listTrips,
    end: vi.fn(),
    update: mocks.update,
    getReturnContext: mocks.getReturnContext,
    correctReturnConfirmation: mocks.correctReturnConfirmation,
  },
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    canCreate: (module) => module === 'possession',
    canEdit: (module) => module === 'possession',
    isAdmin: mocks.isAdmin,
    reload: mocks.reload,
  }),
}))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [] }) }))
vi.mock('../components/DriverBadge', () => ({ default: ({ name }) => <span>{name}</span> }))
vi.mock('../components/Pagination', () => ({ default: () => null }))
vi.mock('../components/GuidedTour', () => ({ default: () => null }))
vi.mock('../components/PossessionTripsModal', () => ({ default: () => null }))
vi.mock('../components/PossessionReportBuilder', () => ({ default: () => <button type="button">Mais opções</button> }))
vi.mock('../components/SearchableSelect', () => ({
  default: ({ placeholder }) => <button type="button">{placeholder}</button>,
}))

const vehicle = {
  id: 'vehicle-1',
  plate: 'ABC1D23',
  brand: 'Marca',
  model: 'Modelo',
  ownership_type: 'PROPRIO',
  current_location: { display_name: 'Garagem municipal', organization_name: 'Secretaria de Teste', organization_id: 'org-1' },
}

const possession = {
  id: 'possession-1',
  public_number: 'POS-2026-000001',
  vehicle_id: vehicle.id,
  vehicle_plate: vehicle.plate,
  driver_name: 'Condutor Teste',
  driver_document: '***.***.***-**',
  driver_contact: 'restrito',
  start_date: '2026-07-13T12:00:00Z',
  end_date: null,
  is_active: true,
  start_odometer_km: '100.0',
  end_odometer_km: null,
  kilometers_driven: null,
  observation: null,
  photo_available: false,
  loan_term_available: false,
  return_term_available: false,
}

describe('PossessionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isAdmin = false
    mocks.get.mockResolvedValue({ data: [vehicle] })
    mocks.listActive.mockResolvedValue({ data: [possession] })
    mocks.list.mockResolvedValue({ data: [possession] })
    mocks.listTrips.mockResolvedValue({
      data: {
        data: [{ id: 'trip-1', status: 'EM_ANDAMENTO', sequence_number: 1 }],
        pagination: { page: 1, pages: 1, total: 1, has_next: false, has_prev: false },
      },
    })
  })

  it('bloqueia o encerramento da posse ao confirmar uma rota aberta no backend', async () => {
    render(<MemoryRouter><PossessionPage /></MemoryRouter>)

    expect(await screen.findByRole('button', { name: 'Registrar retorno' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar destino' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar rota' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encerrar posse bloqueado' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Retificar' })).not.toBeInTheDocument()
    expect(mocks.listTrips).toHaveBeenCalledWith(
      possession.id,
      { page: 1, limit: 1, status: 'EM_ANDAMENTO' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  function setupClosedPossession(confirmed = true) {
    mocks.isAdmin = true
    const record = {
      ...possession,
      public_number: 898,
      is_active: false,
      end_date: '2026-07-13T17:00:37.123Z',
      end_odometer_km: '108.0',
      return_confirmation_available: confirmed,
      return_confirmation_version: confirmed ? 1 : null,
    }
    mocks.listActive.mockResolvedValue({ data: [] })
    mocks.list.mockResolvedValue({ data: [record] })
    mocks.getReturnContext.mockResolvedValue({ data: {
      possession_public_number: 898,
      end_date: record.end_date,
      minimum_end_odometer_km: 100,
      declaration: { version: '1.0', text: 'Declaração da devolução.' },
      current_confirmation: { version: 1, final_odometer_km: 108, vehicle_condition_notes: 'Sem ressalvas' },
    } })
    return record
  }

  async function showClosedPossessions() {
    render(<MemoryRouter><PossessionPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Encerradas' }))
    await screen.findByRole('button', { name: 'Retificar', exact: true })
  }

  it('corrige o horário de uma devolução confirmada pelo fluxo versionado direto', async () => {
    const record = setupClosedPossession()
    mocks.correctReturnConfirmation.mockResolvedValue({ data: { version: 2 } })
    await showClosedPossessions()
    fireEvent.click(screen.getByRole('button', { name: 'Retificar devolução' }))
    const dialog = await screen.findByRole('dialog', { name: 'Retificar confirmação de devolução' })
    expect(mocks.getReturnContext).toHaveBeenCalledWith(record.id)
    fireEvent.change(within(dialog).getByLabelText('Data e hora da devolução corrigidas'), { target: { value: '2026-07-13T16:30' } })
    fireEvent.change(within(dialog).getByLabelText('Justificativa administrativa'), { target: { value: 'Horário corrigido após conferência.' } })
    expect(within(dialog).getByRole('button', { name: 'Criar nova versão' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar nova versão' }))
    await waitFor(() => expect(mocks.correctReturnConfirmation).toHaveBeenCalledWith(record.id, {
      end_date: new Date('2026-07-13T16:30').toISOString(),
      end_odometer_km: 108,
      vehicle_condition_notes: 'Sem ressalvas',
      correction_reason: 'Horário corrigido após conferência.',
      declaration_accepted: true,
    }))
    expect(await screen.findByText(/retificada na versão 2/, { selector: '.alert' })).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('preserva a devolução confirmada com segundos na retificação geral', async () => {
    const record = setupClosedPossession()
    mocks.update.mockResolvedValue({ data: record })
    await showClosedPossessions()
    fireEvent.click(screen.getByRole('button', { name: 'Retificar', exact: true }))
    expect(screen.getByLabelText('Fim')).toBeDisabled()
    expect(screen.getByLabelText('Odômetro final (km)')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Observação'), { target: { value: 'Observação corrigida' } })
    fireEvent.change(screen.getByLabelText('Justificativa da retificação'), { target: { value: 'Conferência administrativa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar retificação' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce())
    const [id, payload] = mocks.update.mock.calls[0]
    expect(id).toBe(record.id)
    expect(payload.get('end_date')).toBe(record.end_date)
    expect(payload.get('end_odometer_km')).toBe('108')
    expect(payload.get('observation')).toBe('Observação corrigida')
    expect(mocks.correctReturnConfirmation).not.toHaveBeenCalled()
  })

  it('abre a correção versionada pelo formulário geral sem sobrepor os diálogos', async () => {
    setupClosedPossession()
    await showClosedPossessions()
    fireEvent.click(screen.getByRole('button', { name: 'Retificar', exact: true }))
    const editDialog = screen.getByRole('dialog', { name: 'Retificar posse' })
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Retificar devolução' }))
    await screen.findByRole('dialog', { name: 'Retificar confirmação de devolução' })
    expect(screen.queryByRole('dialog', { name: 'Retificar posse' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('mantém a edição geral da devolução legada sem confirmação', async () => {
    setupClosedPossession(false)
    await showClosedPossessions()
    expect(screen.queryByRole('button', { name: 'Retificar devolução' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retificar', exact: true }))
    expect(screen.getByLabelText('Fim')).toBeEnabled()
    expect(screen.getByLabelText('Odômetro final (km)')).toBeEnabled()
  })
})
