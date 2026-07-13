import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import PossessionMaintenancePage from './PossessionMaintenancePage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/posses']}>
      <Routes>
        <Route path="/posses" element={<PossessionMaintenancePage />} />
        <Route path="/" element={<h1>Painel principal</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PossessionMaintenancePage', () => {
  it('abre o aviso com a previsão e mantém os demais módulos disponíveis', async () => {
    renderPage()

    const dialog = screen.getByRole('dialog', { name: 'Módulo de posses em atualização' })
    const dashboardLink = within(dialog).getByRole('link', { name: 'Continuar no painel' })
    expect(within(dialog).getByText('hoje, 13/07')).toBeInTheDocument()
    expect(within(dialog).getByText(/todas as outras funcionalidades do sistema/i)).toBeInTheDocument()
    expect(dashboardLink).toHaveAttribute('href', '/')
    await waitFor(() => expect(dashboardLink).toHaveFocus())
  })

  it('mantém um estado informativo persistente depois que o modal é fechado', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'O módulo de posses retorna em breve' })).toBeInTheDocument()
    expect(screen.getByText('As demais funcionalidades do sistema continuam disponíveis normalmente.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ver aviso novamente' }))
    expect(screen.getByRole('dialog', { name: 'Módulo de posses em atualização' })).toBeInTheDocument()
  })

  it('permite sair da área em manutenção e voltar ao painel', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('link', { name: 'Continuar no painel' }))

    expect(screen.getByRole('heading', { name: 'Painel principal' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
