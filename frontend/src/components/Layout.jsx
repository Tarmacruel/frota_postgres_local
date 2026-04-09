import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { officialBrand } from '../constants/officialBrand'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const currentHost = typeof window !== 'undefined' ? window.location.host : 'localhost'
  const isPublishedHost = currentHost.includes('frota.sirel.com.br')

  const navItems = [
    { to: '/', label: 'Painel', description: 'Visao geral da operacao' },
    { to: '/vehicles', label: 'Veiculos', description: 'Cadastro e historico' },
    { to: '/manutencoes', label: 'Manutencoes', description: 'Oficina e custos' },
    { to: '/condutores', label: 'Condutores', description: 'Posse e historico' },
  ]

  if (user?.role === 'ADMIN') {
    navItems.push({ to: '/users', label: 'Usuarios', description: 'Perfis e acessos' })
  }

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className={`app-sidebar${navOpen ? ' is-open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand-block">
            <div className="brand-mark brand-mark-official">
              <img src={officialBrand.logoPath} alt="Brasao oficial da Prefeitura Municipal de Teixeira de Freitas" />
            </div>
            <div className="brand-copy">
              <strong>{officialBrand.systemName}</strong>
              <span>Gestao oficial da frota municipal com identidade institucional da Prefeitura de Teixeira de Freitas.</span>
            </div>
          </div>
          <button
            type="button"
            className="nav-toggle"
            aria-label={navOpen ? 'Fechar navegacao' : 'Abrir navegacao'}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((current) => !current)}
          >
            {navOpen ? 'Fechar' : 'Menu'}
          </button>
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
              Acompanhe disponibilidade, manutencao, lotacao e condutores com um fluxo oficial, claro e pronto para publicacao em frota.sirel.com.br.
            </p>
          </div>
          <div className="user-chip">
            <strong>{isPublishedHost ? 'Subdominio publicado' : 'Ambiente local'}</strong>
            <span>{currentHost}</span>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
