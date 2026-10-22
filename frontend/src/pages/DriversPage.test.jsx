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

const summary = { total: 326, expired: 12, expiring_30: 7, expiring_60: 15, missing: 260, reference_date: '2026-10-22' }
function listResponse(page = 1, total = 326, records = [driver]) {
  return { data: { data: records, pagination: { page, pages: Math.max(1, Math.ceil(total / 10)), total, limit: 10 }, summary } }
}

it('usa totais globais da API e os mantém ao paginar e filtrar por CNH', async () => {
  const user = userEvent.setup()
  driversAPI.list.mockImplementation(({ page, cnh_status }) => Promise.resolve(listResponse(page, cnh_status ? 12 : 326)))
  renderPage()
  const expired = await screen.findByRole('button', { name: 'CNHs vencidas', exact: true })
  await waitFor(() => expect(expired).toBeEnabled())
  expect(expired).toHaveTextContent('12')
  await user.click(screen.getByRole('button', { name: 'Página 2', exact: true }))
  await waitFor(() => expect(driversAPI.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
  await waitFor(() => expect(expired).toBeEnabled())
  expect(expired).toHaveTextContent('12')
  await user.click(expired)
  await waitFor(() => expect(driversAPI.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, cnh_status: 'expired', active: true })))
  await waitFor(() => expect(expired).toHaveAttribute('aria-pressed', 'true'))
  expect(screen.getByRole('button', { name: 'CNHs não informadas', exact: true })).toHaveTextContent('260')
  await user.click(screen.getByRole('button', { name: 'Limpar filtro de CNH', exact: true }))
  await waitFor(() => expect(driversAPI.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, cnh_status: undefined })))
})

it('combina busca, secretaria, status e KPI, mantendo o filtro nos relatórios da página', async () => {
  const { exportRowsToXlsx, previewRowsToPdf } = await import('../utils/exportData')
  const user = userEvent.setup()
  driversAPI.list.mockResolvedValue(listResponse())
  renderPage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'CNHs não informadas', exact: true })).toBeEnabled())
  fireEvent.change(screen.getByPlaceholderText('Buscar por nome, matrícula, documento ou secretaria'), { target: { value: 'Teste' } })
  fireEvent.change(screen.getByLabelText('Filtrar por secretaria'), { target: { value: 'org' } })
  await user.click(screen.getByRole('button', { name: 'TODOS', exact: true }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'CNHs não informadas', exact: true })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'CNHs não informadas', exact: true }))
  await waitFor(() => expect(driversAPI.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'Teste', organization_id: 'org', active: undefined, cnh_status: 'missing' })))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar XLSX', exact: true })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Exportar XLSX', exact: true }))
  expect(exportRowsToXlsx).toHaveBeenCalledWith(expect.objectContaining({ rows: [driver], filters: expect.arrayContaining([{ label: 'CNH', value: 'CNHs não informadas' }]) }))
  await user.click(screen.getByRole('button', { name: 'Pré-visualizar PDF', exact: true }))
  expect(previewRowsToPdf).toHaveBeenCalledWith(expect.objectContaining({ filters: expect.arrayContaining([{ label: 'CNH', value: 'CNHs não informadas' }]) }))
})

it('ignora resposta antiga e não mostra totais falsos em falha', async () => {
  let resolveOld
  driversAPI.list.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve })).mockResolvedValueOnce(listResponse())
  renderPage()
  fireEvent.change(screen.getByPlaceholderText('Buscar por nome, matrícula, documento ou secretaria'), { target: { value: 'nova busca' } })
  const total = screen.getByRole('button', { name: 'Condutores no filtro', exact: true })
  await waitFor(() => expect(total).toHaveTextContent('326'))
  resolveOld({ data: { ...listResponse().data, summary: { ...summary, total: 999 } } })
  await waitFor(() => expect(total).not.toHaveTextContent('999'))
  driversAPI.list.mockRejectedValueOnce({})
  fireEvent.change(screen.getByPlaceholderText('Buscar por nome, matrícula, documento ou secretaria'), { target: { value: 'erro' } })
  expect(await screen.findByText('Não foi possível carregar os condutores.')).toBeInTheDocument()
  expect(total).toHaveTextContent('—')
  expect(total).toBeDisabled()
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
