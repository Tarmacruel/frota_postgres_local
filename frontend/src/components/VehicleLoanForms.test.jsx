import '../test/mockJustificationSuggestions'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoanActionForm, LoanProposalForm } from './VehicleLoanForms'
import { vehicleLoansAPI } from '../api/vehicleLoans'
import { availableLoanActions, blockedLoanAction, loanActions } from '../utils/vehicleLoans'


vi.mock('../api/vehicleLoans', () => ({ vehicleLoansAPI: { create: vi.fn(), update: vi.fn(), act: vi.fn() } }))
const user = { id: 'sender', role: 'PRODUCAO', organization_id: 'origin' }
const catalog = {
  vehicles: [{ id: 'vehicle', plate: 'ABC1234', owner_organization_id: 'origin' }],
  organizations: [{ id: 'origin', name: 'Saúde' }, { id: 'recipient', name: 'Educação' }],
  allocations: [{ id: 'destination', name: 'Escola central', organization_id: 'recipient' }, { id: 'home', name: 'Garagem Saúde', organization_id: 'origin' }],
}
const loan = { id: 'loan', vehicle_id: 'vehicle', vehicle_plate: 'ABC1234', version: 3, status: 'DRAFT',
  origin_organization_id: 'origin', recipient_organization_id: 'recipient', origin_organization_name: 'Saúde', recipient_organization_name: 'Educação',
  destination_allocation_id: 'destination', origin_allocation_id: 'home', reason: 'Atender atividades de campo', delivery_odometer_km: '0', delivery_condition: 'Sem avarias', submitted_by_user_id: user.id }
const context = { version: 3, minimum_odometer_km: '123.4', blockers: { open_possessions: 0, open_trips: 0, open_fuel_orders: 0 } }

beforeEach(() => { vi.resetAllMocks(); vehicleLoansAPI.create.mockResolvedValue({ data: loan }); vehicleLoansAPI.update.mockResolvedValue({ data: loan }); vehicleLoansAPI.act.mockResolvedValue({ data: loan }) })

