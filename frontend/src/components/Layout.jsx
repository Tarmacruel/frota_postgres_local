import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { officialBrand } from '../constants/officialBrand'
import { useAuth } from '../context/AuthContext'
import { AppIcon, getInitials } from './AppIcon'
import SearchOverlay from './SearchOverlay'

const THEME_STORAGE_KEY = 'frota-theme'
const SIDEBAR_STORAGE_KEY = 'frota-sidebar-compact'

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback
  return window.localStorage.getItem(key) ?? fallback
}

export default function Layout() {
  const { user, logout, isAdmin, roleLabel } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(() => readStorage(SIDEBAR_STORAGE_KEY, '0') === '1')
  const [darkMode, setDarkMode] = useState(() => readStorage(THEME_STORAGE_KEY, 'light') === 'dark')

  const navSections = useMemo(() => {
    const sections = [
      {
        title: 'Visao geral',
        items: [
          { to: '/', label: 'Inicio', description: 'Hub operacional da frota', icon: 'dashboard' },
        ],
      },
      {
        title: 'Operacional',
        items: [
          { to: '/cadastros', label: 'Cadastros', description: 'Orgaos, departamentos e lotacoes', icon: 'catalog' },
          { to: '/vehicles', label: 'Veiculos', description: 'Cadastro, consulta e historico', icon: 'vehicles' },
          { to: '/posses', label: 'Posses', description: 'Posse, alocacao e responsaveis', icon: 'drivers' },
          { to: '/condutores', label: 'Condutores', description: 'Base reutilizavel de motoristas', icon: 'users' },
          { to: '/manutencoes', label: 'Manutencoes', description: 'Custos, servicos e oficina', icon: 'maintenance' },
          { to: '/sinistros', label: 'Sinistros', description: 'Ocorrencias, BO e prejuizos', icon: 'audit' },
        ],
      },
    ]

    if (isAdmin) {
      sections.push({
        title: 'Gestao',
        items: [
          { to: '/users', label: 'Usuarios', description: 'Perfis e niveis de acesso', icon: 'users' },
          { to: '/auditoria', label: 'Auditoria', description: 'Rastreabilidade administrativa', icon: 'audit' },
        ],
      })
    }

    return sections
  }, [isAdmin])

  const mobileTabs = navSections.flatMap((section) => section.items).filter((item) =>
    ['/', '/vehicles', '/manutencoes', '/condutores'].includes(item.to),
  )

  const currentItem =
    navSections
      .flatMap((section) => section.items)
      .find((item) => (item.to === '/' ? location.pathname === '/' : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))) ||
    navSections[0]?.items[0]

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCompact ? '1' : '0')
  }, [sidebarCompact])

  useEffect(() => {
    const nextTheme = darkMode ? 'dark' : 'light'
    document.documentElement.dataset.theme = nextTheme
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
  }, [darkMode])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target
      const tagName = target?.tagName?.toLowerCase()
      const isTypingTarget = tagName === 'input' || tagName === 'textarea' || target?.isContentEditable
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      } else if (!isTypingTarget && event.key === '/') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  function renderNavLink(item) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        title={item.label}
        className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      >
        <span className="nav-icon" aria-hidden="true">
          <AppIcon name={item.icon} className="app-icon" />
        </span>
        <span className="nav-text">
          <span className="nav-label">{item.label}</span>
          <span className="nav-meta">{item.description}</span>
        </span>
      </NavLink>
    )
  }

  return (
    <div className={`app-shell${sidebarCompact ? ' sidebar-compact' : ''}`}>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={(result) => navigate(result.route)} />

      <button type="button" className={`sidebar-scrim${navOpen ? ' is-visible' : ''}`} aria-label="Fechar navegacao" onClick={() => setNavOpen(false)} />

      <aside className={`app-sidebar${navOpen ? ' is-open' : ''}${sidebarCompact ? ' is-compact' : ''}`}>
        <div className="sidebar-head">
          <div className="brand-block">
            <div className="brand-mark brand-mark-official">
              <img src={officialBrand.logoPath} alt="Brasao oficial da Prefeitura Municipal de Teixeira de Freitas" />
            </div>
            <div className="brand-copy">
              <strong className="brand-name">{officialBrand.systemName}</strong>
              <span className="brand-subtitle">Teixeira de Freitas</span>
            </div>
          </div>
          <button type="button" className="icon-button desktop-only" aria-label={sidebarCompact ? 'Expandir menu lateral' : 'Rebater menu lateral'} onClick={() => setSidebarCompact((current) => !current)}>
            <AppIcon name={sidebarCompact ? 'panel-open' : 'panel-close'} className="app-icon" />
          </button>
        </div>

        <div className="sidebar-scroll">
          {navSections.map((section) => (
            <div className="nav-section" key={section.title}>
              <div className="nav-section-title">{section.title}</div>
              <nav className="nav-group" aria-label={section.title}>
                {section.items.map(renderNavLink)}
              </nav>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="account-card">
            <div className="account-avatar">{getInitials(user?.name)}</div>
            <div className="account-meta">
              <strong>{user?.name || officialBrand.systemName}</strong>
              <span>{roleLabel}</span>
            </div>
            <button type="button" className="icon-button account-action" aria-label="Encerrar sessao" onClick={handleLogout}>
              <AppIcon name="logout" className="app-icon" />
            </button>
          </div>
        </div>
      </aside>

      <div className="content-shell">
        <header className="app-topbar">
          <div className="topbar-leading">
            <button type="button" className="icon-button mobile-only" aria-label={navOpen ? 'Fechar navegacao' : 'Abrir navegacao'} aria-expanded={navOpen} onClick={() => setNavOpen((current) => !current)}>
              <AppIcon name="menu" className="app-icon" />
            </button>

            <div className="topbar-route">
              <span className="topbar-kicker">Frota PMTF . acompanhamento operacional</span>
              <h1 className="page-title topbar-route-title">{currentItem?.label || 'Inicio'}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <button type="button" className="topbar-search-trigger" aria-label="Abrir busca global" onClick={() => setSearchOpen(true)} onFocus={() => setSearchOpen(true)}>
              <span className="topbar-search-copy">
                <AppIcon name="search" className="app-icon" />
                <span>Buscar veiculo, posse ou manutencao</span>
              </span>
              <span className="topbar-search-hint">Ctrl K</span>
            </button>

            <button type="button" className="icon-button theme-button" aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'} title={darkMode ? 'Modo claro' : 'Modo escuro'} onClick={() => setDarkMode((current) => !current)}>
              <AppIcon name={darkMode ? 'sun' : 'moon'} className="app-icon" />
            </button>
          </div>
        </header>

        <main className="app-main">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-bottom-bar" aria-label="Navegacao mobile">
        {mobileTabs.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `mobile-bottom-link${isActive ? ' active' : ''}`}>
            <AppIcon name={item.icon} className="app-icon" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
