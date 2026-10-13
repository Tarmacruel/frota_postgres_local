import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyticsV2API } from '../../api/analyticsV2'
import AnalyticsAlerts from './AnalyticsAlerts'
import AnalyticsAlertDetail from './AnalyticsAlertDetail'

const auth = vi.hoisted(() => ({ isAdmin: true, isProduction: false, canView: vi.fn(), canEdit: vi.fn() }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../api/analyticsV2', () => ({ analyticsV2API: Object.fromEntries(
  ['alerts', 'alert', 'alertEvents', 'reconcileAlerts', 'changeAlertStatus'].map((key) => [key, vi.fn()]),
) }))
const evidence = { label: 'Hodômetro regressivo', rule: 'hodômetro atual menor que anterior', observed: '90 km', reference: '100 km',
  sample_size: 2, limitation: 'Triagem para conferir registros', rule_version: 'fuel-v2.1', previous_supply_id: 'previous' }
const context = { date_from: '2026-09-01', date_to: '2026-09-30', timezone: 'America/Bahia', organization: null,
  history_date_from: '2026-08-02', history_date_to: '2026-08-31', history_limit: 'Período anterior equivalente' }
function sample() { return { id: 'case-1', source_id: 'supply-1', source_available: true, rule_key: 'odometer', status: 'NEW', severity: 'HIGH',
  version: 1, plate: 'TST1A23', brand: 'Marca', model: 'Modelo', vehicle_id: 'vehicle-1', driver_id: null,
  source_occurred_at: '2026-09-10T12:00:00Z',
  can_view_vehicle: true, evidence, evaluation_context: context, original_evidence: evidence, original_context: context,
  first_detected_at: '2026-10-01T10:00:00Z', last_detected_at: '2026-10-01T10:00:00Z', evaluation_count: 1,
  allowed_states: ['IN_REVIEW', 'RESOLVED', 'IGNORED'] } }
beforeEach(() => {
  vi.clearAllMocks(); auth.isAdmin = true; auth.isProduction = false
  auth.canView.mockReturnValue(true); auth.canEdit.mockReturnValue(true)
  analyticsV2API.alerts.mockResolvedValue({ data: { items: [sample()], total: 1, offset: 0, filters: context, coverage: 'Reconciliação explícita' } })
  analyticsV2API.alert.mockResolvedValue({ data: sample() })
  analyticsV2API.alertEvents.mockResolvedValue({ data: { items: [], total: 0 } })
  analyticsV2API.reconcileAlerts.mockResolvedValue({ data: { created: 1, revisited: 0, evaluated: 4 } })
  analyticsV2API.changeAlertStatus.mockResolvedValue({ data: { id: 'case-1', status: 'IGNORED', version: 2 } })
})

