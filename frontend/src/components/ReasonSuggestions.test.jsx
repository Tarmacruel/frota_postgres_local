import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import JustificationField from './JustificationField'
import { justificationSuggestionsAPI as api } from '../api/justificationSuggestions'
import presets from '../../../backend/app/core/justification_presets.json'

const mocks = vi.hoisted(() => ({ user: { id: 'operator-a' } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('../api/justificationSuggestions', () => ({ justificationSuggestionsAPI: { list: vi.fn(), forget: vi.fn() } }))

function Form({ disabled = false, onSubmit = vi.fn(), context = 'fuel_supply', required = true }) {
  const [reason, setReason] = useState('')
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(reason) }}>
    <JustificationField label="Justificativa" context={context} required={required} minLength={10} maxLength={1000}
      value={reason} onChange={(event) => setReason(event.target.value)} disabled={disabled} />
    <button>Salvar</button>
  </form>
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.user = { id: 'operator-a' }
  api.list.mockResolvedValue({ data: { presets: presets.fuel_supply, history: [] } })
  api.forget.mockResolvedValue({})
})

it('seleciona por teclado, permite edição e exige confirmação antes de substituir texto', async () => {
  const submit = vi.fn()
  const actor = userEvent.setup()
  render(<Form onSubmit={submit} />)
  const input = screen.getByLabelText('Justificativa')
  expect(input).toBeRequired()
  expect(input).toHaveValue('')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver modelos' })).toBeEnabled())
  await actor.click(screen.getByRole('button', { name: 'Ver modelos' }))
  screen.getByRole('button', { name: 'Odômetro', exact: true }).focus()
  await actor.keyboard('{Enter}')
  expect(input).toHaveFocus()
  expect(input.value).toContain('Correção do odômetro')
  expect(submit).not.toHaveBeenCalled()
  await actor.clear(input)
  await actor.type(input, 'Texto revisado pela administração.')
  await actor.click(screen.getByRole('button', { name: 'Comprovante', exact: true }))
  expect(input).toHaveValue('Texto revisado pela administração.')
  await actor.click(screen.getByRole('button', { name: 'Manter meu texto' }))
  expect(input).toHaveValue('Texto revisado pela administração.')
  await actor.click(screen.getByRole('button', { name: 'Comprovante', exact: true }))
  await actor.click(screen.getByRole('button', { name: 'Substituir texto' }))
  expect(input.value).toContain('Substituição do comprovante')
  expect(submit).not.toHaveBeenCalled()
  await actor.click(screen.getByRole('button', { name: 'Salvar', exact: true }))
  expect(submit).toHaveBeenCalledWith(input.value)
  expect(api.list).toHaveBeenCalledTimes(1)
})

it('mostra até três frequentes e esquece sem modificar o campo', async () => {
  api.list.mockResolvedValue({ data: { history: [1, 2, 3, 4].map((n) => ({ id: String(n), text: `Justificativa frequente número ${n}` })) } })
  render(<Form />)
  fireEvent.click(await screen.findByRole('button', { name: 'Justificativa frequente número 1', exact: true }))
  expect(screen.queryByRole('button', { name: 'Justificativa frequente número 4', exact: true })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Esquecer sugestão: Justificativa frequente número 1' }))
  await waitFor(() => expect(api.forget).toHaveBeenCalledWith('1'))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Justificativa frequente número 1', exact: true })).not.toBeInTheDocument())
  expect(screen.getByLabelText('Justificativa')).toHaveValue('Justificativa frequente número 1')
})

it('não exibe textos de outra conta nem respostas atrasadas', async () => {
  let finishOldRequest
  api.list.mockReturnValueOnce(new Promise((resolve) => { finishOldRequest = resolve }))
  const { rerender } = render(<Form />)
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1))
  mocks.user = { id: 'operator-b' }
  rerender(<Form />)
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
  await act(async () => finishOldRequest({ data: { history: [{ id: 'old', text: 'Texto privado da primeira conta' }] } }))
  expect(screen.queryByText('Texto privado da primeira conta')).not.toBeInTheDocument()
  api.list.mockResolvedValueOnce({ data: { history: [{ id: 'new', text: 'Texto da segunda conta' }] } })
  rerender(<Form context="order_cancel" />)
  expect(await screen.findByRole('button', { name: 'Texto da segunda conta', exact: true })).toBeInTheDocument()
  mocks.user = null
  rerender(<Form context="order_cancel" />)
  expect(screen.queryByText('Texto da segunda conta')).not.toBeInTheDocument()
})

it('mantém digitação em falha de consulta e preserva campo opcional', async () => {
  api.list.mockRejectedValue(new Error('indisponível'))
  render(<Form required={false} />)
  expect(screen.getByLabelText('Justificativa')).not.toBeRequired()
  fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Texto manual' } })
  expect(await screen.findByText('Sugestões indisponíveis. Você pode digitar a justificativa normalmente.')).toBeInTheDocument()
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1))
  expect(screen.getByLabelText('Justificativa')).toHaveValue('Texto manual')
})

it('falha de exclusão mantém a sugestão e salvar desabilita escolhas', async () => {
  api.list.mockResolvedValue({ data: { history: [{ id: '1', text: 'Correção de dados da ordem' }] } })
  api.forget.mockRejectedValue(new Error('indisponível'))
  const { rerender } = render(<Form />)
  fireEvent.click(await screen.findByRole('button', { name: 'Esquecer sugestão: Correção de dados da ordem' }))
  expect(await screen.findByText('Não foi possível esquecer a sugestão. Tente novamente.')).toBeInTheDocument()
  rerender(<Form disabled />)
  expect(screen.getByRole('button', { name: 'Correção de dados da ordem', exact: true })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Ver modelos' })).toBeDisabled()
})
