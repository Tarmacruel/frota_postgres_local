import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import RecordAdministration from './RecordAdministration'

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() }))
vi.mock('../api/client', () => ({ default: api }))
vi.mock('../hooks/useSystemSettings', () => ({ useSystemSettings: () => ({ values: { forms: {} } }) }))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [], loading: false }) }))
let detail
beforeEach(() => {
  vi.clearAllMocks()
  detail = { id: 'example', module: 'maintenance', label: 'Manutenção fictícia', values: { service_description: 'Troca de pneus' },
    fields: [{ key: 'service_description', label: 'Serviço', type: 'text', required: true }], custom_fields: {}, inactive: false,
    revision: 2, updated_at: '2026-10-29T12:00:00Z', protected_hint: 'Confira os efeitos antes de confirmar.',
    lifecycle: { steps: [], can_confirm: true, has_effects: true, restoring: false, token: 'confirmed-preview', amount: '100.00', reserved: 0,
      quantities: [{ item_id: 'item', label: 'Pneu', quantity: '2', unit: 'UN', effect: 'consumption' }] } }
  api.get.mockImplementation(async (path) => ({ data: path.endsWith('/catalog') ? [{ key: 'maintenance', label: 'Manutenções' }]
    : path.endsWith('/example') ? detail : { data: [{ id: 'example', label: detail.label, inactive: false }], total: 1 } }))
  api.patch.mockResolvedValue({ data: {} })
})

async function open() {
  const actor = userEvent.setup()
  render(<RecordAdministration initialModule="maintenance" />)
  await actor.click(await screen.findByRole('button', { name: /Manutenção fictícia/ }))
  return actor
}

it('exige conferência dos valores e quantidades antes de estornar, preservando a ação em uma única transação', async () => {
  const actor = await open()
  expect(screen.getByRole('button', { name: 'Salvar alterações' }).closest('.guided-form__footer')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Salvar alterações' }).closest('form')).toHaveAttribute('data-final', 'false')
  await actor.click(screen.getByRole('button', { name: 'Continuar', exact: true }))
  await actor.click(screen.getByRole('checkbox', { name: /Inativar registro/ }))
  expect(screen.getByText(/100,00/)).toBeInTheDocument()
  expect(screen.getByText(/consumo a estornar/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Concluir inativação' })).toBeDisabled()
  await actor.type(screen.getByRole('textbox', { name: 'Justificativa' }), 'Anulação de um lançamento de teste')
  await actor.click(screen.getByRole('checkbox', { name: /Conferi o efeito financeiro/ }))
  await actor.click(screen.getByRole('button', { name: 'Concluir inativação' }))
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/record-admin/maintenance/example', expect.objectContaining({
    expected_revision: 2, inactive: true, effect_action: 'reverse', expected_effect_token: 'confirmed-preview',
  })))
})

it('explica o impedimento e oferece acesso ao fluxo de solução sem permitir ocultar uma entrega ativa', async () => {
  detail.lifecycle = { ...detail.lifecycle, can_confirm: false, steps: [{ key: 'handoff', blocked: true,
    label: 'Resolver a entrega', message: 'Confirme a devolução antes de inativar.', href: '/emprestimos?id=example', action: 'Abrir devolução' }] }
  const actor = await open()
  await actor.click(screen.getByRole('button', { name: 'Continuar', exact: true }))
  await actor.click(screen.getByRole('checkbox', { name: /Inativar registro/ }))
  expect(screen.getByText('Confirme a devolução antes de inativar.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Abrir devolução/ })).toHaveAttribute('href', '/emprestimos?id=example')
  expect(screen.getByRole('button', { name: 'Concluir inativação' })).toBeDisabled()
  expect(api.patch).not.toHaveBeenCalled()
})
