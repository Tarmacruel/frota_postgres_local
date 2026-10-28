import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import VehicleLoanInspector from './VehicleLoanInspector'
import { availableLoanActions } from '../utils/vehicleLoans'

vi.mock('./VehicleLoanDocuments', () => ({ default: function Documents() {
  const [note, setNote] = useState('')
  return <label>Rascunho de documento<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
} }))

const loan = { id: 'loan', version: 1, vehicle_id: 'vehicle', vehicle_plate: 'ABC1234', status: 'DRAFT',
  origin_organization_id: 'origin', recipient_organization_id: 'recipient',
  origin_organization_name: 'Saúde', recipient_organization_name: 'Educação',
  origin_allocation_name: 'Garagem', destination_allocation_name: 'Escola', reason: 'Transporte escolar' }
const user = { id: 'admin', role: 'ADMIN' }
const context = { version: 1, minimum_odometer_km: 100, blockers: { open_possessions: 0, open_trips: 0, open_fuel_orders: 0 } }
function mount(overrides = {}) {
  const props = { detail: loan, context, events: [], catalogReady: true, editable: true,
    user, canView: () => true, orgName: () => 'Saúde', onClose: vi.fn(), onRefresh: vi.fn(), onAction: vi.fn(), ...overrides }
  props.actions = overrides.actions || availableLoanActions(props.user, props.detail)
  return { ...render(<MemoryRouter><VehicleLoanInspector {...props} /></MemoryRouter>), props }
}

