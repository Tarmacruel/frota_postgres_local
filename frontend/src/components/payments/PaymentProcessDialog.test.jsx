import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PaymentProcessDialog from './PaymentProcessDialog'
import { contractControlAPI } from '../../api/contractControl'
import { paymentProcessesAPI } from '../../api/paymentProcesses'
import { fuelSuppliesAPI } from '../../api/fuelSupplies'
import { maintenanceAPI } from '../../api/maintenance'

vi.mock('../../api/contractControl', () => ({ contractControlAPI: { config: vi.fn(), operations: vi.fn(), reconcile: vi.fn() } }))
vi.mock('../../api/paymentProcesses', () => ({ paymentProcessesAPI: { create: vi.fn(), update: vi.fn() } }))
vi.mock('../../api/fuelSupplies', () => ({ fuelSuppliesAPI: { getById: vi.fn() } }))
vi.mock('../../api/maintenance', () => ({ maintenanceAPI: { getById: vi.fn() } }))

const contract = { id: 'c', number: '2-914-2025', supplier_id: 'company', supplier_name: 'Empresa contratada', kind: 'FUEL' }
const fuel = { id: 'op', source_id: 'fuel-record', source_type: 'FUEL_SUPPLY', amount: '183.00', occurred_at: '2026-10-23T12:00:00Z', vehicle_plate: 'TST0001', provider_name: 'Posto executante', organization_name: 'Secretaria A' }
const organizations = [{ id: 'org-a', name: 'Secretaria A' }, { id: 'org-b', name: 'Secretaria B' }]
let saved
let closed
function mount(props = {}) {
  return render(<PaymentProcessDialog contractId="c" contracts={[contract, { id: 'm', number: 'M-01', supplier_id: 'work', supplier_name: 'Oficina', kind: 'MAINTENANCE' }]} suppliers={[{ id: 'company', name: 'Empresa contratada' }, { id: 'work', name: 'Oficina' }]} organizations={organizations} onSaved={saved} onClose={closed} {...props} />)
}
async function choose() {
  fireEvent.click(await screen.findByRole('checkbox', { name: /TST0001/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled())
  // Changing step replaces this button with a submit button in the same slot.
  // The source click must be canceled before the browser's default submission.
  expect(fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))).toBe(false)
}
function number(value = 'TESTE-HML-P-001') { fireEvent.change(screen.getByLabelText('Número do processo'), { target: { value } }) }

beforeEach(() => {
  vi.resetAllMocks()
  saved = vi.fn(); closed = vi.fn()
  contractControlAPI.config.mockResolvedValue({ data: { enabled: true } })
  contractControlAPI.operations.mockResolvedValue({ data: { data: [fuel], pages: 1, total: 1 } })
  contractControlAPI.reconcile.mockResolvedValue({ data: {} })
  fuelSuppliesAPI.getById.mockResolvedValue({ data: { id: 'fuel-record', organization_id: 'org-a', fuel_type: 'ETANOL', liters: 30 } })
  maintenanceAPI.getById.mockResolvedValue({ data: { id: 'maintenance-record', responsible_organization_id: 'org-b', service_description: 'Troca dos pneus' } })
  paymentProcessesAPI.create.mockResolvedValue({ data: { id: 'created', process_number: 'TESTE-HML-P-001' } })
  paymentProcessesAPI.update.mockResolvedValue({ data: { id: 'existing' } })
})