describe('fila persistida', () => {
  it('consultar não grava, e o caso abre com os filtros efetivos', async () => {
    const open = vi.fn(); render(<AnalyticsAlerts onOpenEntity={open} />)
    await userEvent.click(await screen.findByRole('button', { name: /TST1A23.*Marca Modelo.*Hodômetro/ }))
    expect(analyticsV2API.reconcileAlerts).not.toHaveBeenCalled()
    expect(screen.getByText('Abastecimento: 10/09/2026, 09:00')).toBeInTheDocument()
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'alert', entityId: 'case-1', filters: context }))
  })
  it('reconciliação explícita repete a chave após falha de rede', async () => {
    analyticsV2API.reconcileAlerts.mockRejectedValueOnce(new Error('offline'))
    render(<AnalyticsAlerts onOpenEntity={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Conferir e persistir casos do período' })
    await userEvent.click(button)
    await screen.findByRole('alert')
    await userEvent.click(button)
    await screen.findByText(/1 caso\(s\) criado\(s\)/)
    const [first, second] = analyticsV2API.reconcileAlerts.mock.calls
    expect(first[1]).toBe(second[1])
    expect(first[0]).not.toHaveProperty('status')
    expect(first[0]).not.toHaveProperty('evidence')
  })
  it('mantém filtro de estado e não consulta painel inativo', async () => {
    const { rerender } = render(<AnalyticsAlerts onOpenEntity={vi.fn()} />)
    await screen.findByRole('button', { name: /TST1A23/ })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'RESOLVED' } })
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await waitFor(() => expect(analyticsV2API.alerts.mock.lastCall[0].status).toBe('RESOLVED'))
    const before = analyticsV2API.alerts.mock.calls.length
    rerender(<AnalyticsAlerts enabled={false} onOpenEntity={vi.fn()} />)
    expect(analyticsV2API.alerts).toHaveBeenCalledTimes(before)
    rerender(<AnalyticsAlerts enabled onOpenEntity={vi.fn()} />)
    expect(screen.getByLabelText('Estado')).toHaveValue('RESOLVED')
  })
  it('reconciliação não aparece para PRODUCAO e fonte sem leitura não é consultada', async () => {
    auth.isAdmin = false; auth.isProduction = true
    const { unmount } = render(<AnalyticsAlerts onOpenEntity={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Conferir e persistir casos do período' })).not.toBeInTheDocument()
    unmount(); vi.clearAllMocks(); auth.canView.mockReturnValue(false)
    render(<AnalyticsAlerts onOpenEntity={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('exige leitura de abastecimentos')
    expect(analyticsV2API.alerts).not.toHaveBeenCalled()
  })
})

describe('tratamento e evidência', () => {
  const detail = { entityId: 'case-1', filters: context, onChanged: vi.fn() }
  it('leva regra/amostra ao registro de domínio e ao veículo', async () => {
    const open = vi.fn(); render(<AnalyticsAlertDetail detail={detail} onOpen={open} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir abastecimento de origem' }))
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'record', entityId: 'supply-1', source: 'fuel_supply',
      filters: expect.objectContaining({ date_from: '2026-09-01' }), origin: expect.objectContaining({ formula: evidence.rule }) }))
    await userEvent.click(screen.getByRole('button', { name: 'Ver veículo' }))
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'vehicle', entityId: 'vehicle-1', origin: expect.objectContaining({ formula: evidence.rule }) }))
  })
  it('ignorar exige motivo e conflito exige recarregar antes de decidir', async () => {
    analyticsV2API.changeAlertStatus.mockRejectedValueOnce({ response: { status: 409, data: { detail: 'Caso atualizado por outra operação' } } })
    render(<AnalyticsAlertDetail detail={detail} onOpen={vi.fn()} />)
    await screen.findByRole('form', { name: 'Tratamento do alerta' })
    await userEvent.selectOptions(screen.getByLabelText('Novo estado'), 'IGNORED')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar decisão' }))
    expect(analyticsV2API.changeAlertStatus).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Justificativa'), 'Registro conferido')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar decisão' }))
    await screen.findByText('Caso atualizado por outra operação')
    expect(screen.getByRole('button', { name: 'Registrar decisão' })).toBeDisabled()
    analyticsV2API.alert.mockResolvedValue({ data: { ...sample(), version: 3 } })
    await userEvent.click(screen.getByRole('button', { name: 'Recarregar caso antes de decidir' }))
    await screen.findByRole('form', { name: 'Tratamento do alerta' })
    await userEvent.selectOptions(screen.getByLabelText('Novo estado'), 'IGNORED')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar decisão' }))
    await screen.findByText('Decisão registrada no histórico.')
    expect(analyticsV2API.changeAlertStatus.mock.calls[1][2]).toBe(3)
  })
  it('reenvia o mesmo pedido idempotente quando o resultado de rede é desconhecido', async () => {
    analyticsV2API.changeAlertStatus.mockRejectedValueOnce(new Error('offline'))
    render(<AnalyticsAlertDetail detail={detail} onOpen={vi.fn()} />)
    await screen.findByRole('form', { name: 'Tratamento do alerta' })
    await userEvent.selectOptions(screen.getByLabelText('Novo estado'), 'IN_REVIEW')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar decisão' }))
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar decisão' }))
    await screen.findByText('Decisão registrada no histórico.')
    expect(analyticsV2API.changeAlertStatus.mock.calls[0]).toEqual(analyticsV2API.changeAlertStatus.mock.calls[1])
  })
  it('não expõe referência global quando o backend informa evidência indisponível', async () => {
    analyticsV2API.alert.mockResolvedValue({ data: { ...sample(), evidence: null, evaluation_context: null,
      original_evidence: null, original_context: null, evidence_unavailable: true, allowed_states: [] } })
    render(<AnalyticsAlertDetail detail={detail} onOpen={vi.fn()} />)
    expect(await screen.findByText('Evidência da última avaliação indisponível neste escopo.')).toBeInTheDocument()
    expect(screen.queryByText(/90 km.*100 km/)).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Tratamento do alerta' })).not.toBeInTheDocument()
  })
})
