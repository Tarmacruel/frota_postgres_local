import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  getRectificationContext: vi.fn(),
  correctReturnConfirmation: vi.fn(),
  isAdmin: false,
  isProduction: false,
  canEdit: true,
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
    getRectificationContext: mocks.getRectificationContext,
    correctReturnConfirmation: mocks.correctReturnConfirmation,
  },
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    canCreate: (module) => module === 'possession',
    canEdit: (module) => module === 'possession' && mocks.canEdit,
    isAdmin: mocks.isAdmin,
    isProduction: mocks.isProduction,
    reload: mocks.reload,
  }),
}))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [] }) }))
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
    mocks.isProduction = false
    mocks.canEdit = true
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
    expect(screen.getByRole('button', { name: 'Encerrar posse bloqueado' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Mais ações da posse/ }))
    expect(screen.getByRole('menuitem', { name: 'Adicionar destino' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Cancelar rota' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Retificar' })).not.toBeInTheDocument()
    expect(mocks.listTrips).toHaveBeenCalledWith(
      possession.id,
      { page: 1, limit: 1, status: 'EM_ANDAMENTO' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('exibe a matrícula junto ao condutor da posse', async () => {
    mocks.isProduction = true
    mocks.listActive.mockResolvedValue({ data: [{ ...possession, driver_matricula: '000123' }] })
    render(<MemoryRouter><PossessionPage /></MemoryRouter>)
    const registration = await screen.findByText('Matrícula: 000123')
    expect(registration.closest('td')).toHaveTextContent(possession.driver_name)
    expect(registration.closest('td')).toHaveAttribute('data-label', 'Condutor')
  })

  it('filtra posses pela matrícula completa ou parcial e mantém a busca existente', async () => {
    mocks.isProduction = true
    mocks.listActive.mockResolvedValue({ data: [
      { ...possession, driver_name: 'Condutor Localizado', driver_matricula: '000123-AB' },
      { ...possession, id: 'possession-2', driver_name: 'Condutor Legado', driver_matricula: null },
      { ...possession, id: 'possession-3', driver_name: 'Outro Condutor', driver_matricula: '987654' },
    ] })
    render(<MemoryRouter><PossessionPage /></MemoryRouter>)
    await screen.findByText('Condutor Localizado')
    const search = screen.getByPlaceholderText('Buscar por placa, secretaria, condutor, matrícula ou contato')
    for (const value of ['000123-AB', '000123', '  123-ab  ']) {
      fireEvent.change(search, { target: { value } })
      expect(screen.getByText('Condutor Localizado')).toBeInTheDocument()
      expect(screen.queryByText('Condutor Legado')).not.toBeInTheDocument()
      expect(screen.queryByText('Outro Condutor')).not.toBeInTheDocument()
    }
    fireEvent.change(search, { target: { value: 'Legado' } })
    expect(screen.getByText('Condutor Legado')).toBeInTheDocument()
    expect(screen.queryByText('Condutor Localizado')).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByText('Condutor Localizado')).toBeInTheDocument()
    expect(screen.getByText('Condutor Legado')).toBeInTheDocument()
    expect(screen.getByText('Outro Condutor')).toBeInTheDocument()
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
      revision: 2,
    }
    mocks.listActive.mockResolvedValue({ data: [] })
    mocks.list.mockResolvedValue({ data: [record] })
    const returnContext = {
      possession_public_number: 898,
      end_date: record.end_date,
      minimum_end_odometer_km: 100,
      declaration: { version: '1.0', text: 'Declaração da devolução.' },
      current_confirmation: confirmed ? { version: 1, final_odometer_km: 108, vehicle_condition_notes: 'Sem ressalvas' } : null,
    }
    mocks.getReturnContext.mockResolvedValue({ data: returnContext })
    mocks.getRectificationContext.mockResolvedValue({ data: { possession: record, return_context: returnContext, revisions: [] } })
    return record
  }

  async function showClosedPossessions() {
    render(<MemoryRouter><PossessionPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Encerradas' }))
    await screen.findByText('Posse #898')
    fireEvent.click(screen.getByRole('button', { name: /Mais ações da posse/ }))
    await screen.findByRole('menuitem', { name: 'Retificar', exact: true })
  }

  it.each(['ADMIN', 'PRODUCAO'])('retifica início e devolução por uma única requisição (%s)', async (role) => {
    const record = setupClosedPossession()
    mocks.isAdmin = role === 'ADMIN'; mocks.isProduction = role === 'PRODUCAO'
    mocks.update.mockResolvedValue({ data: { ...record, revision: 3 } })
    await showClosedPossessions()
    expect(screen.queryByRole('button', { name: 'Retificar devolução' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retificar', exact: true }))
    const end = await screen.findByLabelText('Fim')
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-07-13T10:00' } })
    fireEvent.change(end, { target: { value: '2026-07-13T16:30' } })
    fireEvent.change(screen.getByLabelText('Odômetro inicial (km)'), { target: { value: '99' } })
    fireEvent.change(screen.getByLabelText('Odômetro final (km)'), { target: { value: '109' } })
    fireEvent.change(screen.getByLabelText('Justificativa da retificação'), { target: { value: 'Conferência administrativa conjunta' } })
    expect(screen.getByRole('button', { name: 'Salvar retificação' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/Li integralmente/))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar retificação' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce())
    const [id, body] = mocks.update.mock.calls[0]
    expect(id).toBe(record.id)
    expect(body.get('start_date')).toBe(new Date('2026-07-13T10:00').toISOString())
    expect(body.get('end_date')).toBe(new Date('2026-07-13T16:30').toISOString())
    expect(body.get('start_odometer_km')).toBe('99')
    expect(body.get('end_odometer_km')).toBe('109')
    expect(body.get('expected_revision')).toBe('2')
    expect(body.get('declaration_accepted')).toBe('true')
    expect(body.get('vehicle_condition_notes')).toBe('Sem ressalvas')
    expect(mocks.correctReturnConfirmation).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Posse retificada na versão 3')
  })

  it('preserva segundos e os dados digitados em conflito, exigindo recarga', async () => {
    const record = setupClosedPossession()
    mocks.update.mockRejectedValue({ response: { status: 409, data: { detail: { code: 'POSSESSION_REVISION_CONFLICT', message: 'A posse mudou; recarregue.' } } } })
    await showClosedPossessions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retificar', exact: true }))
    await screen.findByLabelText('Fim')
    fireEvent.change(screen.getByLabelText('Observação'), { target: { value: 'Observação corrigida' } })
    fireEvent.change(screen.getByLabelText('Justificativa da retificação'), { target: { value: 'Conferência administrativa' } })
    fireEvent.click(screen.getByLabelText(/Li integralmente/))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar retificação' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A posse mudou')
    expect(mocks.update.mock.calls[0][1].get('end_date')).toBe(record.end_date)
    expect(mocks.update.mock.calls[0][1].get('start_date')).toBe(record.start_date)
    expect(screen.getByLabelText('Observação')).toHaveValue('Observação corrigida')
    expect(screen.getByRole('button', { name: 'Salvar retificação' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Recarregar retificação' })).toBeInTheDocument()
  })

  it('oferece a mesma tela para devolução legada e permite consultar o histórico', async () => {
    setupClosedPossession(false)
    await showClosedPossessions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retificar', exact: true }))
    expect(await screen.findByLabelText('Fim')).toBeEnabled()
    expect(screen.getByLabelText('Condições do veículo na devolução')).toHaveValue('')
    expect(screen.getByText('Histórico de retificações (0)')).toBeInTheDocument()
  })

  it('permite recarregar quando a consulta falha, sem oferecer dados antigos para salvar', async () => {
    setupClosedPossession()
    mocks.getRectificationContext.mockRejectedValueOnce(new Error('offline'))
    await showClosedPossessions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retificar', exact: true }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar retificação' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar retificação' }))
    expect(await screen.findByLabelText('Fim')).toBeEnabled()
  })

  it('bloqueia envio repetido enquanto a retificação está sendo gravada', async () => {
    const record = setupClosedPossession()
    let finish
    mocks.update.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await showClosedPossessions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retificar', exact: true }))
    await screen.findByLabelText('Fim')
    fireEvent.change(screen.getByLabelText('Justificativa da retificação'), { target: { value: 'Conferência administrativa' } })
    fireEvent.click(screen.getByLabelText(/Li integralmente/))
    const submit = screen.getByRole('button', { name: 'Salvar retificação' })
    fireEvent.click(submit)
    fireEvent.submit(submit.closest('form'))
    expect(mocks.update).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled()
    finish({ data: { ...record, revision: 3 } })
    expect(await screen.findByRole('status')).toHaveTextContent('Posse retificada na versão 3')
  })

  it.each(['PADRAO', 'POSTO', 'PRODUCAO_SEM_EDICAO'])('oculta retificações para %s', async (role) => {
    setupClosedPossession()
    mocks.isAdmin = false
    mocks.isProduction = role === 'PRODUCAO_SEM_EDICAO'
    mocks.canEdit = false
    render(<MemoryRouter><PossessionPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Encerradas' }))
    await screen.findByText('Posse #898')
    fireEvent.click(screen.getByRole('button', { name: /Mais ações da posse/ }))
    expect(screen.queryByRole('menuitem', { name: 'Retificar', exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retificar devolução' })).not.toBeInTheDocument()
  })

})
