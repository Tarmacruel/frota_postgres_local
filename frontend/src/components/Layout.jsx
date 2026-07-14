import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { officialBrand } from '../constants/officialBrand'
import { useAuth } from '../context/AuthContext'
import { AppIcon, getInitials } from './AppIcon'
import SearchOverlay from './SearchOverlay'
import Modal from './Modal'
import { adminNotificationsAPI } from '../api/adminNotifications'
import { documentSignaturesAPI } from '../api/documentSignatures'

const THEME_STORAGE_KEY = 'frota-theme'
const SIDEBAR_STORAGE_KEY = 'frota-sidebar-compact'

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback
  return window.localStorage.getItem(key) ?? fallback
}

export default function Layout() {
  const { user, logout, changePassword, registerCpf, mustChangePassword, mustRegisterCpf, isAdmin, canView, roleLabel } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const passwordChangeRequired = Boolean(mustChangePassword)
  const cpfRegistrationRequired = Boolean(mustRegisterCpf) && !passwordChangeRequired
  const accessBlocked = passwordChangeRequired || cpfRegistrationRequired
  const mainRef = useRef(null)

  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(() => readStorage(SIDEBAR_STORAGE_KEY, '0') === '1')
  const [darkMode, setDarkMode] = useState(() => readStorage(THEME_STORAGE_KEY, 'light') === 'dark')
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [passwordFeedback, setPasswordFeedback] = useState('')
  const [cpfForm, setCpfForm] = useState({ cpf: '' })
  const [cpfFeedback, setCpfFeedback] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [adminNotifications, setAdminNotifications] = useState([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [signatureRequestsOpen, setSignatureRequestsOpen] = useState(false)
  const [pendingSignatureRequests, setPendingSignatureRequests] = useState([])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    document.body.classList.add('internal-app-active')
    return () => document.body.classList.remove('internal-app-active')
  }, [])

  const navSections = useMemo(() => {
    const sections = [
      {
        title: 'Visao geral',
        items: [
          { to: '/', label: 'Início', description: 'Resumo', icon: 'dashboard' },
        ],
      },
      {
        title: 'Operacional',
        items: [
          { to: '/vehicles', label: 'Veículos', description: 'Frota', icon: 'vehicles' },
          { to: '/posses', label: 'Posses', description: 'Responsáveis', icon: 'drivers' },
          { to: '/condutores', label: 'Condutores', mobileLabel: 'Condut.', description: 'Motoristas', icon: 'users' },
          { to: '/manutencoes', label: 'Manutenções', description: 'Custos', icon: 'maintenance' },
          { to: '/sinistros', label: 'Sinistros', description: 'Ocorrências', icon: 'audit' },
          { to: '/multas', label: 'Multas', description: 'Autos', icon: 'catalog' },
          ...(canView('fuel_supplies') ? [{ to: '/abastecimentos', label: 'Abastecimentos', description: 'Consumo', icon: 'maintenance' }] : []),
          ...(canView('fuel_supply_orders') ? [{ to: '/ordens-abastecimento', label: 'Ordens abertas', mobileLabel: 'Ordens', mobileAriaLabel: 'Ordens de abastecimento', description: 'Pendentes', icon: 'maintenance' }] : []),
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

    if (isAdmin || canView('master_data') || canView('fuel_stations') || canView('payment_processes') || canView('analytics') || canView('data_imports')) {
      const managementItems = []
      if (canView('master_data')) {
        managementItems.push({ to: '/cadastros', label: 'Cadastros', description: 'Lotação', icon: 'catalog' })
      }
      if (canView('fuel_stations')) {
        managementItems.push({ to: '/postos', label: 'Postos', description: 'Credenciados', icon: 'catalog' })
      }
      if (canView('payment_processes')) {
        managementItems.push({ to: '/processos-pagamento', label: 'Processos de pagamento', description: 'Pagamentos', icon: 'catalog' })
      }
      if (canView('analytics')) {
        managementItems.push({ to: '/analytics', label: 'Análises', description: 'BI', icon: 'dashboard' })
      }
      if (canView('data_imports')) {
        managementItems.push({ to: '/importacao-dados', label: 'Importar/Exportar', description: 'Importação', icon: 'catalog' })
      }
      if (isAdmin) {
        managementItems.push(
          { to: '/users', label: 'Usuários', description: 'Perfis', icon: 'users' },
          { to: '/auditoria', label: 'Auditoria', description: 'Logs', icon: 'audit' },
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
    ['/', '/vehicles', '/posses', '/condutores', '/ordens-abastecimento'].includes(item.to),
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
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      mainRef.current?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' })
      document.querySelector('.app-main')?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' })
      document.querySelector('.content-shell')?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' })
    }

    resetScroll()
    const frame = window.requestAnimationFrame(resetScroll)
    return () => window.cancelAnimationFrame(frame)
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
      if (accessBlocked) return
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
  }, [accessBlocked])

  useEffect(() => {
    if (!passwordChangeRequired) return
    setSearchOpen(false)
    setPasswordModalOpen(true)
  }, [passwordChangeRequired])

  useEffect(() => {
    if (!cpfRegistrationRequired) return
    setSearchOpen(false)
  }, [cpfRegistrationRequired])


  useEffect(() => {
    if (!isAdmin || accessBlocked) return

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
  }, [isAdmin, accessBlocked])

  useEffect(() => {
    if (accessBlocked) return

    let mounted = true
    async function loadPendingSignatures() {
      try {
        const { data } = await documentSignaturesAPI.pending()
        if (mounted) setPendingSignatureRequests(Array.isArray(data) ? data : [])
      } catch {
        if (mounted) setPendingSignatureRequests([])
      }
    }

    loadPendingSignatures()
    const timer = window.setInterval(loadPendingSignatures, 45000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [accessBlocked])

  async function openNotificationsCenter() {
    if (!isAdmin || accessBlocked) return
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

  async function declinePendingSignature(requestId) {
    try {
      await documentSignaturesAPI.declineRequest(requestId)
      setPendingSignatureRequests((current) => current.filter((item) => item.id !== requestId))
    } catch {
      return
    }
  }

  function openPendingSignature(request) {
    const document = request.document || {}
    setSignatureRequestsOpen(false)
    if (document.document_type === 'FUEL_SUPPLY_ORDER') {
      navigate('/ordens-abastecimento')
      return
    }
    if (document.source_id) {
      navigate(`/posses?focus=${document.source_id}`)
      return
    }
    navigate('/posses')
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

  async function handleCpfRegistration(event) {
    event.preventDefault()
    setCpfFeedback('')
    try {
      await registerCpf({ cpf: cpfForm.cpf })
      setCpfForm({ cpf: '' })
      setCpfFeedback('')
    } catch {
      setCpfFeedback('Nao foi possivel registrar o CPF. Confira o numero informado.')
    }
  }

  function renderNavLink(item) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        title={item.description}
        aria-label={`${item.label}. ${item.description}`}
        data-tooltip={item.description}
        className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      >
        <span className="nav-icon" aria-hidden="true">
          <AppIcon name={item.icon} className="app-icon" />
        </span>
        <span className="nav-text">
          <span className="nav-label">{item.label}</span>
        </span>
      </NavLink>
    )
  }

  return (
    <div className={`app-shell${sidebarCompact ? ' sidebar-compact' : ''}`}>
      <SearchOverlay open={!accessBlocked && searchOpen} onClose={() => setSearchOpen(false)} onSelect={(result) => navigate(result.route)} />

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
            <button type="button" className="icon-button account-action" aria-label="Encerrar sessão" onClick={handleLogout}>
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
                if (!accessBlocked) setSearchOpen(true)
              }}
              onFocus={() => {
                if (!accessBlocked) setSearchOpen(true)
              }}
              disabled={accessBlocked}
            >
              <span className="topbar-search-copy">
                <AppIcon name="search" className="app-icon" />
                <span>Busca global</span>
              </span>
              <span className="topbar-search-hint">Ctrl K</span>
            </button>


            {isAdmin && !accessBlocked ? (
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
            {!accessBlocked ? (
              <button
                type="button"
                className="icon-button theme-button"
                aria-label="Abrir assinaturas pendentes"
                title="Assinaturas pendentes"
                onClick={() => setSignatureRequestsOpen(true)}
              >
                <AppIcon name="audit" className="app-icon" />
                {pendingSignatureRequests.length > 0 ? <span className="badge-counter">{pendingSignatureRequests.length > 99 ? '99+' : pendingSignatureRequests.length}</span> : null}
              </button>
            ) : null}
            <button type="button" className="icon-button theme-button" aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'} title={darkMode ? 'Modo claro' : 'Modo escuro'} onClick={() => setDarkMode((current) => !current)}>
              <AppIcon name={darkMode ? 'sun' : 'moon'} className="app-icon" />
            </button>
          </div>
        </header>

        <main className="app-main" ref={mainRef}>
          {passwordChangeRequired ? (
            <div className="surface-panel">
              <div className="empty-state">Altere sua senha provisória para continuar usando o sistema.</div>
            </div>
          ) : cpfRegistrationRequired ? (
            <div className="surface-panel">
              <div className="empty-state">Informe seu CPF para continuar usando o sistema.</div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <nav className="mobile-bottom-bar" aria-label="Navegação móvel">
        {mobileTabs.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} aria-label={item.mobileAriaLabel ?? item.label} className={({ isActive }) => `mobile-bottom-link${isActive ? ' active' : ''}`}>
            <AppIcon name={item.icon} className="app-icon" />
            <span>{item.mobileLabel ?? item.label}</span>
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
        open={signatureRequestsOpen}
        title="Assinaturas pendentes"
        description="Solicitações nominais de coassinatura aguardando sua confirmação."
        onClose={() => setSignatureRequestsOpen(false)}
      >
        {pendingSignatureRequests.length === 0 ? <div className="empty-state">Nenhuma assinatura pendente no momento.</div> : null}
        {pendingSignatureRequests.length > 0 ? (
          <div className="stack" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {pendingSignatureRequests.map((request) => (
              <div key={request.id} className="surface-panel panel-nested">
                <div className="stack">
                  <strong>{request.document?.title || 'Documento digital'}</strong>
                  <span className="muted">Solicitado por {request.requested_by_name || 'usuário do sistema'}</span>
                  <span className="muted">Código de integridade: {request.document?.content_hash_short || '-'}</span>
                  {request.message ? <span>{request.message}</span> : null}
                </div>
                <div className="actions-inline" style={{ marginTop: 8 }}>
                  <button className="mini-button" type="button" onClick={() => openPendingSignature(request)}>Abrir origem</button>
                  <button className="mini-button danger" type="button" onClick={() => declinePendingSignature(request.id)}>Recusar</button>
                </div>
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

      <Modal
        open={cpfRegistrationRequired}
        title="CPF obrigatorio"
        description="Informe seu CPF para preparar o acesso as assinaturas digitais com certificado."
        onClose={() => {}}
        canClose={false}
      >
        <form onSubmit={handleCpfRegistration} className="stack">
          <input
            className="app-input"
            placeholder="CPF"
            value={cpfForm.cpf}
            onChange={(event) => setCpfForm({ cpf: event.target.value })}
            inputMode="numeric"
            autoComplete="off"
            required
          />
          {cpfFeedback ? <div className="alert alert-error">{cpfFeedback}</div> : null}
          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit">Registrar CPF</button>
            <button className="ghost-button" type="button" onClick={handleLogout}>Sair</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
