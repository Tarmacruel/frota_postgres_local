import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import FuelWorkspaceRoute, { FuelOpenOrdersRedirect } from './FuelWorkspaceRoute'

const access = vi.hoisted(() => ({ modules: new Set(), user: { role: 'VIEWER' } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: access.user, loading: false,
  canView: (module) => access.modules.has(module), can: (module, action) => action === 'view' && access.modules.has(module) }) }))
function Location() { const { pathname, search, hash } = useLocation(); return <output data-testid="destination">{pathname+search+hash}</output> }
function mount(path='/abastecimentos') {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/abastecimentos" element={<FuelWorkspaceRoute><span>Workspace autorizado</span><Location /></FuelWorkspaceRoute>} />
    <Route path="/ordens-abastecimento" element={<FuelOpenOrdersRedirect />} />
    <Route path="/unauthorized" element={<span>Acesso negado</span>} />
    <Route path="/login" element={<span>Entrar</span>} />
  </Routes></MemoryRouter>)
}
beforeEach(() => { access.modules=new Set();access.user={role:'VIEWER'} })
it.each(['fuel_supplies','fuel_supply_orders'])('preserva o acesso existente de %s à entrada unificada', (module) => {
  access.modules.add(module);mount();expect(screen.getByText('Workspace autorizado')).toBeInTheDocument()
})
it('recusa quem não possui acesso a nenhuma das duas operações', () => {
  mount();expect(screen.getByText('Acesso negado')).toBeInTheDocument()
})
it('continua exigindo autenticação', () => {
  access.user=null;access.modules.add('fuel_supply_orders');mount();expect(screen.getByText('Entrar')).toBeInTheDocument()
})
it('redireciona o endereço antigo preservando assinatura, indicador e contexto', () => {
  access.modules.add('fuel_supply_orders')
  mount('/ordens-abastecimento?focus=ordem-teste&indicator=due_today&origem=assinatura#detalhe')
  const target=new URL(screen.getByTestId('destination').textContent,'https://test.invalid')
  expect(target.pathname).toBe('/abastecimentos');expect(target.searchParams.get('view')).toBe('open')
  expect(target.searchParams.get('focus')).toBe('ordem-teste');expect(target.searchParams.get('open_indicator')).toBe('due_today')
  expect(target.searchParams.has('indicator')).toBe(false);expect(target.searchParams.get('origem')).toBe('assinatura')
  expect(target.hash).toBe('#detalhe')
})
