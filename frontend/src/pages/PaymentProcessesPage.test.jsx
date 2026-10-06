import '../test/mockJustificationSuggestions'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import PaymentProcessesPage from './PaymentProcessesPage'
import { paymentProcessesAPI } from '../api/paymentProcesses'

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator', role: 'ADMIN' }, canEdit: () => true, canDeleteModule: () => true }) }))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [] }) }))
vi.mock('../api/paymentProcesses', () => ({
  paymentProcessesAPI: { list: vi.fn(), dashboard: vi.fn(), getById: vi.fn(), remove: vi.fn() },
  paymentSuppliersAPI: { list: async () => ({ data: [] }) },
  paymentContractsAPI: { list: async () => ({ data: [] }) },
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
  render(<PaymentProcessesPage />)
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
