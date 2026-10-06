import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import VehicleLoansPage from './VehicleLoansPage'
import { vehicleLoansAPI } from '../api/vehicleLoans'
vi.mock('../components/VehicleLoanDocuments', () => ({ default: () => <div>Termos e assinaturas</div> }))

const auth = vi.hoisted(() => ({ user: { id: 'user', role: 'PRODUCAO', organization_id: 'origin' }, write: true }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, canCreate: () => auth.write, canEdit: () => auth.write, canView: () => true }) }))
vi.mock('../api/vehicleLoans', () => ({ vehicleLoansAPI: { list: vi.fn(), catalog: vi.fn(), get: vi.fn(), context: vi.fn(), events: vi.fn() } }))
const loan = { id: 'one', vehicle_id: 'vehicle', vehicle_plate: 'ABC1234', version: 1, status: 'DRAFT',
  vehicle_type: 'MOTOCICLETA',
  origin_organization_id: 'origin', recipient_organization_id: 'recipient', origin_organization_name: 'Saúde', recipient_organization_name: 'Educação', reason: 'Atividades de campo' }
const context = { version: 1, minimum_odometer_km: '0', blockers: { open_possessions: 0, open_trips: 0, open_fuel_orders: 0 } }
function mount(entry = '/emprestimos') { return render(<MemoryRouter initialEntries={[entry]}><VehicleLoansPage /></MemoryRouter>) }
beforeEach(() => {
  vi.resetAllMocks(); auth.write = true; auth.user = { id: 'user', role: 'PRODUCAO', organization_id: 'origin' }
  vehicleLoansAPI.catalog.mockResolvedValue({ data: { vehicles: [], allocations: [], organizations: [] } })
  vehicleLoansAPI.list.mockResolvedValue({ data: { data: [loan], pagination: { pages: 1, total: 1 } } })
  vehicleLoansAPI.get.mockResolvedValue({ data: loan })
  vehicleLoansAPI.context.mockResolvedValue({ data: context })
  vehicleLoansAPI.events.mockResolvedValue({ data: [] })
})

it('carrega detalhe e oferece envio e edição apenas para a origem', async () => {
  const actor = userEvent.setup()
  mount('/emprestimos?id=one')
  expect(await screen.findByRole('button', { name: 'Enviar para recebimento' })).toBeEnabled()
  await actor.click(screen.getByRole('button', { name: 'Mais ações do empréstimo de ABC1234' }))
  expect(screen.getByRole('menuitem', { name: 'Editar proposta' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Confirmar recebimento' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Consultar posses do veículo' })).toHaveAttribute('href', '/posses?vehicle_id=vehicle')
})

it('permissão somente consulta não mostra ações de escrita', async () => {
  auth.write = false
  mount('/emprestimos?id=one')
  await screen.findByText('Histórico de ações')
  expect(screen.queryByRole('button', { name: 'Novo empréstimo' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Enviar para recebimento' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Regularizar empréstimo anterior' })).not.toBeInTheDocument()
})

it('Produção da recebedora vê recebimento e rejeição no início do detalhe', async () => {
  auth.user = { id: 'receiver', role: 'PRODUCAO', organization_id: 'recipient' }
  vehicleLoansAPI.get.mockResolvedValue({ data: { ...loan, status: 'AWAITING_RECEIPT', submitted_by_user_id: 'sender' } })
  mount('/emprestimos?id=one')
  const accept = await screen.findByRole('button', { name: 'Confirmar recebimento' })
  expect(accept).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Rejeitar proposta' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Mais ações do empréstimo de ABC1234' })).not.toBeInTheDocument()
  expect(accept.compareDocumentPosition(screen.getByText('Lotação de origem')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('somente administrador com criação pode iniciar regularização', async () => {
  auth.user = { id: 'admin', role: 'ADMIN' }
  mount()
  expect(await screen.findByRole('button', { name: 'Regularizar empréstimo anterior' })).toBeEnabled()
})

it('falha ao consultar pendências impede ações e oferece nova consulta', async () => {
  vehicleLoansAPI.context.mockRejectedValue(new Error('Falha ao consultar pendências'))
  mount('/emprestimos?id=one')
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao consultar pendências')
  expect(screen.queryByRole('button', { name: 'Enviar para recebimento' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Recarregar detalhe' })).toBeInTheDocument()
})

it('ignora detalhes antigos após troca rápida de empréstimo', async () => {
  const actor = userEvent.setup(); let release
  vehicleLoansAPI.list.mockResolvedValue({ data: { data: [loan, { ...loan, id: 'two', vehicle_plate: 'XYZ9876' }], pagination: { pages: 1, total: 2 } } })
  vehicleLoansAPI.get.mockImplementation((id) => id === 'one' ? new Promise((resolve) => { release = resolve }) : Promise.resolve({ data: { ...loan, id: 'two', vehicle_plate: 'XYZ9876', reason: 'Segundo empréstimo' } }))
  mount('/emprestimos?id=one')
  await actor.click(await screen.findByRole('button', { name: 'Ver empréstimo de XYZ9876' }))
  await screen.findByText('Segundo empréstimo')
  release({ data: loan })
  await waitFor(() => expect(screen.queryByText('Atividades de campo')).not.toBeInTheDocument())
  expect(screen.getByText('Segundo empréstimo')).toBeInTheDocument()
})

it('filtra arquivo de devolvidos e busca placa no servidor', async () => {
  const actor = userEvent.setup(); mount()
  await actor.selectOptions(screen.getByLabelText('Situação'), 'RETURNED')
  await actor.type(screen.getByLabelText('Placa'), 'ABC1234')
  await actor.click(screen.getByRole('button', { name: 'Buscar' }))
  await waitFor(() => expect(vehicleLoansAPI.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'RETURNED', search: 'ABC1234', page: 1 })))
})

it('dados de contexto de outra versão bloqueiam envio até atualização', async () => {
  vehicleLoansAPI.context.mockResolvedValue({ data: { ...context, version: 2 } })
  mount('/emprestimos?id=one')
  expect(await screen.findByRole('alert')).toHaveTextContent('mudou durante a consulta')
  expect(screen.getByRole('button', { name: 'Enviar para recebimento' })).toBeDisabled()
})

it('usa o tipo do registro na lista e no detalhe mesmo sem veículo no catálogo', async () => {
  auth.write = false
  mount('/emprestimos?id=one')
  await screen.findByText('Histórico de ações')
  const thumbnails = screen.getAllByRole('img', { name: /Miniatura ilustrativa de Motocicleta ABC1234/ })
  expect(thumbnails).toHaveLength(2)
  thumbnails.forEach((image) => expect(image).toHaveAttribute('src', '/vehicle-thumbnails/motorcycle.svg'))
})