describe('Proposta e ações de empréstimo', () => {
  it('filtra veículos ao digitar e limpa a lotação ao trocar a recebedora', async () => {
    const actor = userEvent.setup()
    const searchableCatalog = { ...catalog,
      vehicles: [...catalog.vehicles, { id: 'other', plate: 'XYZ9876', brand: 'Fiat', model: 'Uno', owner_organization_id: 'origin' }],
      organizations: [...catalog.organizations, { id: 'third', name: 'Segurança' }],
    }
    render(<LoanProposalForm catalog={searchableCatalog} user={user} onSaved={vi.fn()} />)
    await actor.click(screen.getByRole('button', { name: 'Veículo' }))
    await actor.type(screen.getByPlaceholderText('Buscar por placa, marca ou modelo'), 'uno')
    expect(screen.queryByRole('button', { name: 'ABC1234' })).not.toBeInTheDocument()
    await actor.click(screen.getByRole('button', { name: 'XYZ9876 · Fiat · Uno' }))
    await actor.click(screen.getByRole('button', { name: 'Secretaria recebedora' }))
    await actor.type(screen.getByPlaceholderText('Buscar secretaria'), 'Educa')
    expect(screen.queryByRole('button', { name: 'Segurança' })).not.toBeInTheDocument()
    await actor.click(screen.getByRole('button', { name: 'Educação' }))
    await actor.click(screen.getByRole('button', { name: 'Lotação de destino' }))
    await actor.type(screen.getByPlaceholderText('Buscar lotação de destino'), 'inexistente')
    expect(screen.getByText('Nenhum resultado encontrado.')).toBeInTheDocument()
    await actor.clear(screen.getByPlaceholderText('Buscar lotação de destino'))
    await actor.click(screen.getByRole('button', { name: 'Escola central' }))
    await actor.click(screen.getByRole('button', { name: 'Secretaria recebedora' }))
    await actor.click(screen.getByRole('button', { name: 'Segurança' }))
    expect(screen.getByRole('button', { name: 'Lotação de destino' })).toHaveTextContent('Selecione a lotação de destino')
    await actor.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText(/Selecione a secretaria recebedora e uma lotação/)).toBeVisible()
    expect(vehicleLoansAPI.create).not.toHaveBeenCalled()
  })

  it('salva rascunho indeterminado com odômetro zero e secretaria de origem derivada', async () => {
    const actor = userEvent.setup(); const saved = vi.fn()
    render(<LoanProposalForm catalog={catalog} user={user} onSaved={saved} onClose={vi.fn()} />)
    await actor.click(screen.getByRole('button', { name: 'Veículo' }))
    await actor.click(screen.getByRole('button', { name: 'ABC1234' }))
    await actor.click(screen.getByRole('button', { name: 'Secretaria recebedora' }))
    await actor.click(screen.getByRole('button', { name: 'Educação' }))
    await actor.click(screen.getByRole('button', { name: 'Lotação de destino' }))
    await actor.click(screen.getByRole('button', { name: 'Escola central' }))
    await actor.click(screen.getByRole('button', { name: 'Continuar' }))
    await actor.type(screen.getByLabelText('Motivo do empréstimo'), 'Atender atividades de campo')
    await actor.type(screen.getByLabelText('Odômetro de entrega (km)'), '0')
    await actor.click(screen.getByRole('button', { name: 'Continuar' }))
    await actor.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(vehicleLoansAPI.create).toHaveBeenCalledWith(expect.objectContaining({ acting_organization_id: 'origin', expected_return_at: null, delivery_odometer_km: '0', vehicle_id: 'vehicle' }))
    expect(saved).toHaveBeenCalled()
  })

  it('superusuário precisa justificar a secretaria representada', async () => {
    const actor = userEvent.setup()
    render(<LoanProposalForm loan={loan} catalog={catalog} user={{ ...user, role: 'SUPERUSER' }} onSaved={vi.fn()} />)
    await actor.click(screen.getByRole('button', { name: 'Continuar' }))
    await actor.click(screen.getByRole('button', { name: 'Continuar' }))
    await actor.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(vehicleLoansAPI.update).not.toHaveBeenCalled()
    await actor.click(screen.getByRole('button', { name: 'Ver modelos', exact: true }))
    await actor.click(screen.getByRole('button', { name: 'Dados de entrega', exact: true }))
    expect(screen.getByLabelText('Justificativa (obrigatória)').value).toContain('Retificação do odômetro')
    expect(vehicleLoansAPI.update).not.toHaveBeenCalled()
    await actor.clear(screen.getByLabelText('Justificativa (obrigatória)'))
    await actor.type(screen.getByLabelText('Justificativa (obrigatória)'), 'Representação autorizada para teste')
    await actor.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(vehicleLoansAPI.update).toHaveBeenCalledWith('loan', expect.objectContaining({ expected_version: 3, acting_organization_id: 'origin', justification: 'Representação autorizada para teste' }))
  })

  it('preserva edição em conflito e não repete a requisição com versão antiga', async () => {
    const actor = userEvent.setup(); const refresh = vi.fn()
    vehicleLoansAPI.update.mockRejectedValue({ response: { status: 409, data: { detail: { message: 'A proposta foi alterada.' } } } })
    render(<LoanProposalForm loan={loan} catalog={catalog} user={user} onRefresh={refresh} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Etapa 1: Destino' })).toHaveFocus())
    await actor.click(screen.getByRole('button', { name: 'Continuar' }))
    await actor.type(screen.getByLabelText('Condições de entrega'), ' Revisado')
    await actor.click(screen.getByRole('button', { name: 'Continuar' }))
    await actor.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A proposta foi alterada.')
    expect(screen.getByLabelText('Condições de entrega')).toHaveValue('Sem avarias Revisado')
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled()
    await actor.click(screen.getByRole('button', { name: 'Recarregar dados e revisar' }))
    expect(refresh).toHaveBeenCalledOnce(); expect(vehicleLoansAPI.update).toHaveBeenCalledOnce()
  })

  it('solicita devolução com lotação da origem, odômetro editado e condições', async () => {
    const actor = userEvent.setup()
    render(<LoanActionForm operation="request-return" loan={{ ...loan, status: 'ACTIVE' }} context={context} catalog={catalog} user={{ ...user, organization_id: 'recipient' }} onSaved={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Etapa 1: Dados da ação' })).toHaveFocus())
    expect(screen.getByLabelText('Odômetro de devolução (km)')).toHaveValue(123.4)
    await actor.clear(screen.getByLabelText('Odômetro de devolução (km)'))
    await actor.type(screen.getByLabelText('Odômetro de devolução (km)'), '150')
    await actor.type(screen.getByLabelText('Condições de devolução'), 'Sem avarias na devolução')
    await actor.click(screen.getByRole('button', { name: 'Solicitar devolução' }))
    expect(vehicleLoansAPI.act).toHaveBeenCalledWith('loan', 'request-return', expect.objectContaining({ expected_version: 3, acting_organization_id: 'recipient', return_allocation_id: 'home', return_odometer_km: '150' }))
  })

  it('impede submissões duplicadas enquanto a ação está carregando', async () => {
    const actor = userEvent.setup(); let resolve
    vehicleLoansAPI.act.mockReturnValue(new Promise((done) => { resolve = done }))
    render(<LoanActionForm operation="submit" loan={loan} context={context} catalog={catalog} user={user} onSaved={vi.fn()} />)
    await actor.dblClick(screen.getByRole('button', { name: 'Enviar para recebimento' }))
    expect(vehicleLoansAPI.act).toHaveBeenCalledOnce()
    resolve({ data: loan }); await waitFor(() => expect(screen.queryByText('Processando…')).not.toBeInTheDocument())
  })

  it('rejeição exige justificativa e erro de rede preserva o texto para tentativa consciente', async () => {
    const actor = userEvent.setup()
    vehicleLoansAPI.act.mockRejectedValue(new Error('Conexão indisponível'))
    render(<LoanActionForm operation="reject" loan={{ ...loan, status: 'AWAITING_RECEIPT' }} context={context} catalog={catalog} user={{ ...user, organization_id: 'recipient' }} />)
    await actor.click(screen.getByRole('button', { name: 'Rejeitar proposta' }))
    expect(vehicleLoansAPI.act).not.toHaveBeenCalled()
    await actor.type(screen.getByLabelText('Justificativa (obrigatória)'), 'Veículo não atende à necessidade')
    await actor.click(screen.getByRole('button', { name: 'Rejeitar proposta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Conexão indisponível')
    expect(screen.getByLabelText('Justificativa (obrigatória)')).toHaveValue('Veículo não atende à necessidade')
  })
})

describe('Ações por secretaria e situação', () => {
  it('oferece somente as ações da parte representada', () => {
    expect(availableLoanActions(user, { ...loan, status: 'ACTIVE' })).toEqual([])
    expect(availableLoanActions({ ...user, organization_id: 'recipient' }, { ...loan, status: 'ACTIVE' }).map(([name]) => name)).toEqual(['request-return'])
    expect(availableLoanActions(user, { ...loan, status: 'RETURNED' })).toEqual([])
  })
  it('proíbe autoaceite inclusive pelo administrador', () => {
    expect(blockedLoanAction({ ...user, role: 'SUPERUSER' }, loan, loanActions.accept, context)).toMatch('Outro usuário')
  })
  it('bloqueia transições sem contexto, com pendências ou contexto de outra versão', () => {
    expect(blockedLoanAction(user, loan, loanActions.submit, null)).toMatch('Atualize')
    expect(blockedLoanAction(user, loan, loanActions.submit, { ...context, blockers: { open_trips: 1 } })).toMatch('pendências')
    expect(blockedLoanAction(user, loan, loanActions.submit, { ...context, version: 4 })).toMatch('mudou')
    expect(blockedLoanAction(user, loan, loanActions.cancel, context)).toBe('')
  })
})

it('orienta o primeiro campo e impede pular etapas incompletas sem gravar', async () => {
  const actor = userEvent.setup()
  render(<LoanProposalForm catalog={catalog} user={user} onSaved={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Etapa 1: Destino' })).toHaveFocus())
  await actor.click(screen.getByRole('button', { name: 'Etapa 3: Conferência' }))
  expect(screen.getByRole('button', { name: 'Veículo' })).toHaveFocus()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  expect(screen.getByRole('alert')).toHaveTextContent('Revise os campos destacados')
  await actor.click(screen.getByRole('button', { name: 'Rever destino' }))
  expect(screen.getByRole('heading', { name: 'Quem vai receber o veículo?' })).toBeVisible()
  expect(vehicleLoansAPI.create).not.toHaveBeenCalled()
})

it('mantém dados ao navegar por etapas e só salva o rascunho na conferência', async () => {
  const actor = userEvent.setup()
  render(<LoanProposalForm loan={{ ...loan, delivery_odometer_km: '', delivery_condition: '' }} catalog={catalog} user={user} onSaved={vi.fn()} />)
  await actor.click(screen.getByRole('button', { name: 'Continuar' }))
  await actor.type(screen.getByLabelText('Motivo do empréstimo'), ' revisado')
  await actor.click(screen.getByRole('button', { name: 'Voltar' }))
  expect(screen.getByRole('button', { name: 'Secretaria recebedora' })).toHaveTextContent('Educação')
  await actor.click(screen.getByRole('button', { name: 'Etapa 3: Conferência' }))
  expect(within(screen.getByRole('region', { name: 'Confira o rascunho' })).getByText('Atender atividades de campo revisado')).toBeVisible()
  expect(vehicleLoansAPI.update).not.toHaveBeenCalled()
  await actor.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
  expect(vehicleLoansAPI.update).toHaveBeenCalledWith('loan', expect.objectContaining({ delivery_odometer_km: null, delivery_condition: null }))
})

it('mostra precisão inválida junto ao odômetro e não apresenta a etapa como preenchida', async () => {
  const actor = userEvent.setup()
  render(<LoanProposalForm loan={loan} catalog={catalog} user={user} />)
  await actor.click(screen.getByRole('button', { name: 'Continuar' }))
  fireEvent.change(screen.getByLabelText('Odômetro de entrega (km)'), { target: { value: '1.25' } })
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  await actor.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(screen.getByLabelText('Odômetro de entrega (km)')).toHaveFocus()
  expect(screen.getByLabelText('Odômetro de entrega (km)')).toHaveAttribute('aria-invalid', 'true')
  expect(vehicleLoansAPI.update).not.toHaveBeenCalled()
})

it('explica as operações abertas e oferece apenas os caminhos autorizados', () => {
  render(<LoanActionForm operation="submit" loan={loan} context={{ ...context, blockers: { open_possessions: 1 } }} catalog={catalog} user={user}
    canView={(module) => module === 'possession'} />)
  expect(screen.getByRole('alert')).toHaveTextContent('As rotas ficam no menu da posse')
  expect(screen.getByRole('link', { name: /Consultar posses e rotas/ })).toHaveAttribute('href', '/posses?vehicle_id=vehicle')
  expect(screen.queryByRole('link', { name: /Consultar ordens/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enviar para recebimento' })).toBeDisabled()
  expect(vehicleLoansAPI.act).not.toHaveBeenCalled()
})

it('erro de dados de entrega oferece edição sem repetir a transição', async () => {
  const actor = userEvent.setup(); const edit = vi.fn()
  vehicleLoansAPI.act.mockRejectedValue({ response: { status: 422, data: { detail: 'Informe o odômetro e as condições de entrega' } } })
  render(<LoanActionForm operation="submit" loan={loan} context={context} catalog={catalog} user={user} onEdit={edit} />)
  await actor.click(screen.getByRole('button', { name: 'Enviar para recebimento' }))
  await actor.click(await screen.findByRole('button', { name: 'Editar dados de entrega' }))
  expect(edit).toHaveBeenCalledOnce()
  expect(vehicleLoansAPI.act).toHaveBeenCalledOnce()
})
