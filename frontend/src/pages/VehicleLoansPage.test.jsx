import { act, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
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
function NavigationProbe() {
  const location = useLocation(); const navigate = useNavigate()
  return <><output aria-label="URL atual">{location.search}</output><button onClick={() => navigate(-1)}>Voltar no navegador</button></>
}
function mount(entry = '/emprestimos') { return render(<MemoryRouter initialEntries={[entry]}><VehicleLoansPage /><NavigationProbe /></MemoryRouter>) }
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); auth.write = true; auth.user = { id: 'user', role: 'PRODUCAO', organization_id: 'origin' }
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
  await screen.findByRole('dialog', { name: 'Empréstimo ABC1234' })
  expect(screen.queryByRole('button', { name: 'Novo empréstimo' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Enviar para recebimento' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Regularizar empréstimo anterior' })).not.toBeInTheDocument()
})

it('Produção da recebedora vê recebimento no rodapé e rejeição em mais ações', async () => {
  auth.user = { id: 'receiver', role: 'PRODUCAO', organization_id: 'recipient' }
  vehicleLoansAPI.get.mockResolvedValue({ data: { ...loan, status: 'AWAITING_RECEIPT', submitted_by_user_id: 'sender' } })
  mount('/emprestimos?id=one')
  const accept = await screen.findByRole('button', { name: 'Confirmar recebimento' })
  expect(accept).toBeEnabled()
  expect(accept.closest('footer')).toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Mais ações do empréstimo de ABC1234' }))
  expect(screen.getByRole('menuitem', { name: 'Rejeitar proposta' })).toBeEnabled()
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

it('oferece nova consulta após falha mantendo o filtro de situação', async () => {
  const actor = userEvent.setup(); mount()
  await screen.findByRole('button', { name: 'Ver empréstimo de ABC1234' })
  vehicleLoansAPI.list.mockRejectedValueOnce(new Error('Conexão indisponível'))
  await actor.selectOptions(screen.getByLabelText('Situação'), 'ACTIVE')
  expect(await screen.findByRole('alert')).toHaveTextContent('atualizar a consulta')
  await actor.click(screen.getByRole('button', { name: 'Tentar consultar empréstimos novamente' }))
  await screen.findByRole('button', { name: 'Ver empréstimo de ABC1234' })
  expect(screen.getByLabelText('Situação')).toHaveValue('ACTIVE')
  expect(vehicleLoansAPI.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ACTIVE' }))
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
  await screen.findByRole('dialog', { name: 'Empréstimo ABC1234' })
  const thumbnails = screen.getAllByRole('img', { name: /Miniatura ilustrativa de Motocicleta ABC1234/ })
  expect(thumbnails).toHaveLength(2)
  thumbnails.forEach((image) => expect(image).toHaveAttribute('src', '/vehicle-thumbnails/motorcycle.svg'))
})


it('fecha o painel preservando busca, situação, página, query e foco da lista', async () => {
  const actor = userEvent.setup()
  vehicleLoansAPI.list.mockResolvedValue({ data: { data: [loan], pagination: { pages: 3, total: 50 } } })
  mount('/emprestimos?indicator=active&source=dashboard')
  await actor.selectOptions(screen.getByLabelText('Situação'), 'ACTIVE')
  await actor.type(screen.getByLabelText('Placa'), 'ABC1234')
  await actor.click(screen.getByRole('button', { name: 'Buscar' }))
  await actor.click(await screen.findByRole('button', { name: 'Página 2' }))
  const trigger = await screen.findByRole('button', { name: 'Ver empréstimo de ABC1234' })
  const listCalls = vehicleLoansAPI.list.mock.calls.length
  await actor.click(trigger)
  expect(await screen.findByRole('dialog', { name: 'Empréstimo ABC1234' })).toBeInTheDocument()
  expect(screen.getByLabelText('URL atual')).toHaveTextContent('indicator=active&source=dashboard&id=one')
  await actor.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.getByLabelText('URL atual')).toHaveTextContent('?indicator=active&source=dashboard')
  expect(screen.getByLabelText('Situação')).toHaveValue('ACTIVE')
  expect(screen.getByLabelText('Placa')).toHaveValue('ABC1234')
  expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page')
  expect(vehicleLoansAPI.list).toHaveBeenCalledTimes(listCalls)
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'auto' })
})

it('voltar no navegador fecha o detalhe aberto a partir da lista', async () => {
  const actor = userEvent.setup(); mount()
  await actor.click(await screen.findByRole('button', { name: 'Ver empréstimo de ABC1234' }))
  await screen.findByRole('dialog', { name: 'Empréstimo ABC1234' })
  await actor.click(screen.getByRole('button', { name: 'Voltar no navegador' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByLabelText('URL atual')).toBeEmptyDOMElement()
})

it('ao fechar um link direto devolve o foco à lista e preserva os parâmetros', async () => {
  const actor = userEvent.setup(); mount('/emprestimos?id=one&source=alert')
  const dialog = await screen.findByRole('dialog', { name: 'Empréstimo ABC1234' })
  await actor.click(within(dialog).getByRole('button', { name: 'Fechar', exact: true }))
  await waitFor(() => expect(screen.getByRole('region', { name: 'Lista de empréstimos' })).toHaveFocus())
  expect(screen.getByLabelText('URL atual')).toHaveTextContent('?source=alert')
})

it('abre a edição sobre o painel e Escape fecha somente o formulário', async () => {
  const actor = userEvent.setup(); mount('/emprestimos?id=one')
  await actor.click(await screen.findByRole('button', { name: 'Mais ações do empréstimo de ABC1234' }))
  await actor.click(screen.getByRole('menuitem', { name: 'Editar proposta' }))
  expect(screen.getAllByRole('dialog')).toHaveLength(2)
  await actor.keyboard('{Escape}')
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.getByRole('dialog', { name: 'Empréstimo ABC1234' })).toBeInTheDocument()
  expect(screen.getByLabelText('URL atual')).toHaveTextContent('id=one')
})

it('conserva somente a consulta atual ao fechar durante carregamento', async () => {
  const actor = userEvent.setup(); let resolve
  vehicleLoansAPI.get.mockImplementation(() => new Promise((done) => { resolve = done }))
  mount('/emprestimos?id=one')
  expect(await screen.findByText('Carregando dados, pendências e histórico…')).toBeInTheDocument()
  await actor.keyboard('{Escape}')
  await act(async () => { resolve({ data: loan }) })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByText('Atividades de campo')).not.toBeInTheDocument()
})

it('mantém o foco dentro do painel quando a consulta termina de carregar', async () => {
  let resolve
  vehicleLoansAPI.get.mockImplementation(() => new Promise((done) => { resolve = done }))
  mount('/emprestimos?id=one')
  const dialog = await screen.findByRole('dialog', { name: 'Detalhes do empréstimo' })
  await waitFor(() => expect(dialog).toContainElement(document.activeElement))
  await act(async () => { resolve({ data: loan }) })
  expect(await screen.findByRole('dialog', { name: 'Empréstimo ABC1234' })).toContainElement(document.activeElement)
})
