import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
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
  expect(within(summary).getByText('Garagem central')).toBeInTheDocument()
  expect(within(summary).getByText('150 km')).toBeInTheDocument()
  expect(within(summary).getByText('Sem avarias')).toBeInTheDocument()
  await actor.click(screen.getByRole('tab', { name: 'Histórico' }))
  expect(screen.getByText('Conferência documental')).toBeInTheDocument()
})
