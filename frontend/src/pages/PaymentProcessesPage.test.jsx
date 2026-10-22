import { MemoryRouter } from 'react-router-dom'
import '../test/mockJustificationSuggestions'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import PaymentProcessesPage from './PaymentProcessesPage'
import { paymentProcessesAPI } from '../api/paymentProcesses'

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator', role: 'ADMIN' }, canEdit: () => true, canDeleteModule: () => true }) }))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [] }) }))
vi.mock('../api/paymentProcesses', () => ({
  paymentProcessesAPI: { list: vi.fn(), dashboard: vi.fn(), getById: vi.fn(), remove: vi.fn(), listAllForReport: vi.fn() },
  paymentSuppliersAPI: { list: async () => ({ data: [] }) },
  paymentContractsAPI: { options: async () => ({ data: [] }) },
}))
beforeEach(() => {
  vi.resetAllMocks()
  const record = { id: 'payment', process_number: 'QA-001', kind: 'MANUTENCAO', stage: 'ABERTURA', amount: 100, alerts: [], checklist: [], references: [], stage_events: [] }
  paymentProcessesAPI.list.mockResolvedValue({ data: { data: [record], pagination: { page: 1, pages: 1, total: 1 } } })
  paymentProcessesAPI.dashboard.mockResolvedValue({ data: null })
  paymentProcessesAPI.getById.mockResolvedValue({ data: record })
  paymentProcessesAPI.remove.mockResolvedValue({})
})

it('sugere motivo de exclusão sem excluir até a confirmação obrigatória', async () => {
  render(<MemoryRouter><PaymentProcessesPage /></MemoryRouter>)
  fireEvent.click(await screen.findByText('QA-001'))
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir processo', exact: true }))
  const input = screen.getByLabelText('Justificativa da exclusão')
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
