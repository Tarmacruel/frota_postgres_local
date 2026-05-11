import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { officialBrand } from '../constants/officialBrand'
import { useAuth } from '../context/AuthContext'
import { AppIcon, getInitials } from './AppIcon'
import SearchOverlay from './SearchOverlay'
import Modal from './Modal'
import { adminNotificationsAPI } from '../api/adminNotifications'

const THEME_STORAGE_KEY = 'frota-theme'
const SIDEBAR_STORAGE_KEY = 'frota-sidebar-compact'

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback
  return window.localStorage.getItem(key) ?? fallback
}

export default function Layout() {
  const { user, logout, changePassword, mustChangePassword, isAdmin, canView, roleLabel } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const passwordChangeRequired = Boolean(mustChangePassword)

  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(() => readStorage(SIDEBAR_STORAGE_KEY, '0') === '1')
  const [darkMode, setDarkMode] = useState(() => readStorage(THEME_STORAGE_KEY, 'light') === 'dark')
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [passwordFeedback, setPasswordFeedback] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [adminNotifications, setAdminNotifications] = useState([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)

  const navSections = useMemo(() => {
    const sections = [
      {
        title: 'Visao geral',
        items: [
          { to: '/', label: 'Início', description: 'Hub operacional da frota', icon: 'dashboard' },
        ],
      },
      {
        title: 'Operacional',
        items: [
          { to: '/vehicles', label: 'Veículos', description: 'Cadastro, consulta e histórico', icon: 'vehicles' },
          { to: '/posses', label: 'Posses', description: 'Posse, alocação e responsáveis', icon: 'drivers' },
          { to: '/condutores', label: 'Condutores', description: 'Base reutilizável de motoristas', icon: 'users' },
          { to: '/manutencoes', label: 'Manutenções', description: 'Custos, serviços e oficina', icon: 'maintenance' },
          { to: '/sinistros', label: 'Sinistros', description: 'Ocorrências, BO e prejuízos', icon: 'audit' },
          { to: '/multas', label: 'Multas', description: 'Autos, vencimentos e pagamentos', icon: 'catalog' },
          ...(canView('fuel_supplies') ? [{ to: '/abastecimentos', label: 'Abastecimentos', description: 'Ordens, histórico e alertas de consumo', icon: 'maintenance' }] : []),
          ...(canView('fuel_supply_orders') ? [{ to: '/ordens-abastecimento', label: 'Ordens abertas', description: 'Confirmação das ordens pendentes', icon: 'maintenance' }] : []),
        ],
      },
    ]

    const moduleByRoute = {
      '/vehicles': 'vehicles',
      '/posses': 'possession',
      '/condutores': 'drivers',
      '/manutencoes': 'maintenance',
      '/sinistros': 'claims',
      '/multas': 'fines',
      '/abastecimentos': 'fuel_supplies',
      '/ordens-abastecimento': 'fuel_supply_orders',
    }
    sections[1].items = sections[1].items.filter((item) => canView(moduleByRoute[item.to]))
    if (sections[1].items.length === 0) sections.splice(1, 1)

    if (isAdmin || canView('master_data') || canView('fuel_stations') || canView('analytics')) {
      const managementItems = []
      if (canView('master_data')) {
        managementItems.push({ to: '/cadastros', label: 'Cadastros', description: 'Órgãos, departamentos e lotações', icon: 'catalog' })
      }
      if (canView('fuel_stations')) {
        managementItems.push({ to: '/postos', label: 'Postos', description: 'Cadastro de postos e vínculos', icon: 'catalog' })
      }
      if (canView('analytics')) {
        managementItems.push({ to: '/analytics', label: 'Analytics', description: 'BI operacional da frota', icon: 'dashboard' })
      }
      if (isAdmin) {
        managementItems.push(
          { to: '/users', label: 'Usuários', description: 'Perfis e níveis de acesso', icon: 'users' },
          { to: '/auditoria', label: 'Auditoria', description: 'Rastreabilidade administrativa', icon: 'audit' },
        )
      }
      sections.push({
        title: 'Gestão',
        items: managementItems,
      })
    }

    return sections
  }, [isAdmin, canView])

  const mobileTabs = navSections.flatMap((section) => section.items).filter((item) =>
    ['/', '/vehicles', '/manutencoes', '/condutores', '/ordens-abastecimento'].includes(item.to),
  ).slice(0, 4)

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
      if (passwordChangeRequired) return
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
  }, [passwordChangeRequired])

  useEffect(() => {
    if (!passwordChangeRequired) return
    setSearchOpen(false)
    setPasswordModalOpen(true)
  }, [passwordChangeRequired])


  useEffect(() => {
    if (!isAdmin || passwordChangeRequired) return

    let mounted = true
    async function loadUnreadCount() {
      try {
        const { data } = await adminNotificationsAPI.unreadCount()
        if (mounted) {
          setUnreadNotifications(Number(data.unread || 0))
        }
      } catch {
        if (mounted) setUnreadNotifications(0)
      }
    }

    loadUnreadCount()
    const timer = window.setInterval(loadUnreadCount, 45000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [isAdmin, passwordChangeRequired])

  async function openNotificationsCenter() {
    if (!isAdmin || passwordChangeRequired) return
    setNotificationsOpen(true)
    try {
      const { data } = await adminNotificationsAPI.list({ limit: 80 })
      setAdminNotifications(data)
      const unread = data.filter((item) => !item.read_at).length
      setUnreadNotifications(unread)
    } catch {
      setAdminNotifications([])
    }
  }

  async function markNotificationAsRead(notificationId) {
    try {
      const { data } = await adminNotificationsAPI.markAsRead(notificationId)
      setUnreadNotifications(Number(data.unread || 0))
      setAdminNotifications((current) => current.map((item) => (item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item)))
    } catch {
      return
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  async function handlePasswordChange(event) {
    event.preventDefault()
    setPasswordFeedback('')
    try {
      if (passwordForm.new_password !== passwordForm.confirm_password) {
        setPasswordFeedback('A confirmação da nova senha não confere.')
        return
      }
      await changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      })
      setPasswordFeedback('Senha alterada com sucesso.')
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
      setPasswordModalOpen(false)
    } catch {
      setPasswordFeedback('Não foi possível alterar a senha. Confira a senha atual.')
    }
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
      <SearchOverlay open={!passwordChangeRequired && searchOpen} onClose={() => setSearchOpen(false)} onSelect={(result) => navigate(result.route)} />

      <button type="button" className={`sidebar-scrim${navOpen ? ' is-visible' : ''}`} aria-label="Fechar navegação" onClick={() => setNavOpen(false)} />

      <aside className={`app-sidebar${navOpen ? ' is-open' : ''}${sidebarCompact ? ' is-compact' : ''}`}>
        <div className="sidebar-head">
          <div className="brand-block">
            <div className="brand-mark brand-mark-official">
              <img src={officialBrand.logoPath} alt="Brasão oficial da Prefeitura Municipal de Teixeira de Freitas" />
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
            <button type="button" className="icon-button account-action" aria-label="Alterar senha" onClick={() => setPasswordModalOpen(true)}>
              <AppIcon name="users" className="app-icon" />
            </button>
            <button type="button" className="icon-button account-action" aria-label="Encerrar sessao" onClick={handleLogout}>
              <AppIcon name="logout" className="app-icon" />
            </button>
          </div>
        </div>
      </aside>

      <div className="content-shell">
        <header className="app-topbar">
          <div className="topbar-leading">
            <button type="button" className="icon-button mobile-only" aria-label={navOpen ? 'Fechar navegação' : 'Abrir navegação'} aria-expanded={navOpen} onClick={() => setNavOpen((current) => !current)}>
              <AppIcon name="menu" className="app-icon" />
            </button>

            <div className="topbar-route">
              <span className="topbar-kicker">Frota PMTF . acompanhamento operacional</span>
              <h1 className="page-title topbar-route-title">{currentItem?.label || 'Início'}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="topbar-search-trigger"
              aria-label="Abrir busca global"
              onClick={() => {
                if (!passwordChangeRequired) setSearchOpen(true)
              }}
              onFocus={() => {
                if (!passwordChangeRequired) setSearchOpen(true)
              }}
              disabled={passwordChangeRequired}
            >
              <span className="topbar-search-copy">
                <AppIcon name="search" className="app-icon" />
                <span>Buscar veículo, posse ou manutenção</span>
              </span>
              <span className="topbar-search-hint">Ctrl K</span>
            </button>


            {isAdmin && !passwordChangeRequired ? (
              <button
                type="button"
                className="icon-button theme-button"
                aria-label="Abrir central de notificações"
                title="Central de notificações"
                onClick={openNotificationsCenter}
              >
                <AppIcon name="audit" className="app-icon" />
                {unreadNotifications > 0 ? <span className="badge-counter">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span> : null}
              </button>
            ) : null}
            <button type="button" className="icon-button theme-button" aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'} title={darkMode ? 'Modo claro' : 'Modo escuro'} onClick={() => setDarkMode((current) => !current)}>
              <AppIcon name={darkMode ? 'sun' : 'moon'} className="app-icon" />
            </button>
          </div>
        </header>

        <main className="app-main">
          {passwordChangeRequired ? (
            <div className="surface-panel">
              <div className="empty-state">Altere sua senha provisória para continuar usando o sistema.</div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <nav className="mobile-bottom-bar" aria-label="Navegação mobile">
        {mobileTabs.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `mobile-bottom-link${isActive ? ' active' : ''}`}>
            <AppIcon name={item.icon} className="app-icon" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <Modal open={notificationsOpen} title="Central de notificações" description="Ocorrências administrativas de divergência de quilometragem entre posses." onClose={() => setNotificationsOpen(false)}>
        {!isAdmin ? <div className="alert alert-info">Acesso restrito a administradores.</div> : null}
        {isAdmin && adminNotifications.length === 0 ? <div className="empty-state">Nenhuma notificação registrada até o momento.</div> : null}
        {isAdmin && adminNotifications.length > 0 ? (
          <div className="stack" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {adminNotifications.map((notification) => (
              <div key={notification.id} className="surface-panel panel-nested">
                <div className="stack">
                  <strong>{notification.title}</strong>
                  <span>{notification.message}</span>
                  <span className="muted">{new Date(notification.created_at).toLocaleString('pt-BR')}</span>
                </div>
                {!notification.read_at ? (
                  <div className="actions-inline" style={{ marginTop: 8 }}>
                    <button className="mini-button" type="button" onClick={() => markNotificationAsRead(notification.id)}>Marcar como lida</button>
                  </div>
                ) : <span className="muted">Lida</span>}
              </div>
            ))}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={passwordModalOpen || passwordChangeRequired}
        title={passwordChangeRequired ? 'Troca de senha obrigatória' : 'Alterar senha'}
        description={passwordChangeRequired ? 'Sua senha atual é provisória. Defina uma nova senha para liberar o acesso aos módulos.' : 'Defina uma nova senha para seu acesso.'}
        onClose={() => {
          if (!passwordChangeRequired) setPasswordModalOpen(false)
        }}
        canClose={!passwordChangeRequired}
      >
        <form onSubmit={handlePasswordChange} className="stack">
          <input className="app-input" type="password" placeholder="Senha atual" value={passwordForm.current_password} onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })} required />
          <input className="app-input" type="password" placeholder="Nova senha (mínimo 8 caracteres)" value={passwordForm.new_password} onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })} required />
          <input className="app-input" type="password" placeholder="Confirmar nova senha" value={passwordForm.confirm_password} onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })} required />
          {passwordFeedback ? <div className="alert alert-info">{passwordFeedback}</div> : null}
          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit">Salvar senha</button>
            {passwordChangeRequired ? <button className="ghost-button" type="button" onClick={handleLogout}>Sair</button> : null}
          </div>
        </form>
      </Modal>
    </div>
  )
}
