import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import Modal from './Modal'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Abrir diálogo</button>
      <Modal open={open} title="Diálogo acessível" description="Teste de foco" onClose={() => setOpen(false)}>
        <label htmlFor="modal-field">Campo inicial</label>
        <input id="modal-field" />
        <button type="button">Última ação</button>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('controla foco, fecha por Escape e devolve o foco ao acionador', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Abrir diálogo' })

    await user.click(trigger)
    const field = screen.getByRole('textbox', { name: 'Campo inicial' })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
