import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { officialBrand } from '../constants/officialBrand'
import { useAuth } from '../context/AuthContext'

const THEME_STORAGE_KEY = 'frota-theme'
const SIDEBAR_STORAGE_KEY = 'frota-sidebar-compact'

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback
  return window.localStorage.getItem(key) ?? fallback
}

function AppIcon({ name, className }) {
  const commonProps = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.9',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }

  switch (name) {
    case 'dashboard':
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="3.5" width="7" height="5" rx="1.6" />
          <rect x="13.5" y="11.5" width="7" height="9" rx="1.6" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
        </svg>
      )
    case 'vehicles':
      return (
        <svg {...commonProps}>
          <path d="M5 15.5v-3.1a2 2 0 0 1 .22-.92l1.38-2.76A2 2 0 0 1 8.39 7.6h7.22a2 2 0 0 1 1.79 1.12l1.38 2.76c.14.28.22.59.22.92v3.1" />
          <path d="M5 15.5h14" />
          <circle cx="8.5" cy="16.8" r="1.7" />
          <circle cx="15.5" cy="16.8" r="1.7" />
        </svg>
      )
    case 'maintenance':
      return (
        <svg {...commonProps}>
          <path d="m14.5 6.5 3 3" />
          <path d="m10 18 7.5-7.5a2.12 2.12 0 1 0-3-3L7 15l-1 4Z" />
          <path d="M13 7 6.5 13.5" />
        </svg>
      )
    case 'drivers':
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
          <path d="M16 8h4" />
          <path d="M18 6v4" />
        </svg>
      )
    case 'users':
      return (
        <svg {...commonProps}>
          <circle cx="8.5" cy="8.5" r="3" />
          <path d="M3.5 18a5 5 0 0 1 10 0" />
          <circle cx="17" cy="9" r="2.2" />
          <path d="M14.8 17.4a4 4 0 0 1 4.4-2.8 4 4 0 0 1 2.3 1.4" />
        </svg>
      )
    case 'audit':
      return (
        <svg {...commonProps}>
          <path d="M12 3.5 5.5 6v5.2c0 4 2.75 7.64 6.5 8.8 3.75-1.16 6.5-4.8 6.5-8.8V6L12 3.5Z" />
          <path d="m9.2 11.8 1.9 1.9 3.7-4.1" />
        </svg>
      )
    case 'search':
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="6.2" />
          <path d="m19 19-3.4-3.4" />
        </svg>
      )
    case 'menu':
      return (
        <svg {...commonProps}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      )
    case 'panel-open':
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="4" width="17" height="16" rx="2.2" />
          <path d="M8 4v16" />
          <path d="m13 12 3 3" />
          <path d="m13 12 3-3" />
        </svg>
      )
    case 'panel-close':
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="4" width="17" height="16" rx="2.2" />
          <path d="M16 4v16" />
          <path d="m11 12 3 3" />
          <path d="m11 12 3-3" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.8v2.1" />
          <path d="M12 19.1v2.1" />
          <path d="m4.9 4.9 1.5 1.5" />
          <path d="m17.6 17.6 1.5 1.5" />
          <path d="M2.8 12h2.1" />
          <path d="M19.1 12h2.1" />
          <path d="m4.9 19.1 1.5-1.5" />
          <path d="m17.6 6.4 1.5-1.5" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...commonProps}>
          <path d="M18.5 14.2A6.8 6.8 0 0 1 9.8 5.5a7.4 7.4 0 1 0 8.7 8.7Z" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...commonProps}>
          <path d="M14 7.5V5.8A2.3 2.3 0 0 0 11.7 3.5H6.8a2.3 2.3 0 0 0-2.3 2.3v12.4a2.3 2.3 0 0 0 2.3 2.3h4.9a2.3 2.3 0 0 0 2.3-2.3v-1.7" />
          <path d="M10.5 12h9" />
          <path d="m16.5 8 3.5 4-3.5 4" />
        </svg>
      )
    default:
      return null
  }
}

function getInitials(name) {
  return (name || 'PMTF')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function Layout() {
  const { user, logout, isAdmin, roleLabel } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [navOpen, setNavOpen] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(() => readStorage(SIDEBAR_STORAGE_KEY, '0') === '1')
  const [darkMode, setDarkMode] = useState(() => readStorage(THEME_STORAGE_KEY, 'light') === 'dark')
  const [searchText, setSearchText] = useState('')

  const navSections = [
    {
      title: 'Visao geral',
      items: [
        { to: '/', label: 'Dashboard', description: 'Resumo da operacao municipal', icon: 'dashboard' },
      ],
    },
    {
      title: 'Operacional',
      items: [
        { to: '/vehicles', label: 'Veiculos', description: 'Cadastro e historico da frota', icon: 'vehicles' },
        { to: '/manutencoes', label: 'Manutencoes', description: 'Custos, oficina e acompanhamento', icon: 'maintenance' },
        { to: '/condutores', label: 'Condutores', description: 'Posse, lotacao e responsaveis', icon: 'drivers' },
      ],
    },
    {
      title: 'Gestao',
      adminOnly: true,
      items: [
        { to: '/users', label: 'Usuarios', description: 'Perfis e niveis de acesso', icon: 'users' },
        { to: '/auditoria', label: 'Auditoria', description: 'Rastreabilidade administrativa', icon: 'audit' },
      ],
    },
  ]

  const visibleSections = navSections.filter((section) => !section.adminOnly || isAdmin)
  const currentItem =
    visibleSections
      .flatMap((section) => section.items)
      .find((item) => item.to === '/'
        ? location.pathname === '/'
        : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)) || visibleSections[0]?.items[0]

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
      <button
        type="button"
        className={`sidebar-scrim${navOpen ? ' is-visible' : ''}`}
        aria-label="Fechar navegacao"
        onClick={() => setNavOpen(false)}
      />

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

          <button
            type="button"
            className="icon-button desktop-only"
            aria-label={sidebarCompact ? 'Expandir menu lateral' : 'Rebater menu lateral'}
            onClick={() => setSidebarCompact((current) => !current)}
          >
            <AppIcon name={sidebarCompact ? 'panel-open' : 'panel-close'} className="app-icon" />
          </button>
        </div>

        <div className="sidebar-scroll">
          {visibleSections.map((section) => (
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
            <button
              type="button"
              className="icon-button mobile-only"
              aria-label={navOpen ? 'Fechar navegacao' : 'Abrir navegacao'}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((current) => !current)}
            >
              <AppIcon name="menu" className="app-icon" />
            </button>

            <div className="topbar-route">
              <span className="topbar-kicker">Frota PMTF . acompanhamento operacional</span>
              <h1 className="page-title topbar-route-title">{currentItem?.label || 'Painel'}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <label className="topbar-search" aria-label="Busca rapida">
              <AppIcon name="search" className="app-icon" />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Buscar veiculo, condutor ou secretaria"
              />
            </label>

            <button
              type="button"
              className="icon-button theme-button"
              aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
              title={darkMode ? 'Modo claro' : 'Modo escuro'}
              onClick={() => setDarkMode((current) => !current)}
            >
              <AppIcon name={darkMode ? 'sun' : 'moon'} className="app-icon" />
            </button>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
