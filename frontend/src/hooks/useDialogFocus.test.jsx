import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import Modal from '../components/Modal'
import { useDialogFocus } from './useDialogFocus'

function Harness() {
  const [open, setOpen] = useState(false)
  const [nested, setNested] = useState(false)
  const [tab, setTab] = useState(0)
  const ref = useDialogFocus(open, () => setOpen(false))
  return <>
    <button onClick={() => setOpen(true)}>Abrir painel</button>
    {open && <aside ref={ref} role="dialog" aria-label="Painel" tabIndex={-1}>
      <button onClick={() => setOpen(false)}>Fechar painel</button>
      <button onClick={() => setTab(tab + 1)}>Mudar aba {tab}</button>
      <button onClick={() => setNested(true)}>Editar</button>
    </aside>}
    <Modal open={nested} title="Edição" onClose={() => setNested(false)}>
      <input aria-label="Nome" />
    </Modal>
  </>
}

it('contém foco, preserva a aba ao renderizar e restaura o acionador ao fechar', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  const trigger = screen.getByRole('button', { name: 'Abrir painel' })
  await user.click(trigger)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Fechar painel' })).toHaveFocus())
  await user.tab({ shift: true })
  expect(screen.getByRole('button', { name: 'Editar' })).toHaveFocus()
  await user.tab()
  expect(screen.getByRole('button', { name: 'Fechar painel' })).toHaveFocus()
  await user.tab()
  await user.keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'Mudar aba 1' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(document.body.style.overflow).not.toBe('hidden')
})

it('deixa o modal sobreposto controlar Escape e devolver foco ao painel', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Abrir painel' }))
  await user.click(screen.getByRole('button', { name: 'Editar' }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveFocus())
  await user.keyboard('{Escape}')
  expect(screen.getByRole('dialog', { name: 'Painel' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Editar' })).toHaveFocus()
  expect(document.body.style.overflow).toBe('hidden')
  await user.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: 'Abrir painel' })).toHaveFocus()
})