describe('criação assistida de processo', () => {
  it('preenche dados de origem e mantém documento fiscal ausente para o usuário informar', async () => {
    mount({ user: { role: 'ADMIN', organization_id: 'org-b' } })
    await screen.findByText('Posto executante')
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(paymentProcessesAPI.create).not.toHaveBeenCalled()
    await choose()
    expect(screen.getByLabelText('Valor da fatura (R$)')).toHaveValue('R$ 183,00')
    expect(screen.getByLabelText('Competência')).toHaveValue('2026-10')
    expect(screen.getByLabelText('Secretaria')).toHaveValue('org-a')
    expect(screen.getByLabelText('Fornecedor')).toHaveValue('company')
    expect(screen.getByLabelText('Número da NF')).toHaveValue('')
    expect(screen.getByLabelText('Emissão')).toHaveValue('')
    expect(screen.getByLabelText('Vencimento')).toHaveValue('')
    number()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e conciliar' }))
    await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: 'created' }), { reconciled: true }))
    expect(fuelSuppliesAPI.getById).toHaveBeenCalledWith('fuel-record')
    expect(paymentProcessesAPI.create).toHaveBeenCalledWith(expect.objectContaining({ supplier_id: 'company', contract_id: 'c', organization_id: 'org-a', unit_name: 'Secretaria A', amount: '183.00', competence_month: '2026-10-01', stage: 'ASSEMBLY', invoice_number: null, paid_at: null, references: [expect.objectContaining({ external_id: 'fuel-record', description: expect.stringContaining('ETANOL · 30 L') })] }))
    expect(contractControlAPI.reconcile).toHaveBeenCalledWith('created', { operation_ids: ['op'], justification: null })
  })
  it('reaproveita manutenção pela chave da origem e pela secretaria responsável', async () => {
    const maintenance = { ...fuel, id: 'maint-op', source_id: 'maintenance-record', source_type: 'MAINTENANCE', organization_name: 'Secretaria B' }
    contractControlAPI.operations.mockResolvedValue({ data: { data: [maintenance], total: 1, pages: 1 } })
    mount({ contractId: 'm', operationId: 'maint-op' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByLabelText('Secretaria')).toHaveValue('org-b')
    expect(screen.getByLabelText('Tipo')).toHaveValue('MAINTENANCE')
    expect(maintenanceAPI.getById).toHaveBeenCalledWith('maintenance-record')
    expect(fuelSuppliesAPI.getById).not.toHaveBeenCalled()
  })
  it('preserva os dados fiscais e o valor manual ao voltar e alterar a seleção', async () => {
    mount(); await choose(); number('RASCUNHO-1')
    fireEvent.change(screen.getByLabelText('Valor da fatura (R$)'), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText('Número da NF'), { target: { value: 'NF-55' } })
    fireEvent.click(screen.getByRole('button', { name: 'Alterar origem' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /TST0001/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /TST0001/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByLabelText('Número do processo')).toHaveValue('RASCUNHO-1')
    expect(screen.getByLabelText('Número da NF')).toHaveValue('NF-55')
    expect(screen.getByLabelText('Valor da fatura (R$)')).toHaveValue('R$ 200,00')
    expect(screen.getByRole('button', { name: 'Salvar e conciliar' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Justificativa da diferença'), { target: { value: 'Diferença conferida na fatura' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmo o ajuste desta diferença no contrato.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e conciliar' }))
    await waitFor(() => expect(contractControlAPI.reconcile).toHaveBeenCalledWith('created', { operation_ids: ['op'], justification: 'Diferença conferida na fatura' }))
  })
  it('mantém a seleção entre páginas e permite conferir/remover serviços fora da página', async () => {
    const second = { ...fuel, id: 'op-2', source_id: 'fuel-2', vehicle_plate: 'TST0002', amount: '17.00' }
    contractControlAPI.operations.mockImplementation((_id, query) => Promise.resolve({ data: { data: query.page === 1 ? [fuel] : [second], pages: 2, total: 2 } }))
    mount()
    fireEvent.click(await screen.findByRole('checkbox', { name: /TST0001/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /TST0002/ }))
    expect(screen.getByText('2 serviço(s) selecionado(s)')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /TST0002/ })).toBeChecked()
    fireEvent.click(screen.getByText('Conferir seleção'))
    fireEvent.click(screen.getByRole('button', { name: /Remover serviço TST0001/ }))
    expect(screen.getByText('1 serviço(s) selecionado(s)')).toBeInTheDocument()
  })
  it('não cria processo se o serviço selecionado mudou antes de salvar e mantém o formulário', async () => {
    mount(); await choose(); number('MANTER-01')
    contractControlAPI.operations.mockResolvedValue({ data: { data: [{ ...fuel, amount: '190.00' }], pages: 1, total: 1 } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e conciliar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Um serviço foi alterado')
    expect(screen.getByLabelText('Número do processo')).toHaveValue('MANTER-01')
    expect(paymentProcessesAPI.create).not.toHaveBeenCalled()
    expect(contractControlAPI.reconcile).not.toHaveBeenCalled()
  })
  it('retoma a conciliação do mesmo processo após falha parcial, sem duplicar criação', async () => {
    contractControlAPI.reconcile.mockRejectedValueOnce(new Error('Falha temporária de conciliação')).mockResolvedValueOnce({ data: {} })
    mount(); await choose(); number()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e conciliar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha temporária')
    expect(screen.getByLabelText('Número do processo')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar conciliação novamente' }))
    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(paymentProcessesAPI.create).toHaveBeenCalledTimes(1)
    expect(contractControlAPI.reconcile).toHaveBeenCalledTimes(2)
    expect(contractControlAPI.reconcile).toHaveBeenLastCalledWith('created', { operation_ids: ['op'], justification: null })
  })
  it('permite abrir o processo criado quando a conciliação permanece pendente', async () => {
    contractControlAPI.reconcile.mockRejectedValue(new Error('Conciliação pendente'))
    mount(); await choose(); number()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e conciliar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir processo salvo' }))
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: 'created' }), { pending: true })
    expect(paymentProcessesAPI.create).toHaveBeenCalledTimes(1)
  })
  it('interrompe repetição de criação se a conexão cai sem confirmar a resposta', async () => {
    paymentProcessesAPI.create.mockRejectedValue(Object.assign(new Error('Conexão interrompida'), { code: 'ERR_NETWORK' }))
    mount(); await choose(); number()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e conciliar' }))
    expect(await screen.findByText(/Confira a fila de processos antes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar e conciliar' })).toBeDisabled()
    expect(paymentProcessesAPI.create).toHaveBeenCalledTimes(1)
  })
  it('preserva o rascunho e evita repetir criação após HTTP 500 sem atribuir a falha à conexão', async () => {
    paymentProcessesAPI.create.mockRejectedValue({ response: { status: 500, data: { detail: 'Erro interno do servidor (referência: teste)' } } })
    mount(); await choose(); number('1234')
    fireEvent.change(screen.getByLabelText('Número da NF'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e conciliar' }))
    expect(await screen.findByText(/Não foi possível confirmar a criação/)).toBeInTheDocument()
    expect(screen.getByLabelText('Número do processo')).toHaveValue('1234')
    expect(screen.getByLabelText('Número da NF')).toHaveValue('1234')
    expect(screen.getByRole('button', { name: 'Salvar e conciliar' })).toBeDisabled()
    expect(paymentProcessesAPI.create).toHaveBeenCalledTimes(1)
    expect(contractControlAPI.reconcile).not.toHaveBeenCalled()
  })
  it('não sobrepõe a secretaria com aproximação de nome quando falta acesso à origem', async () => {
    fuelSuppliesAPI.getById.mockRejectedValue({ response: { status: 403 } })
    mount(); await choose()
    expect(screen.getByLabelText('Secretaria')).toHaveValue('')
    expect(screen.getByRole('status')).toHaveTextContent('Alguns detalhes de origem não estão acessíveis')
    expect(screen.getByLabelText('Valor da fatura (R$)')).toHaveValue('R$ 183,00')
  })
  it('descarta operações e valores sugeridos ao trocar de contrato', async () => {
    mount()
    fireEvent.click(await screen.findByRole('checkbox', { name: /TST0001/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Contrato da fatura'), { target: { value: 'm' } })
    await waitFor(() => expect(contractControlAPI.operations).toHaveBeenLastCalledWith('m', expect.objectContaining({ unbilled: true })))
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /TST0001/ })).not.toBeChecked()
  })
  it('mantém cadastro manual sem conciliar ou inventar pagamento', async () => {
    contractControlAPI.config.mockResolvedValue({ data: { enabled: false } })
    mount()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' })); number()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar processo' }))
    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(contractControlAPI.operations).not.toHaveBeenCalled()
    expect(contractControlAPI.reconcile).not.toHaveBeenCalled()
    expect(paymentProcessesAPI.create).toHaveBeenCalledWith(expect.objectContaining({ amount: null, paid_at: null, stage: 'ASSEMBLY' }))
  })
  it('edita datas existentes e permite limpar campos, sem refazer conciliação ou etapa', async () => {
    mount({ record: { id: 'existing', process_number: 'EX-01', contract_id: 'c', supplier_id: 'company', kind: 'FUEL', amount: '100', unit_name: 'Unidade original', commitment_date: '2026-10-01', stage: 'PAID' } })
    await screen.findByRole('button', { name: 'Salvar processo' })
    fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar processo' }))
    await waitFor(() => expect(paymentProcessesAPI.update).toHaveBeenCalled())
    const payload = paymentProcessesAPI.update.mock.calls[0][1]
    expect(payload).toMatchObject({ unit_name: null, amount: '100', commitment_date: '2026-10-01' })
    expect(payload).not.toHaveProperty('stage')
    expect(payload).not.toHaveProperty('references')
    expect(contractControlAPI.reconcile).not.toHaveBeenCalled()
  })
  it('não fecha enquanto salva e ignora cliques repetidos no envio', async () => {
    let resolve
    paymentProcessesAPI.create.mockReturnValue(new Promise((done) => { resolve = done }))
    mount(); await choose(); number()
    const form = screen.getByLabelText('Número do processo').closest('form')
    fireEvent.submit(form); fireEvent.submit(form)
    await waitFor(() => expect(paymentProcessesAPI.create).toHaveBeenCalledTimes(1))
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Fechar', exact: true })).not.toBeInTheDocument()
    await act(async () => resolve({ data: { id: 'created' } }))
    await waitFor(() => expect(saved).toHaveBeenCalled())
  })
})
