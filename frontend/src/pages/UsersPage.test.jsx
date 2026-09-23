import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import UsersPage from './UsersPage'

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
  api.get.mockResolvedValue({ data: [] })
})

it('impede envio de CPF inválido e indica o campo para correção', () => {
  render(<UsersPage />)
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
  render(<UsersPage />)
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
  api.get.mockResolvedValue({ data: mode === 'edição' ? [{ id: 'user', name: 'Pessoa teste', email: 'teste@local', role: 'PADRAO', organization_id: 'org' }] : [] })
  const failure = { response: { data: { detail: [{ loc: ['body', 'cpf'], msg: 'Valor inválido' }], request_id: 'test-ref' } } }
  api.post.mockRejectedValue(failure)
  api.put.mockRejectedValue(failure)
  render(<UsersPage />)
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
