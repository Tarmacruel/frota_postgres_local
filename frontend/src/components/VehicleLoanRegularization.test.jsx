import '../test/mockJustificationSuggestions'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import VehicleLoanRegularization from './VehicleLoanRegularization'
import { vehicleLoansAPI } from '../api/vehicleLoans'

vi.mock('../api/vehicleLoans', () => ({ vehicleLoansAPI: { regularizationCatalog: vi.fn(), previewRegularization: vi.fn(), regularize: vi.fn() } }))
const catalog = { vehicles: [{ id: 'vehicle', plate: 'ABC1234', owner_organization_id: 'origin' }],
  organizations: [{ id: 'origin', name: 'Saúde' }, { id: 'recipient', name: 'Educação' }],
  allocations: [{ id: 'oa', organization_id: 'origin', name: 'Garagem Saúde' }, { id: 'ra', organization_id: 'recipient', name: 'Garagem Educação' }] }
const preview = { can_confirm: true, preview_token: 'token', vehicle_plate: 'ABC1234', origin_name: 'Saúde', recipient_name: 'Educação',
  status: 'ACTIVE', owner_change: false, location_change: true, blockers: [], warnings: ['Registros antigos serão preservados.'], impact: [{ module: 'Posses', records: 1, without_responsibility: 1, other_responsibility: 0 }] }
