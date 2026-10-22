import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { MyVehicleTagsModal, VehicleTagsManager, VehicleTagBadges, VehicleTagFilter } from './VehicleTags'
import SearchableSelect from './SearchableSelect'
import { vehicleTagsAPI } from '../api/vehicleTags'

vi.mock('../api/vehicleTags', () => ({ vehicleTagsAPI: { mine: vi.fn(), create: vi.fn(), update: vi.fn(), deleteDefinition: vi.fn(), list: vi.fn(), apply: vi.fn(), remove: vi.fn(), options: vi.fn() } }))
const own = { id: 'tag-a', owner_user_id: 'ana', owner_name: 'Ana', name: 'Em lavagem', color: 'blue', is_active: true }
const other = { id: 'mark-b', tag_id: 'tag-b', name: 'Em manutenção', color: 'amber', owner_name: 'Carlos', applied_by_user_id: 'carlos', applied_by_name: 'Carlos', applied_at: '2026-10-21T12:00:00Z', note: 'Aguardando oficina' }
const vehicle = { id: 'vehicle-a', plate: 'TST0A01', brand: 'Teste', model: 'Etiquetas' }
beforeEach(() => {
  vi.resetAllMocks()
  vehicleTagsAPI.mine.mockResolvedValue({ data: [own] })
  vehicleTagsAPI.list.mockResolvedValue({ data: [other] })
  vehicleTagsAPI.options.mockResolvedValue({ data: [own] })
  vehicleTagsAPI.apply.mockResolvedValue({ data: [other] })
  vehicleTagsAPI.remove.mockResolvedValue({ data: [] })
  vehicleTagsAPI.create.mockResolvedValue({ data: own })
  vehicleTagsAPI.update.mockResolvedValue({ data: own })
  vehicleTagsAPI.deleteDefinition.mockResolvedValue({ data: { message: 'Etiqueta excluída' } })
})

