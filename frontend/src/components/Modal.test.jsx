import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
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
  it('mantém resumo no ciclo de Tab e exclui controles dentro de details fechado', async () => {
    const user = userEvent.setup()
    render(<Modal open title="Histórico" onClose={() => {}}>
      <details><summary>Último resumo</summary><button>Controle oculto</button></details>
    </Modal>)
    const summary = screen.getByText('Último resumo')
    await waitFor(() => expect(summary).toHaveFocus())
    await user.tab()
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(summary).toHaveFocus()
  })
  it('devolve foco ao destino alternativo quando o acionador é removido', async () => {
    function RemovalHarness() {
      const fallback = useRef(null)
      const [open, setOpen] = useState(false)
      const [visible, setVisible] = useState(true)
      return <>
        <section tabIndex={-1} ref={fallback} aria-label="Fila de casos">
          {visible ? <button onClick={() => setOpen(true)}>Abrir caso</button> : null}
        </section>
        <Modal open={open} title="Caso" returnFocusRef={fallback} onClose={() => setOpen(false)}>
          <button onClick={() => setVisible(false)}>Tratar e retirar da fila</button>
        </Modal>
      </>
    }
    const user = userEvent.setup()
    render(<RemovalHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir caso' }))
    await user.click(screen.getByRole('button', { name: 'Tratar e retirar da fila' }))
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.getByRole('region', { name: 'Fila de casos' })).toHaveFocus()
  })
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
