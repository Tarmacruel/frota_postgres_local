import { MemoryRouter } from 'react-router-dom'
import '../test/mockJustificationSuggestions'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import PaymentProcessesPage from './PaymentProcessesPage'
import { paymentProcessesAPI } from '../api/paymentProcesses'

const access = vi.hoisted(() => ({ edit: true, remove: true }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator', role: 'ADMIN' }, canEdit: () => access.edit, canDeleteModule: () => access.remove }) }))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [] }) }))
vi.mock('../api/paymentProcesses', () => ({
  paymentProcessesAPI: { list: vi.fn(), dashboard: vi.fn(), getById: vi.fn(), remove: vi.fn(), listAllForReport: vi.fn() },
  paymentSuppliersAPI: { list: async () => ({ data: [] }) },
  paymentContractsAPI: { options: async () => ({ data: [] }) },
}))
beforeEach(() => {
  vi.resetAllMocks()
  access.edit = true; access.remove = true
  const record = { id: 'payment', process_number: 'QA-001', kind: 'MANUTENCAO', stage: 'ABERTURA', amount: 100, alerts: [], checklist: [], references: [], stage_events: [] }
  paymentProcessesAPI.list.mockResolvedValue({ data: { data: [record], pagination: { page: 1, pages: 1, total: 1 } } })
  paymentProcessesAPI.dashboard.mockResolvedValue({ data: null })
  paymentProcessesAPI.getById.mockResolvedValue({ data: record })
  paymentProcessesAPI.remove.mockResolvedValue({})
})

it('sugere motivo de exclusão sem excluir até a confirmação obrigatória', async () => {
  render(<MemoryRouter><PaymentProcessesPage /></MemoryRouter>)
  fireEvent.click(await screen.findByText('QA-001'))
  fireEvent.click(await screen.findByRole('button', { name: 'Mais ações do processo', exact: true }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Excluir processo', exact: true }))
  const input = await screen.findByLabelText('Justificativa da exclusão')
  expect(input).toBeRequired()
  const modal = input.closest('[role="dialog"]')
  expect(within(modal).getByRole('button', { name: 'Excluir processo', exact: true })).toBeDisabled()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver modelos' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ver modelos' }))
  fireEvent.click(screen.getByRole('button', { name: 'Processo duplicado', exact: true }))
  expect(paymentProcessesAPI.remove).not.toHaveBeenCalled()
  fireEvent.click(within(modal).getByRole('button', { name: 'Excluir processo', exact: true }))
  await waitFor(() => expect(paymentProcessesAPI.remove).toHaveBeenCalledWith('payment', { reason: 'Exclusão de processo de pagamento cadastrado em duplicidade.' }))
})

it('mantém o detalhamento fechado quando a resposta dos alertas chega depois de fechar', async () => {
  let resolve
  paymentProcessesAPI.listAllForReport.mockReturnValue(new Promise((done) => { resolve = done }))
  render(<MemoryRouter><PaymentProcessesPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Alertas gerais da base:/ }))
  const dialog = screen.getByRole('dialog', { name: 'Alertas gerais dos processos' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar', exact: true }))
  await act(async () => resolve([{ id: 'alert', alerts: ['Pendência de teste'] }]))
  expect(screen.queryByRole('dialog', { name: 'Alertas gerais dos processos' })).not.toBeInTheDocument()
})

vi.mock('../api/contractControl', () => ({ contractControlAPI: { config: async () => ({ data: { enabled: false } }) }, maintenanceOrdersAPI: {} }))

it('mantém somente busca, etapa e contrato visíveis no modo embutido, preservando os filtros e ferramentas', async () => {
  render(<MemoryRouter><PaymentProcessesPage embedded initialContractId="contract" /></MemoryRouter>)
  await screen.findByText('QA-001')
  expect(screen.queryByRole('heading', { name: 'Faturas e pagamentos' })).not.toBeInTheDocument()
  expect(screen.getByRole('searchbox', { name: 'Busca' })).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Etapa' })).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Contrato' })).toBeVisible()
  expect(screen.getByLabelText('Tipo').closest('details')).not.toHaveAttribute('open')
  fireEvent.click(screen.getByText('Filtros', { exact: true }))
  expect(screen.getByRole('combobox', { name: 'Tipo' })).toBeVisible()
  fireEvent.click(screen.getByText('Ferramentas financeiras'))
  expect(screen.getByRole('button', { name: 'Importação', exact: true })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Gestão do contrato', exact: true })).toBeVisible()
})

it('abre um rascunho no contexto do serviço e consome o link ao fechar, sem gravar', async () => {
  const consumed = vi.fn()
  render(<MemoryRouter><PaymentProcessesPage embedded initialContractId="contract" initialOperationId="operation" onDraftConsumed={consumed} /></MemoryRouter>)
  const dialog = await screen.findByRole('dialog', { name: 'Novo processo de pagamento' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar', exact: true }))
  expect(consumed).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog', { name: 'Novo processo de pagamento' })).not.toBeInTheDocument()
})

it('fecha a edição com Escape e mantém o painel do processo e o foco da ação', async () => {
  render(<MemoryRouter><PaymentProcessesPage /></MemoryRouter>)
  fireEvent.click(await screen.findByText('QA-001'))
  const edit = await screen.findByRole('button', { name: 'Editar dados', exact: true })
  edit.focus(); fireEvent.click(edit)
  await screen.findByRole('dialog', { name: 'Editar processo' })
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar processo' })).not.toBeInTheDocument())
  expect(screen.getByRole('dialog', { name: 'QA-001' })).toBeInTheDocument()
  expect(edit).toHaveFocus()
})

it('preserva a permissão de excluir independente da permissão de editar', async () => {
  access.edit = false
  render(<MemoryRouter><PaymentProcessesPage /></MemoryRouter>)
  fireEvent.click(await screen.findByText('QA-001'))
  expect(screen.queryByRole('button', { name: 'Editar dados', exact: true })).not.toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: 'Mais ações do processo' }))
  expect(await screen.findByRole('menuitem', { name: 'Excluir processo' })).toBeEnabled()
})
