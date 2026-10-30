import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../api/client', () => ({ default: api }))
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { id: 'qa', name: 'Usuário fictício', role: 'SUPERUSER' } }) })
function Probe() {
  const { user, loading, logout } = useAuth()
  return <><p>{loading ? 'Carregando' : 'Pronto'}</p><p>{user?.name || 'Sem sessão'}</p>
    <button onClick={async () => { try { await logout() } catch { /* The caller presents the actionable error. */ } }}>Sair</button></>
}
it('destrava a tela e preserva a sessão quando o encerramento falha', async () => {
  api.post.mockRejectedValue(new Error('offline'))
  const actor = userEvent.setup(); render(<AuthProvider><Probe /></AuthProvider>)
  await screen.findByText('Pronto'); await actor.click(screen.getByRole('button', { name: 'Sair' }))
  expect(await screen.findByText('Pronto')).toBeInTheDocument()
  expect(screen.getByText('Usuário fictício')).toBeInTheDocument()
})
