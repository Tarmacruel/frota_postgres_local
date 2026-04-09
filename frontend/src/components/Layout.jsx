import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { to: '/', label: 'Painel', description: 'Visao geral da operacao' },
    { to: '/vehicles', label: 'Veiculos', description: 'Cadastro e historico' },
    { to: '/manutencoes', label: 'Manutencoes', description: 'Oficina e custos' },
    { to: '/condutores', label: 'Condutores', description: 'Posse e historico' },
  ]

  if (user?.role === 'ADMIN') {
    navItems.push({ to: '/users', label: 'Usuarios', description: 'Perfis e acessos' })
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-block">
          <div className="brand-mark">PM</div>
          <div className="brand-copy">
            <strong>Frota PMTF</strong>
            <span>Gerenciamento de veiculos, lotacao e acesso institucional em um unico ambiente.</span>
          </div>
        </div>

        <nav className="nav-group" aria-label="Navegacao principal">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span>{item.label}</span>
              <span className="muted">{location.pathname === item.to ? 'aberto' : item.description.split(' ')[0]}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
            <span>Perfil {user?.role === 'ADMIN' ? 'Administrador' : 'Padrao'}</span>
          </div>
          <button className="app-button" onClick={handleLogout}>Encerrar sessao</button>
        </div>
      </aside>

      <div className="content-shell">
        <header className="app-topbar">
          <div>
            <h1 className="page-title">Operacao da frota municipal</h1>
            <p className="page-copy">
              Acompanhe disponibilidade, manutencao, lotacao e condutores com um fluxo mais claro, rapido e institucional.
            </p>
          </div>
          <div className="user-chip">
            <strong>Ambiente local</strong>
            <span>Backend em 8001 e frontend em 5175</span>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
