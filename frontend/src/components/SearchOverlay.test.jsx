import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import SearchOverlay from './SearchOverlay'

vi.mock('../api/search', () => ({ searchAPI: { query: vi.fn() } }))

function Harness() {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" onClick={() => setOpen(true)}>Abrir busca</button>
    <SearchOverlay open={open} onClose={() => setOpen(false)} onSelect={() => {}} />
    <button type="button">Próxima ação</button>
  </>
}

it('mantém Tab e Shift+Tab na busca e restaura o foco com Escape sem reabrir', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  const trigger = screen.getByRole('button', { name: 'Abrir busca' })
  await user.click(trigger)
  const input = screen.getByRole('searchbox')
  await waitFor(() => expect(input).toHaveFocus())
  await user.tab({ shift: true })
  expect(screen.getByRole('button', { name: 'Fechar busca' })).toHaveFocus()
  await user.tab()
  expect(input).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  await user.tab()
  expect(screen.getByRole('button', { name: 'Próxima ação' })).toHaveFocus()
})