it('carrega documentos ao abrir a aba e conserva o preenchimento ao alternar por teclado', async () => {
  const actor = userEvent.setup(); mount()
  expect(screen.queryByLabelText('Rascunho de documento')).not.toBeInTheDocument()
  await actor.click(screen.getByRole('tab', { name: 'Documentos e assinaturas' }))
  await actor.type(screen.getByLabelText('Rascunho de documento'), 'arquivo escolhido')
  await actor.click(screen.getByRole('tab', { name: 'Histórico' }))
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  await actor.keyboard('{Home}{ArrowRight}')
  expect(screen.getByRole('tab', { name: 'Documentos e assinaturas' })).toHaveFocus()
  expect(screen.getByRole('tab', { name: 'Documentos e assinaturas' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByLabelText('Rascunho de documento')).toHaveValue('arquivo escolhido')
  await actor.keyboard('{End}{ArrowRight}')
  expect(screen.getByRole('tab', { name: 'Resumo' })).toHaveFocus()
  expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Resumo')
})

it('destaca bloqueios e leva diretamente às pendências sem executar a troca', async () => {
  const actor = userEvent.setup()
  const { props } = mount({ context: { ...context, blockers: { open_possessions: 1, open_trips: 2, open_fuel_orders: 1 } } })
  expect(screen.getByText('4 pendências abertas')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enviar para recebimento' })).toBeDisabled()
  await actor.click(screen.getByRole('tab', { name: 'Histórico' }))
  await actor.click(screen.getByRole('button', { name: 'Ver pendências' }))
  expect(screen.getByRole('region', { name: 'Pendências para a troca de responsabilidade' })).toHaveFocus()
  expect(screen.getByRole('tab', { name: 'Resumo' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('link', { name: 'Consultar posses do veículo' })).toHaveAttribute('href', '/posses?vehicle_id=vehicle')
  expect(props.onAction).not.toHaveBeenCalled()
})

it('oferece repetição da consulta quando o catálogo falha e impede ações dependentes', async () => {
  const actor = userEvent.setup()
  const { props } = mount({ catalogError: 'Erro', catalogReady: false })
  expect(screen.getByRole('alert')).toHaveTextContent('opções de operação não estão disponíveis')
  expect(screen.getByRole('button', { name: 'Enviar para recebimento' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Mais ações do empréstimo de ABC1234' })).toBeDisabled()
  await actor.click(screen.getByRole('button', { name: 'Atualizar opções' }))
  expect(props.onRefresh).toHaveBeenCalledOnce()
})

it.each([
  ['DRAFT', 'Enviar para recebimento', 'Cancelar proposta'],
  ['AWAITING_RECEIPT', 'Confirmar recebimento', 'Rejeitar proposta'],
  ['ACTIVE', 'Solicitar devolução', null],
  ['AWAITING_RETURN_RECEIPT', 'Confirmar devolução', 'Rejeitar devolução'],
])('mantém a ação principal de %s no rodapé e as demais no menu', async (status, primary, secondary) => {
  const actor = userEvent.setup()
  const { props } = mount({ detail: { ...loan, status, submitted_by_user_id: 'sender', return_submitted_by_user_id: 'receiver' }, editable: status === 'DRAFT' })
  const action = screen.getByRole('button', { name: primary })
  expect(action.closest('footer')).toBeInTheDocument()
  await actor.click(action)
  expect(props.onAction).toHaveBeenCalledWith(props.actions.find(([, value]) => value.label === primary)[0])
  if (secondary) {
    await actor.click(screen.getByRole('button', { name: 'Mais ações do empréstimo de ABC1234' }))
    expect(screen.getByRole('menuitem', { name: secondary })).toBeEnabled()
  }
})

it('não permite que o mesmo emissor confirme o recebimento', () => {
  mount({ detail: { ...loan, status: 'AWAITING_RECEIPT', submitted_by_user_id: user.id }, editable: false })
  expect(screen.getByRole('button', { name: 'Confirmar recebimento' })).toBeDisabled()
  expect(screen.getByText('Outro usuário deve confirmar este recebimento.')).toBeInTheDocument()
})

it.each(['RETURNED', 'REJECTED', 'CANCELLED'])('permite consultar documentos e histórico de %s sem ações operacionais', async (status) => {
  const actor = userEvent.setup()
  const { props } = mount({ detail: { ...loan, status }, editable: false })
  expect(screen.queryByRole('button', { name: /Mais ações/ })).not.toBeInTheDocument()
  await actor.click(screen.getByRole('tab', { name: 'Documentos e assinaturas' }))
  expect(screen.getByLabelText('Rascunho de documento')).toBeInTheDocument()
  await actor.click(screen.getByRole('tab', { name: 'Histórico' }))
  expect(screen.getByText('Nenhuma ação registrada neste empréstimo.')).toBeInTheDocument()
  await actor.click(screen.getByRole('button', { name: 'Fechar detalhes' }))
  expect(props.onClose).toHaveBeenCalledOnce()
})

it('preserva a identificação de regularização e os fatos de devolução, com histórico separado', async () => {
  const actor = userEvent.setup()
  mount({ detail: { ...loan, status: 'RETURNED', regularized_at: '2026-10-01T12:00:00Z', regularization_reference: 'Ofício 12',
    return_allocation_id: 'garage', return_allocation_name: 'Garagem central', return_odometer_km: 150, return_condition: 'Sem avarias' },
  editable: false, events: [{ id: 'event', event_type: 'CREATED', created_at: '2026-10-01T12:00:00Z', actor_name: 'Gestor', justification: 'Conferência documental' }] })
  const summary = screen.getByRole('tabpanel')
  expect(within(summary).getByText(/Não representam aceites ou assinaturas realizados no passado/)).toBeInTheDocument()
  await actor.click(screen.getByRole('button', { name: /Uso: Concluída. Consultar detalhes/ }))
  expect(within(summary).getByText('Garagem central')).toBeInTheDocument()
  expect(within(summary).getByText('150 km')).toBeInTheDocument()
  expect(within(summary).getByText('Sem avarias')).toBeInTheDocument()
  await actor.click(screen.getByRole('tab', { name: 'Histórico' }))
  expect(screen.getByText('Conferência documental')).toBeInTheDocument()
})

it.each([
  ['DRAFT', 0, 'Proposta'], ['AWAITING_RECEIPT', 1, 'Entrega'], ['ACTIVE', 2, 'Uso'],
  ['AWAITING_RETURN_RECEIPT', 3, 'Devolução'], ['RETURNED', 4, null],
  ['REJECTED', 1, null], ['CANCELLED', 0, null],
])('mostra avanço operacional coerente com %s sem inferir documentos', (status, completed, current) => {
  mount({ detail: { ...loan, status }, editable: false })
  expect(screen.getByRole('progressbar', { name: 'Etapas operacionais concluídas' })).toHaveAttribute('aria-valuenow', String(completed))
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4')
  if (current) expect(screen.getByRole('button', { name: `${current}: Etapa atual. Consultar detalhes` }).closest('li')).toHaveAttribute('aria-current', 'step')
  else expect(document.querySelector('.loan-journey [aria-current="step"]')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Rascunho de documento')).not.toBeInTheDocument()
  if (['CANCELLED', 'REJECTED'].includes(status)) expect(screen.queryByText('A seguir')).not.toBeInTheDocument()
})

it('preserva a proposta enviada no avanço de um cancelamento sem tratar a entrega como concluída', () => {
  mount({ detail: { ...loan, status: 'CANCELLED' }, editable: false,
    events: [{ id: 'submitted', event_type: 'SUBMITTED', created_at: '2026-10-01T12:00:00Z' }] })
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  expect(screen.getByRole('button', { name: 'Entrega: Interrompida. Consultar detalhes' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Uso: Não realizada. Consultar detalhes' })).toBeInTheDocument()
})

it.each([['ACTIVE', 1], ['RETURNED', 3]])('regularização em %s tem percurso próprio, sem proposta ou aceites retroativos', (status, completed) => {
  mount({ detail: { ...loan, status, regularized_at: '2026-10-01T12:00:00Z', regularization_reference: 'Documento de teste' }, editable: false })
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3')
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(completed))
  expect(screen.queryByRole('button', { name: /^Proposta:/ })).not.toBeInTheDocument()
  expect(screen.getByText(/Não representam aceites ou assinaturas realizados no passado/)).toBeVisible()
})

it('marcos navegam até entrega, devolução e lotações sem executar uma ação', async () => {
  const actor = userEvent.setup()
  const { props } = mount({ detail: { ...loan, status: 'RETURNED', return_allocation_id: 'garage', return_allocation_name: 'Garagem central' }, editable: false })
  await waitFor(() => expect(document.querySelector('.loan-inspector__intro')).toHaveFocus())
  await actor.click(screen.getByRole('button', { name: 'Entrega: Concluída. Consultar detalhes' }))
  expect(screen.getByRole('article', { name: 'Entrega' })).toHaveFocus()
  await actor.click(screen.getByRole('button', { name: 'Devolução: Concluída. Consultar detalhes' }))
  expect(screen.getByRole('article', { name: 'Devolução' })).toHaveFocus()
  const units = screen.getByText('Lotações e responsabilidade').closest('details')
  expect(units).not.toHaveAttribute('open')
  await actor.click(screen.getByRole('button', { name: 'Uso: Concluída. Consultar detalhes' }))
  expect(units).toHaveAttribute('open')
  expect(screen.getByText('Garagem central')).toBeVisible()
  expect(units.querySelector('summary')).toHaveFocus()
  expect(props.onAction).not.toHaveBeenCalled()
})

it('expande os textos originais e mantém zero como odômetro válido', async () => {
  const actor = userEvent.setup()
  const original = 'CONDIÇÕES ORIGINAIS COM ACENTUAÇÃO: VEÍCULO ENTREGUE SEM AVARIAS.\nSegunda linha com todas as informações do registro.'
  mount({ detail: { ...loan, delivery_condition: original, delivery_odometer_km: 0 } })
  expect(screen.getByText('0 km')).toBeInTheDocument()
  const toggle = screen.getByRole('button', { name: 'Ler texto completo: Condições de entrega' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const text = document.getElementById(toggle.getAttribute('aria-controls'))
  expect(text.textContent).toBe(original)
  await actor.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(text.textContent).toBe(original)
  await actor.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

it('oferece expansão somente quando o texto ultrapassa a prévia e reavalia a largura', async () => {
  const width = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(500)
  const height = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(40)
  let scrollHeight = 40
  const scroll = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight)
  let result
  try {
    result = mount({ detail: { ...loan, delivery_condition: 'Condições registradas do veículo. '.repeat(8) } })
    expect(screen.queryByRole('button', { name: 'Ler texto completo: Condições de entrega' })).not.toBeInTheDocument()
    scrollHeight = 120
    fireEvent.resize(window)
    expect(await screen.findByRole('button', { name: 'Ler texto completo: Condições de entrega' })).toBeInTheDocument()
  } finally { result?.unmount(); width.mockRestore(); height.mockRestore(); scroll.mockRestore() }
})

it('a conclusão leva à consulta de documentos sem presumir assinaturas', async () => {
  const actor = userEvent.setup(); const { props } = mount({ detail: { ...loan, status: 'RETURNED' }, editable: false })
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '4 de 4 etapas operacionais concluídas')
  await actor.click(screen.getByRole('button', { name: 'Conferir documentos e assinaturas' }))
  expect(screen.getByRole('tab', { name: 'Documentos e assinaturas' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByLabelText('Rascunho de documento')).toBeVisible()
  expect(props.onAction).not.toHaveBeenCalled()
})

it('recolhe a conferência sem pendências mantendo os dados acessíveis', async () => {
  const actor = userEvent.setup(); mount()
  const checks = screen.getByRole('region', { name: 'Pendências para a troca de responsabilidade' })
  expect(within(checks).getByText('Sem pendências')).toBeVisible()
  const reference = within(checks).getByText('Referência mínima do odômetro: 100 km.')
  expect(reference).not.toBeVisible()
  await actor.click(within(checks).getByText('Conferência operacional'))
  expect(reference).toBeVisible()
  expect(screen.getByRole('button', { name: 'Enviar para recebimento' })).toBeEnabled()
})

it('o atalho de pendências reabre a conferência e mantém a ação bloqueada', async () => {
  const actor = userEvent.setup(); mount({ context: { ...context, blockers: { ...context.blockers, open_possessions: 1 } } })
  const checks = screen.getByRole('region', { name: 'Pendências para a troca de responsabilidade' })
  await actor.click(within(checks).getByText('Conferência operacional'))
  expect(checks.querySelector('details')).not.toHaveAttribute('open')
  await actor.click(screen.getByRole('button', { name: 'Ver pendências' }))
  expect(checks.querySelector('details')).toHaveAttribute('open')
  expect(checks).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Enviar para recebimento' })).toBeDisabled()
})