beforeEach(() => {
  vi.resetAllMocks()
  vehicleLoansAPI.regularizationCatalog.mockResolvedValue({ data: catalog })
  vehicleLoansAPI.previewRegularization.mockResolvedValue({ data: preview })
  vehicleLoansAPI.regularize.mockResolvedValue({ data: { id: 'saved' } })
})
async function fill() {
  await waitFor(() => expect(screen.getByLabelText('Veículo')).toBeEnabled())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Etapa 1: Destino' })).toHaveFocus())
  for (const [label, option] of [['Veículo', 'ABC1234'], ['Lotação de origem no início do empréstimo', 'Garagem Saúde'], ['Secretaria recebedora', 'Educação'], ['Lotação de destino', 'Garagem Educação']]) {
    await userEvent.click(screen.getByRole('button', { name: label }))
    await userEvent.click(screen.getByRole('button', { name: option }))
  }
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  for (const [label, value] of [
    ['Entrega efetiva (data e hora local)', '2026-01-01T10:00'], ['Odômetro de entrega (km)', '0'], ['Condições de entrega', 'Sem avarias'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  for (const [label, value] of [['Motivo do empréstimo', 'Uso temporário em campo'], ['Referência documental (processo, protocolo ou termo existente)', 'Protocolo 001/2026'],
    ['Justificativa da regularização administrativa', 'Registro anterior à implantação do fluxo']]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
async function inspect() { await userEvent.click(screen.getByRole('button', { name: 'Etapa 3: Documento' })); await userEvent.click(screen.getByRole('button', { name: 'Conferir prévia da regularização' })); await screen.findByRole('region', { name: 'Prévia da regularização' }) }

it('previews zero odometer and indefinite ongoing loan before explicit confirmation', async () => {
  const saved = vi.fn()
  render(<VehicleLoanRegularization onClose={() => {}} onSaved={saved} />)
  await fill(); await inspect()
  expect(vehicleLoansAPI.previewRegularization).toHaveBeenCalledWith(expect.objectContaining({ delivery_odometer_km: '0', returned_at: null, expected_return_at: null, correct_owner: false }))
  expect(screen.getByRole('button', { name: 'Confirmar regularização' })).toBeDisabled()
  expect(vehicleLoansAPI.regularize).not.toHaveBeenCalled()
  await userEvent.click(screen.getByLabelText(/Conferi as datas/))
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar regularização' }))
  expect(vehicleLoansAPI.regularize).toHaveBeenCalledWith(expect.objectContaining({ preview_token: 'token', vehicle_id: 'vehicle' }))
  expect(saved).toHaveBeenCalledWith({ id: 'saved' })
})

it('changing dates invalidates preview and confirmation', async () => {
  render(<VehicleLoanRegularization onClose={() => {}} onSaved={() => {}} />)
  await fill(); await inspect()
  await userEvent.click(screen.getByRole('button', { name: 'Etapa 2: Datas' }))
  fireEvent.change(screen.getByLabelText('Entrega efetiva (data e hora local)'), { target: { value: '2026-01-02T10:00' } })
  expect(screen.queryByRole('button', { name: 'Confirmar regularização' })).not.toBeInTheDocument()
  expect(vehicleLoansAPI.regularize).not.toHaveBeenCalled()
})

it('closed periods include actual return data without moving current allocation', async () => {
  vehicleLoansAPI.previewRegularization.mockResolvedValue({ data: { ...preview, status: 'RETURNED', location_change: false } })
  render(<VehicleLoanRegularization onClose={() => {}} onSaved={() => {}} />)
  await fill(); await userEvent.click(screen.getByRole('button', { name: 'Etapa 2: Datas' })); await userEvent.click(screen.getByLabelText('Este empréstimo já foi devolvido'))
  await userEvent.click(screen.getByRole('button', { name: 'Lotação de retorno' }))
  await userEvent.click(screen.getByRole('button', { name: 'Garagem Saúde' }))
  for (const [label, value] of [['Devolução efetiva (data e hora local)', '2026-01-10T10:00'], ['Odômetro de devolução (km)', '80'], ['Condições de devolução', 'Sem avarias']]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  await inspect()
  expect(vehicleLoansAPI.previewRegularization).toHaveBeenCalledWith(expect.objectContaining({ return_allocation_id: 'oa', return_odometer_km: '80', return_condition: 'Sem avarias' }))
  expect(screen.getByText(/Lotação atual será preservada/)).toBeInTheDocument()
})

it('blocked preview never enables registration', async () => {
  vehicleLoansAPI.previewRegularization.mockResolvedValue({ data: { ...preview, can_confirm: false, blockers: ['Períodos sobrepostos'] } })
  render(<VehicleLoanRegularization onClose={() => {}} onSaved={() => {}} />)
  await fill(); await inspect()
  expect(screen.getByRole('alert')).toHaveTextContent('Períodos sobrepostos')
  expect(screen.getByRole('button', { name: 'Confirmar regularização' })).toBeDisabled()
  expect(screen.queryByLabelText(/Conferi as datas/)).not.toBeInTheDocument()
})

it('conflict preserves fields but requires a new preview and prevents duplicate sends', async () => {
  let fail
  vehicleLoansAPI.regularize.mockImplementation(() => new Promise((resolve, reject) => { fail = reject }))
  render(<VehicleLoanRegularization onClose={() => {}} onSaved={() => {}} />)
  await fill(); await inspect(); await userEvent.click(screen.getByLabelText(/Conferi as datas/))
  const button = screen.getByRole('button', { name: 'Confirmar regularização' })
  fireEvent.click(button); fireEvent.click(button)
  expect(vehicleLoansAPI.regularize).toHaveBeenCalledTimes(1)
  fail(new Error('Dados mudaram; gere nova prévia'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Dados mudaram')
  expect(screen.getByLabelText('Motivo do empréstimo')).toHaveValue('Uso temporário em campo')
  expect(screen.queryByRole('button', { name: 'Confirmar regularização' })).not.toBeInTheDocument()
})

it('origin correction must be explicitly checked and cannot retain stale allocation', async () => {
  render(<VehicleLoanRegularization onClose={() => {}} onSaved={() => {}} />)
  await fill()
  await userEvent.click(screen.getByRole('button', { name: 'Etapa 1: Destino' }))
  await userEvent.click(screen.getByRole('button', { name: 'Secretaria de origem' }))
  await userEvent.click(screen.getByRole('button', { name: 'Educação' }))
  expect(screen.getByLabelText('Lotação de origem no início do empréstimo')).toHaveTextContent('Selecione')
  expect(screen.getByLabelText(/Confirmo a correção/)).not.toBeChecked()
})

it('prévia bloqueada mantém o progresso incompleto e leva à correção sem perder o documento', async () => {
  vehicleLoansAPI.previewRegularization.mockResolvedValue({ data: { ...preview, can_confirm: false, blockers: ['O período se sobrepõe a outro empréstimo efetivo do veículo.'] } })
  render(<VehicleLoanRegularization onClose={vi.fn()} onSaved={vi.fn()} canView={() => false} />)
  await fill(); await inspect()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
  await userEvent.click(screen.getByRole('button', { name: 'Rever datas' }))
  expect(screen.getByLabelText('Entrega efetiva (data e hora local)')).toHaveValue('2026-01-01T10:00')
  await userEvent.click(screen.getByRole('button', { name: 'Etapa 3: Documento' }))
  expect(screen.getByLabelText('Referência documental (processo, protocolo ou termo existente)')).toHaveValue('Protocolo 001/2026')
  expect(vehicleLoansAPI.regularize).not.toHaveBeenCalled()
})

it('alterar o documento após a revisão exige nova prévia e novo aceite dos efeitos', async () => {
  render(<VehicleLoanRegularization onClose={vi.fn()} onSaved={vi.fn()} />)
  await fill(); await inspect(); await userEvent.click(screen.getByLabelText(/Conferi as datas/))
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
  await userEvent.click(screen.getByRole('button', { name: 'Etapa 3: Documento' }))
  fireEvent.change(screen.getByLabelText('Referência documental (processo, protocolo ou termo existente)'), { target: { value: 'Protocolo 002/2026' } })
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
  await inspect()
  expect(vehicleLoansAPI.previewRegularization).toHaveBeenLastCalledWith(expect.objectContaining({ document_reference: 'Protocolo 002/2026' }))
  expect(screen.getByLabelText(/Conferi as datas/)).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Confirmar regularização' })).toBeDisabled()
})
