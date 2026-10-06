import '../test/mockJustificationSuggestions'
import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ClaimForm from './ClaimForm'
import PossessionReturnCorrectionModal from './PossessionReturnCorrectionModal'
import { claimsAPI } from '../api/claims'

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator' }, canEdit: () => true }) }))
vi.mock('../api/claims', () => ({ claimsAPI: { update: vi.fn() } }))
vi.mock('./DriverSelect', () => ({ default: () => null }))
beforeEach(() => vi.resetAllMocks())

it('envia a justificativa de encerramento do sinistro revisada pelo usuário', async () => {
  claimsAPI.update.mockResolvedValue({})
  render(<ClaimForm vehicles={[]} initialData={{ id: 'claim', vehicle_id: 'vehicle', data_ocorrencia: '2026-10-01T12:00:00Z', descricao: 'Ocorrência fictícia', status: 'ENCERRADO' }} />)
  const input = screen.getByLabelText('Justificativa de encerramento')
  expect(input).not.toBeRequired()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver modelos' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ver modelos' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sem custo de reparo' }))
  expect(input.value).toContain('sem necessidade de despesa')
  expect(claimsAPI.update).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: 'Encerramento sem despesas adicionais, conforme registro revisado.' } })
  fireEvent.submit(input.closest('form'))
  await waitFor(() => expect(claimsAPI.update).toHaveBeenCalledWith('claim', expect.objectContaining({ justificativa_encerramento: input.value })))
})

it('mantém declaração obrigatória na retificação da confirmação de devolução', async () => {
  const submit = vi.fn()
  function Form() {
    const [form, setForm] = useState({ end_date: '2026-10-01T10:00', end_odometer_km: '100', vehicle_condition_notes: 'Sem ressalvas', correction_reason: '', declaration_accepted: false })
    return <PossessionReturnCorrectionModal record={{ id: 'possession' }}
      context={{ possession_public_number: 1, minimum_end_odometer_km: 0, declaration: { version: 1, text: 'Declaração fictícia' } }}
      form={form} onChange={(patch) => setForm((old) => ({ ...old, ...patch }))} onSubmit={submit} />
  }
  render(<Form />)
  expect(screen.getByLabelText('Justificativa administrativa')).toBeRequired()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver modelos' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ver modelos' }))
  fireEvent.click(screen.getByRole('button', { name: 'Odômetro de devolução' }))
  expect(screen.getByLabelText('Justificativa administrativa').value).toContain('quilometragem')
  expect(screen.getByRole('button', { name: 'Criar nova versão' })).toBeDisabled()
  expect(submit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('button', { name: 'Criar nova versão' })).toBeEnabled()
})
