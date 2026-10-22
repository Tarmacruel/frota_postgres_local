import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import UsersPage from './UsersPage'
import { exportRowsToXlsx } from '../utils/exportData'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('../api/client', () => ({ default: api }))
vi.mock('../hooks/useMasterDataCatalog', () => ({
  useMasterDataCatalog: () => ({ organizations: [{ id: 'org', name: 'Secretaria teste' }] }),
}))
vi.mock('../utils/exportData', () => ({ exportRowsToXlsx: vi.fn(), previewRowsToPdf: vi.fn() }))
vi.mock('../components/SearchableSelect', () => ({
  default: ({ onChange }) => <button type="button" onClick={() => onChange('org')}>Selecionar secretaria</button>,
}))

beforeEach(() => {
  vi.resetAllMocks()
  api.get.mockResolvedValue({ data: { data: [], pagination: { page: 1, pages: 1, total: 0 }, summary: {} } })
})

it('impede envio de CPF inválido e indica o campo para correção', () => {
  render(<MemoryRouter><UsersPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }))
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '52998224724' } })
  fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }))
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('os dígitos verificadores não conferem')
  expect(screen.getByLabelText('CPF')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('CPF')).toHaveFocus()
  expect(api.post).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '52998224725' } })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByLabelText('CPF')).toHaveAttribute('aria-invalid', 'false')
})

it('mostra validação local dentro do modal e limpa ao reabrir', async () => {
  render(<MemoryRouter><UsersPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }))
  fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }))
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Informe o CPF')
  expect(api.post).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it.each(['cadastro', 'edição'])('preserva os dados e mostra erro da API no modal de %s', async (mode) => {
  api.get.mockResolvedValue({ data: { data: mode === 'edição' ? [{ id: 'user', name: 'Pessoa teste', email: 'teste@local', role: 'PADRAO', organization_id: 'org' }] : [], pagination: { page: 1, pages: 1, total: mode === 'edição' ? 1 : 0 }, summary: {} } })
  const failure = { response: { data: { detail: [{ loc: ['body', 'cpf'], msg: 'Valor inválido' }], request_id: 'test-ref' } } }
  api.post.mockRejectedValue(failure)
  api.put.mockRejectedValue(failure)
  render(<MemoryRouter><UsersPage /></MemoryRouter>)
  if (mode === 'edição') fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
  else fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }))
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Pessoa teste' } })
  fireEvent.change(screen.getByLabelText(mode === 'edição' ? 'Substituir CPF (opcional)' : 'CPF'), { target: { value: '52998224725' } })
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar secretaria' }))
  fireEvent.click(screen.getByRole('button', { name: mode === 'edição' ? 'Atualizar usuário' : 'Criar usuário' }))
  await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('CPF inválido'))
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByRole('alert')).toHaveTextContent('test-ref')
  expect(screen.getByLabelText('Nome completo')).toHaveValue('Pessoa teste')
  expect(screen.getByLabelText(mode === 'edição' ? 'Substituir CPF (opcional)' : 'CPF')).toHaveValue('52998224725')
})

it('exporta todas as páginas do filtro, além da página exibida', async () => {
  const users = [
    { id: 'a', name: 'Pessoa A', email: 'a@local', role: 'ADMIN' },
    { id: 'b', name: 'Pessoa B', email: 'b@local', role: 'ADMIN' },
  ]
  api.get.mockImplementation((_path, { params }) => Promise.resolve({ data: {
    data: params.limit === 200 ? [users[params.page - 1]] : [users[0]],
    pagination: { page: params.page, pages: params.limit === 200 ? 2 : 1, total: 2 },
    summary: { ADMIN: 2 },
  } }))
  render(<MemoryRouter><UsersPage /></MemoryRouter>)
  await screen.findByText('Pessoa A')
  fireEvent.click(screen.getByRole('button', { name: 'Exportar XLSX' }))
  await waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalledWith(expect.objectContaining({ rows: users })))
  expect(api.get).toHaveBeenCalledWith('/users/paginated', { params: expect.objectContaining({ page: 2, limit: 200 }) })
})

it('mostra falha de carregamento sem substituir a tabela por dados antigos', async () => {
  api.get.mockRejectedValue(new Error('Falha simulada de rede'))
  render(<MemoryRouter><UsersPage /></MemoryRouter>)
  expect(await screen.findByText('Falha simulada de rede')).toBeInTheDocument()
  expect(screen.getByText('Nenhum usuário encontrado para os filtros aplicados.')).toBeInTheDocument()
})

it('filtra pelo KPI na API, mantém os totais completos e permite limpar', async () => {
  api.get.mockImplementation((_path, { params }) => Promise.resolve({ data: {
    data: [], pagination: { page: params.page, pages: 1, total: params.indicator === 'cpf' ? 3 : 38 },
    indicators: { population: 38, items: [{ key: 'total', label: 'Usuários', value: 38 }, { key: 'cpf', label: 'CPFs pendentes', value: 3 }] },
  } }))
  render(<MemoryRouter><UsersPage /></MemoryRouter>)
  const button = await screen.findByRole('button', { name: /CPFs pendentes/ })
  fireEvent.click(button)
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/users/paginated', { params: expect.objectContaining({ page: 1, indicator: 'cpf' }) }))
  await waitFor(() => expect(button).toBeEnabled())
  expect(screen.getByText('38')).toBeInTheDocument()
  expect(button).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Limpar indicador' }))
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/users/paginated', { params: expect.objectContaining({ page: 1, indicator: undefined }) }))
})