it('creates a personal label and preserves the form on API error', async () => {
  vehicleTagsAPI.create.mockRejectedValueOnce({ response: { data: { detail: 'Nome duplicado' } } })
  render(<MyVehicleTagsModal onClose={vi.fn()} />)
  await screen.findByRole('button', { name: 'Editar' })
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Aguardando peça' } })
  fireEvent.click(screen.getByRole('radio', { name: 'Amarelo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Salvar etiqueta' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Nome duplicado')
  expect(screen.getByLabelText('Nome')).toHaveValue('Aguardando peça')
  fireEvent.click(screen.getByRole('button', { name: 'Salvar etiqueta' }))
  await waitFor(() => expect(vehicleTagsAPI.create).toHaveBeenLastCalledWith({ name: 'Aguardando peça', color: 'amber', is_active: true }))
  await screen.findByText('Etiqueta salva no seu catálogo.')
})

it('previews all six new colors locally and only saves the selected value on submission', async () => {
  render(<MyVehicleTagsModal onClose={vi.fn()} />)
  await screen.findByRole('button', { name: 'Editar' })
  expect(screen.getAllByRole('radio')).toHaveLength(12)
  expect(screen.getByText('12 cores')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Viagem TFD' } })
  for (const [value, name] of [['orange','Laranja'],['teal','Turquesa'],['pink','Rosa'],['cyan','Ciano'],['indigo','Índigo'],['brown','Marrom']]) {
    fireEvent.click(screen.getByRole('radio', { name, exact: true }))
    expect(screen.getByRole('radio', { name, exact: true })).toBeChecked()
    expect(screen.getByLabelText(`Prévia: Viagem TFD, cor ${name}`).querySelector('.vehicle-tag')).toHaveAttribute('data-color', value)
  }
  expect(vehicleTagsAPI.create).not.toHaveBeenCalled()
  expect(vehicleTagsAPI.update).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar etiqueta' }))
  await waitFor(() => expect(vehicleTagsAPI.create).toHaveBeenCalledWith({ name: 'Viagem TFD', color: 'brown', is_active: true }))
})

it('supports native arrow-key selection and restores the saved color when editing', async () => {
  const user = userEvent.setup()
  vehicleTagsAPI.mine.mockResolvedValue({ data: [{ ...own, color: 'teal' }] })
  render(<MyVehicleTagsModal onClose={vi.fn()} />)
  await user.click(await screen.findByRole('button', { name: 'Editar' }))
  expect(screen.getByRole('radio', { name: 'Turquesa' })).toBeChecked()
  expect(screen.getByLabelText('Prévia: Em lavagem, cor Turquesa')).toBeInTheDocument()
  await user.click(screen.getByRole('radio', { name: 'Azul' }))
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('radio', { name: 'Amarelo' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Salvar etiqueta' }))
  await waitFor(() => expect(vehicleTagsAPI.update).toHaveBeenCalledWith(own.id, { name: own.name, color: 'amber', is_active: true }))
})

it('disables the whole palette while saving and preserves the choice on failure', async () => {
  let reject
  vehicleTagsAPI.create.mockImplementation(() => new Promise((_, fail) => { reject = fail }))
  render(<MyVehicleTagsModal onClose={vi.fn()} />)
  await screen.findByRole('button', { name: 'Editar' })
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Conferir veículo' } })
  fireEvent.click(screen.getByRole('radio', { name: 'Índigo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Salvar etiqueta' }))
  screen.getAllByRole('radio').forEach((radio) => expect(radio).toBeDisabled())
  reject(new Error('Falha de conexão'))
  await screen.findByRole('alert')
  expect(screen.getByRole('radio', { name: 'Índigo' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Índigo' })).not.toBeDisabled()
  expect(screen.getByLabelText('Nome')).toHaveValue('Conferir veículo')
})

it('explains archiving and keeps it separate from withdrawing vehicle assignments', async () => {
  render(<MyVehicleTagsModal onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Arquivar', exact: true }))
  expect(screen.getByText(/marcações nos veículos permanecem/)).toBeInTheDocument()
  expect(vehicleTagsAPI.update).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar arquivamento' }))
  await waitFor(() => expect(vehicleTagsAPI.update).toHaveBeenCalledWith('tag-a', { name: own.name, color: 'blue', is_active: false }))
  expect(vehicleTagsAPI.remove).not.toHaveBeenCalled()
})

it('requires explicit confirmation to delete, allows cancellation and clears the editing form', async () => {
  const onChanged = vi.fn()
  render(<MyVehicleTagsModal onClose={vi.fn()} onChanged={onChanged} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir', exact: true }))
  expect(screen.getByRole('group', { name: 'Excluir etiqueta Em lavagem' })).toHaveTextContent('histórico será preservado')
  expect(screen.getByRole('button', { name: 'Cancelar', exact: true })).toHaveFocus()
  expect(vehicleTagsAPI.deleteDefinition).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar', exact: true }))
  expect(screen.queryByRole('button', { name: 'Confirmar exclusão' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Editar', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Excluir', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Excluir', exact: true })).not.toBeInTheDocument())
  expect(vehicleTagsAPI.deleteDefinition).toHaveBeenCalledExactlyOnceWith(own.id)
  expect(screen.getByLabelText('Nome')).toHaveValue('')
  expect(onChanged).toHaveBeenCalledTimes(1)
  expect(vehicleTagsAPI.remove).not.toHaveBeenCalled()
})

it('keeps an in-use label and explains the required withdrawal in the confirmation', async () => {
  vehicleTagsAPI.deleteDefinition.mockRejectedValue({ response: { data: { detail: 'A etiqueta ainda está aplicada. Retire as marcações antes de excluir.' } } })
  render(<MyVehicleTagsModal onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Retire as marcações')
  expect(screen.getByRole('button', { name: 'Excluir', exact: true })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirmar exclusão' })).toBeEnabled()
})

it('prevents duplicate deletion requests and permits deletion of an archived label', async () => {
  let finish
  vehicleTagsAPI.mine.mockResolvedValue({ data: [{ ...own, is_active: false }] })
  vehicleTagsAPI.deleteDefinition.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  render(<MyVehicleTagsModal onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  fireEvent.click(screen.getByRole('button', { name: 'Excluindo…' }))
  expect(vehicleTagsAPI.deleteDefinition).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled()
  finish({ data: { message: 'Excluída' } })
  expect(await screen.findByText('Etiqueta excluída do seu catálogo. O histórico foi preservado.')).toBeInTheDocument()
})

it('shows shared labels, prevents another editor withdrawing them and applies only a personal selection', async () => {
  render(<VehicleTagsManager vehicle={vehicle} user={{ id: 'ana' }} isAdmin={false} onClose={vi.fn()} />)
  await screen.findByText('Aguardando oficina')
  expect(screen.queryByRole('button', { name: 'Retirar', exact: true })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Etiqueta'), { target: { value: own.id } })
  fireEvent.change(screen.getByLabelText('Observação opcional'), { target: { value: 'Limpeza da cabine' } })
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar etiqueta', exact: true }))
  await waitFor(() => expect(vehicleTagsAPI.apply).toHaveBeenCalledWith(vehicle.id, { tag_id: own.id, note: 'Limpeza da cabine' }))
})

it('requires an administrator reason before removing another author label', async () => {
  render(<VehicleTagsManager vehicle={vehicle} user={{ id: 'admin' }} isAdmin onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retirar' }))
  expect(screen.getByRole('button', { name: 'Confirmar retirada' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Conferido com o responsável' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada' }))
  await waitFor(() => expect(vehicleTagsAPI.remove).toHaveBeenCalledWith(vehicle.id, other.id, 'Conferido com o responsável'))
})

it('opens author/date/note details without requiring vehicle edit', async () => {
  render(<VehicleTagBadges tags={[other]} current />)
  fireEvent.click(screen.getByRole('button', { name: /Detalhes da etiqueta Em manutenção, de Carlos/ }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Aplicada por Carlos')
  expect(screen.getByRole('dialog')).toHaveTextContent('Aguardando oficina')
  expect(screen.queryByRole('button', { name: 'Retirar' })).not.toBeInTheDocument()
})

it('filters by selected tag ids with author identification', async () => {
  const changed = vi.fn()
  render(<VehicleTagFilter value={[]} onChange={changed} />)
  fireEvent.click(screen.getByRole('button', { name: 'Etiquetas' }))
  fireEvent.click(await screen.findByRole('checkbox', { name: /Em lavagem/ }))
  expect(changed).toHaveBeenCalledWith([own])
})

it('shows tags within selector options without creating nested action buttons', async () => {
  const changed = vi.fn()
  render(<SearchableSelect options={[{ value: vehicle.id, label: vehicle.plate, tags: [other] }]} value="" onChange={changed} />)
  fireEvent.click(screen.getByRole('button', { name: 'Selecione' }))
  const option = await screen.findByRole('button', { name: /TST0A01.*Etiquetas: Em manutenção/ })
  expect(option.querySelector('button')).toBeNull()
  fireEvent.click(option)
  expect(changed).toHaveBeenCalledWith(vehicle.id)
})

it('refreshes vehicle options when opened and reports a failed refresh', async () => {
  const onOpen = vi.fn().mockRejectedValue(new Error('unavailable'))
  render(<SearchableSelect options={[{ value: vehicle.id, label: vehicle.plate, tags: [other] }]} value="" onOpen={onOpen} />)
  fireEvent.click(screen.getByRole('button', { name: 'Selecione' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('última consulta')
  expect(onOpen).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: /TST0A01.*Etiquetas: Em manutenção/ })).toBeEnabled()
})
