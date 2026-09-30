import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import VehicleLoanDocuments from './VehicleLoanDocuments'
import { vehicleLoansAPI } from '../api/vehicleLoans'
import { documentSignaturesAPI } from '../api/documentSignatures'

const auth = vi.hoisted(() => ({ user: { id: 'sender', role: 'PRODUCAO', organization_id: 'origin' }, edit: true }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, canEdit: () => auth.edit }) }))
vi.mock('../api/vehicleLoans', () => ({ vehicleLoansAPI: { documents: vi.fn(), downloadTerm: vi.fn() } }))
vi.mock('../api/documentSignatures', () => ({ documentSignaturesAPI: { sign: vi.fn(), downloadArtifact: vi.fn() } }))
const term = { document_id: 'term', title: 'Termo de empréstimo entre secretarias', status: 'PENDING', signed_count: 0,
  signatures: [], canonical_artifact_available: true, snapshot: { representatives: [
    { user_id: 'sender', name: 'Maria', role: 'Entregante', organization_id: 'origin', organization_name: 'Saúde' },
    { user_id: 'receiver', name: 'José', role: 'Recebedor', organization_id: 'recipient', organization_name: 'Educação' },
  ] } }

beforeEach(() => {
  vi.resetAllMocks()
  auth.user = { id: 'sender', role: 'PRODUCAO', organization_id: 'origin' }; auth.edit = true
  vehicleLoansAPI.documents.mockResolvedValue({ data: [term] })
  vehicleLoansAPI.downloadTerm.mockResolvedValue({ data: new Blob(['pdf']) })
  documentSignaturesAPI.downloadArtifact.mockResolvedValue({ data: new Blob(['pdf']) })
  URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

it('requires reviewing download, preserves original and signs with entered password only once', async () => {
  const actor = userEvent.setup(); let finish
  documentSignaturesAPI.sign.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  render(<VehicleLoanDocuments loanId="loan" />)
  const password = await screen.findByLabelText('Sua senha atual')
  await actor.type(password, 'password-123')
  expect(screen.getByRole('button', { name: 'Assinar termo com senha' })).toBeDisabled()
  await actor.click(screen.getByRole('button', { name: 'Baixar PDF original preservado' }))
  expect(documentSignaturesAPI.downloadArtifact).toHaveBeenCalledWith('term', 'canonical')
  expect(screen.getByRole('button', { name: 'Assinar termo com senha' })).toBeDisabled()
  await actor.click(screen.getByRole('button', { name: 'Baixar termo e evidências' }))
  const form = password.closest('form')
  fireEvent.submit(form); fireEvent.submit(form)
  expect(documentSignaturesAPI.sign).toHaveBeenCalledTimes(1)
  expect(documentSignaturesAPI.sign).toHaveBeenCalledWith('term', { current_password: 'password-123' })
  finish({ data: { ...term, signed_count: 1, signatures: [{ signer_user_id: 'sender' }] } })
  await waitFor(() => expect(screen.queryByLabelText('Sua senha atual')).not.toBeInTheDocument())
  expect(screen.getByText(/1\/2 assinaturas/)).toBeInTheDocument()
})

it('shows both terms and allows read-only download without offering signature', async () => {
  auth.edit = false
  vehicleLoansAPI.documents.mockResolvedValue({ data: [term, { ...term, document_id: 'return', title: 'Termo de devolução entre secretarias', status: 'COMPLETED', is_complete: true, signed_count: 2 }] })
  render(<VehicleLoanDocuments loanId="loan" />)
  await screen.findByText('Termo de devolução entre secretarias')
  expect(screen.getAllByRole('button', { name: 'Baixar termo e evidências' })).toHaveLength(2)
  expect(screen.queryByLabelText('Sua senha atual')).not.toBeInTheDocument()
  expect(screen.getByText('Assinado pelos dois representantes')).toBeInTheDocument()
})

it('administrator who was not a representative cannot sign', async () => {
  auth.user = { id: 'other', role: 'ADMIN' }
  render(<VehicleLoanDocuments loanId="loan" />)
  await screen.findByText(term.title)
  expect(screen.queryByLabelText('Sua senha atual')).not.toBeInTheDocument()
})

it('download failure does not enable signing and failure to sign clears password', async () => {
  const actor = userEvent.setup()
  vehicleLoansAPI.downloadTerm.mockRejectedValueOnce(new Error('Falha de download'))
  documentSignaturesAPI.sign.mockRejectedValue(new Error('Senha incorreta'))
  render(<VehicleLoanDocuments loanId="loan" />)
  await actor.click(await screen.findByRole('button', { name: 'Baixar termo e evidências' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha de download')
  const password = screen.getByLabelText('Sua senha atual')
  await actor.type(password, 'password-123')
  expect(screen.getByRole('button', { name: 'Assinar termo com senha' })).toBeDisabled()
  await actor.click(screen.getByRole('button', { name: 'Baixar termo e evidências' }))
  await actor.click(screen.getByRole('button', { name: 'Assinar termo com senha' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Senha incorreta')
  expect(password).toHaveValue('')
})

it('ignores old responses when changing loans and offers retry after load failure', async () => {
  let finish
  vehicleLoansAPI.documents.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  vehicleLoansAPI.documents.mockRejectedValueOnce(new Error('Falha de consulta'))
  const mounted = render(<VehicleLoanDocuments loanId="old" />)
  mounted.rerender(<VehicleLoanDocuments loanId="new" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha de consulta')
  finish({ data: [term] })
  await waitFor(() => expect(screen.queryByText(term.title)).not.toBeInTheDocument())
  vehicleLoansAPI.documents.mockResolvedValue({ data: [] })
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar assinaturas' }))
  expect(await screen.findByText(/será emitido no aceite da entrega/)).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Termos e assinaturas' })).queryByRole('alert')).not.toBeInTheDocument()
})
