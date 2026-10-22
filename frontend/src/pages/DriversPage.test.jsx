import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { driversAPI } from '../api/drivers'
import DriversPage from './DriversPage'
import { MemoryRouter } from 'react-router-dom'

const permissions = vi.hoisted(() => ({ edit: true }))
vi.mock('../api/drivers', () => ({ driversAPI: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getById: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ canCreate: () => true, canEdit: () => permissions.edit, canDeleteModule: () => false }) }))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [{ id: 'org', name: 'Secretaria teste' }] }) }))
vi.mock('../utils/exportData', () => ({ exportRowsToXlsx: vi.fn(), previewRowsToPdf: vi.fn() }))
vi.mock('../components/SearchableSelect', () => ({ default: ({ onChange }) => <button type="button" onClick={() => onChange('org')}>Selecionar secretaria</button> }))

const driver = { id: 'driver', nome_completo: 'Condutor Teste', documento: '12345678900', organization_id: 'org', cnh_categoria: 'B', matricula: '000123', ativo: true }

beforeEach(() => {
  vi.resetAllMocks()
  permissions.edit = true
  driversAPI.list.mockResolvedValue({ data: { data: [driver], pagination: { page: 1, pages: 1, total: 1 } } })
  driversAPI.create.mockResolvedValue({ data: driver })
  driversAPI.update.mockResolvedValue({ data: driver })
  driversAPI.getById.mockResolvedValue({ data: driver })
})

function renderPage(path = '/condutores') {
  return render(<MemoryRouter initialEntries={[path]}><DriversPage /></MemoryRouter>)
}

it('exige matrícula no novo cadastro e preserva zeros à esquerda', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Condutor Teste')
  await user.click(screen.getByRole('button', { name: 'Novo condutor' }))
  const registration = screen.getByLabelText('Matrícula (obrigatória)')
  expect(registration).toBeRequired()
  await user.click(screen.getByRole('button', { name: 'Cadastrar condutor' }))
  expect(driversAPI.create).not.toHaveBeenCalled()
  await user.type(registration, '   ')
  await user.click(screen.getByRole('button', { name: 'Cadastrar condutor' }))
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Informe a matrícula')
  await user.clear(registration)
  await user.type(registration, ' 000123 ')
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: driver.nome_completo } })
  fireEvent.change(screen.getByLabelText('Documento'), { target: { value: driver.documento } })
  await user.click(screen.getByRole('button', { name: 'Selecionar secretaria' }))
  await user.click(screen.getByRole('button', { name: 'Cadastrar condutor' }))
  await waitFor(() => expect(driversAPI.create).toHaveBeenCalledWith(expect.objectContaining({ matricula: '000123' })))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('mostra matrícula na listagem e carrega o valor ao editar', async () => {
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByRole('cell', { name: '000123' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Mais ações do condutor Condutor Teste' }))
  await user.click(screen.getByRole('menuitem', { name: 'Editar' }))
  expect(screen.getByLabelText('Matrícula (obrigatória)')).toHaveValue('000123')
  await user.click(screen.getByRole('button', { name: 'Atualizar condutor' }))
  await waitFor(() => expect(driversAPI.update).toHaveBeenCalledWith('driver', expect.objectContaining({ matricula: '000123' })))
})

it('salva número da CNH com zeros à esquerda e permite cadastro incompleto sem apagar outros dados', async () => {
  const user = userEvent.setup()
  driversAPI.list.mockResolvedValue({ data: { data: [{ ...driver, cnh_numero: '00123456789', cnh_validade: '2030-12-31' }], pagination: { page: 1, pages: 1, total: 1 } } })
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Mais ações do condutor Condutor Teste' }))
  await user.click(screen.getByRole('menuitem', { name: 'Editar' }))
  await user.click(screen.getByText('CNH', { exact: true, selector: 'strong' }))
  expect(screen.getByLabelText('Número da CNH')).toHaveValue('00123456789')
  fireEvent.change(screen.getByLabelText('Contato'), { target: { value: '73999990000' } })
  await user.click(screen.getByRole('button', { name: 'Atualizar condutor' }))
  await waitFor(() => expect(driversAPI.update).toHaveBeenCalledWith('driver', expect.objectContaining({ cnh_numero: '00123456789', cnh_validade: '2030-12-31', contato: '73999990000' })))
})

it('abre diretamente a CNH de condutor fora da página e sem perder o número já existente', async () => {
  const user = userEvent.setup()
  driversAPI.getById.mockResolvedValue({ data: { ...driver, id: 'outside', cnh_numero: '00000012345', cnh_validade: '2020-01-01' } })
  renderPage('/condutores?editar=outside&regularizar=cnh')
  const number = await screen.findByLabelText('Número da CNH')
  expect(driversAPI.getById).toHaveBeenCalledWith('outside')
  expect(number).toHaveValue('00000012345')
  expect(number.closest('details')).toHaveAttribute('open')
  fireEvent.change(screen.getByLabelText('Validade da CNH'), { target: { value: '2031-01-15' } })
  await user.click(screen.getByRole('button', { name: 'Atualizar condutor' }))
  await waitFor(() => expect(driversAPI.update).toHaveBeenCalledWith('outside', expect.objectContaining({ cnh_numero: '00000012345', cnh_validade: '2031-01-15' })))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByText(/Volte à aba da operação/)).toBeInTheDocument()
})

it('respeita permissão e não carrega a edição pelo link sem acesso', async () => {
  permissions.edit = false
  renderPage('/condutores?editar=outside&regularizar=cnh')
  expect(await screen.findByText(/Você não tem permissão para editar condutores/)).toBeInTheDocument()
  expect(driversAPI.getById).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('apresenta erro recuperável quando o link do condutor não está disponível', async () => {
  driversAPI.getById.mockRejectedValueOnce({})
  renderPage('/condutores?editar=missing&regularizar=cnh')
  expect(await screen.findByText('Não foi possível abrir o cadastro do condutor.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Tentar abrir cadastro novamente' }))
  expect(await screen.findByLabelText('Número da CNH')).toBeInTheDocument()
})
