import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { AppIcon } from '../components/AppIcon'
import { StatCard } from '../components/ui'

function formatDate(value) {
  if (!value) return 'Atual'
  return new Date(value).toLocaleString('pt-BR')
}

export default function DashboardPage() {
  const { user, isAdmin, canCreate, canView, canWrite } = useAuth()
  const canViewDrivers = canView('drivers')
  const [driverSummary, setDriverSummary] = useState({})
  const canViewVehicles = canView('vehicles')
  const canViewMaintenance = canView('maintenance')
  const canViewPossession = canView('possession')
  const canCreateVehicle = canCreate('vehicles')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [vehicleSummary, setVehicleSummary] = useState({})
  const [openMaintenance, setOpenMaintenance] = useState({ data: [], total: 0 })
  const [activePossessionsCount, setActivePossessionsCount] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        const [vehiclesResponse, maintenanceResponse, possessionResponse, driversResponse] = await Promise.all([
          canViewVehicles ? api.get('/vehicles/paginated', { params: { page: 1, limit: 1 } }) : Promise.resolve({ data: { summary: {} } }),
          canViewMaintenance ? api.get('/maintenance/paginated', { params: { page: 1, limit: 4, only_open: true } }) : Promise.resolve({ data: { data: [], pagination: { total: 0 } } }),
          canViewPossession ? api.get('/possession/paginated', { params: { page: 1, limit: 1, active: true } }) : Promise.resolve({ data: { pagination: { total: 0 } } }),
          canViewDrivers ? api.get('/drivers', { params: { page: 1, limit: 1, active: true } }) : Promise.resolve({ data: { summary: {} } }),
        ])
        setDriverSummary(driversResponse.data.summary || {})
        setVehicleSummary(vehiclesResponse.data.summary || {})
        setOpenMaintenance({ data: maintenanceResponse.data.data || [], total: maintenanceResponse.data.pagination?.total || 0 })
        setActivePossessionsCount(possessionResponse.data.pagination?.total || 0)
      } catch (err) {
        setError(getApiErrorMessage(err, 'Não foi possível carregar os indicadores da frota.'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [canViewVehicles, canViewMaintenance, canViewPossession, canViewDrivers])

  const stats = useMemo(() => {
    return {
      total: vehicleSummary.total || 0,
      ativos: vehicleSummary.active || 0,
      manutencao: vehicleSummary.maintenance || 0,
      inativos: vehicleSummary.inactive || 0,
      manutencoesAbertas: openMaintenance.total,
      possesAtivas: activePossessionsCount,
      semCondutor: vehicleSummary.active_without_driver || 0,
      manutencoesPendentes: openMaintenance.data,
    }
  }, [vehicleSummary, openMaintenance, activePossessionsCount])

  const metricCards = [
    { icon: 'vehicles', tone: 'info', to: '/vehicles?indicator=active', label: 'Veículos ativos', value: stats.ativos, note: 'Em uso ou disponíveis' },
    { icon: 'maintenance', tone: 'warning', to: '/vehicles?indicator=maintenance', label: 'Em manutenção', value: stats.manutencao, note: 'Demandam retorno operacional' },
    { icon: 'drivers', tone: 'neutral', to: '/vehicles?indicator=without_driver', label: 'Sem condutor', value: stats.semCondutor, note: 'Aguardando posse' },
    { icon: 'audit', tone: 'danger', to: '/manutencoes?indicator=open', label: 'Pendências abertas', value: stats.manutencoesAbertas, note: 'Precisam de atenção' },
    { icon: 'vehicles', tone: 'neutral', label: 'Veículos inativos', value: stats.inativos, to: '/vehicles?indicator=inactive', note: 'Consultar a situação da frota' },
    { icon: 'drivers', tone: 'success', label: 'Posses ativas', value: stats.possesAtivas, to: '/posses?indicator=active', note: 'Veículos sob responsabilidade' },
    { icon: 'drivers', tone: 'danger', label: 'CNHs vencidas', value: driverSummary.expired ?? 0, to: '/condutores?cnh_status=expired', note: 'Condutores ativos' },
    { icon: 'drivers', tone: 'warning', label: 'CNHs não informadas', value: driverSummary.missing ?? 0, to: '/condutores?cnh_status=missing', note: 'Sem número ou validade · ativos' },
  ].filter((item) => item.to.startsWith('/vehicles') ? canViewVehicles : item.to.startsWith('/condutores') ? canViewDrivers : item.to.startsWith('/posses') ? canViewPossession : canViewMaintenance)

  const primaryActions = [
    { icon: 'vehicles', title: 'Abrir veículos ativos', description: 'Consulte a frota pronta para operação.', to: '/vehicles?status=ATIVO', cta: 'Consultar ativos' },
    { icon: 'maintenance', title: 'Revisar manutenções abertas', description: 'Acompanhe serviços, custos e prazos.', to: '/manutencoes', cta: 'Abrir manutenções' },
    { icon: 'drivers', title: 'Ver veículos sem condutor', description: 'Localize ativos sem posse vigente.', to: '/posses', cta: 'Abrir posses' },
    {
      icon: 'catalog',
      title: canCreateVehicle ? 'Cadastrar novo veículo' : 'Consultar base completa',
      description: canCreateVehicle ? 'Inclua um veículo na frota municipal.' : 'Pesquise e filtre a base consolidada.',
      to: '/vehicles',
      cta: canCreateVehicle ? 'Gerenciar frota' : 'Consultar frota',
    },
  ].filter((item) => {
    if (item.to.startsWith('/vehicles')) return canViewVehicles
    if (item.to === '/manutencoes') return canViewMaintenance
    if (item.to === '/posses') return canViewPossession
    return true
  })

  const adminActions = isAdmin
    ? [
        { icon: 'users', title: 'Gestão de usuários', description: 'Ajuste perfis e acessos por secretaria.', to: '/users', cta: 'Abrir usuários' },
        { icon: 'audit', title: 'Auditoria administrativa', description: 'Revise alterações em registros sensíveis.', to: '/auditoria', cta: 'Abrir auditoria' },
      ]
    : []

  const firstName = user?.name?.trim().split(/\s+/)[0]

  return (
    <div className="surface-panel dashboard-page">
      <header className="dashboard-intro">
        <div>
          <p className="dashboard-intro__eyebrow">Visão geral da operação</p>
          <h1>Olá{firstName ? `, ${firstName}` : ''}!</h1>
          <p>Acompanhe os indicadores e acesse as rotinas mais usadas da frota municipal.</p>
        </div>
        <div className="dashboard-intro__actions">
          <button type="button" className="secondary-button" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}>Ver pendências</button>
          <Link to="/vehicles" className="app-button">Abrir operação</Link>
        </div>
      </header>

      {error ? <div className="alert alert-error dashboard-alert">{error}</div> : null}

      <section className="dashboard-kpi-grid" aria-label="Indicadores da frota">
        {metricCards.map((item) => <StatCard key={item.label} {...item} loading={loading || Boolean(error)} />)}
      </section>

      <section className="dashboard-section" aria-labelledby="dashboard-actions-title">
        <div className="dashboard-section__heading">
          <div><h2 id="dashboard-actions-title">Ações rápidas</h2><p>Atalhos para as rotinas mais frequentes.</p></div>
        </div>
        <div className="dashboard-quick-grid">
          {primaryActions.map((item) => (
            <Link key={item.title} to={item.to} className="dashboard-quick-action">
              <span className="dashboard-quick-action__icon" aria-hidden="true"><AppIcon name={item.icon} className="app-icon" /></span>
              <span className="dashboard-quick-action__copy"><strong>{item.title}</strong><small>{item.description}</small></span>
              <span className="dashboard-quick-action__cta"><span>{item.cta}</span><AppIcon name="chevron-right" className="app-icon" /></span>
            </Link>
          ))}
        </div>
      </section>

      <div className="dashboard-lower-grid">
        <section className="dashboard-panel dashboard-pending-panel" aria-labelledby="dashboard-pending-title">
          <div className="dashboard-section__heading">
            <div><h2 id="dashboard-pending-title">Pendências e históricos recentes</h2><p>Manutenções abertas que pedem acompanhamento.</p></div>
            {!loading ? <span className="dashboard-count">{stats.manutencoesAbertas}</span> : null}
          </div>
          <div className="dashboard-pending-list">
            {loading ? (
              <div className="empty-state">Carregando pendências operacionais...</div>
            ) : stats.manutencoesPendentes.length === 0 ? (
              <div className="empty-state">Nenhuma manutenção aberta no momento. A frota está sem chamados pendentes de oficina.</div>
            ) : (
              stats.manutencoesPendentes.map((item) => (
                <Link key={item.id} to={`/manutencoes?focus=${item.id}`} className="dashboard-pending-item">
                  <span className="dashboard-pending-item__icon" aria-hidden="true"><AppIcon name="maintenance" className="app-icon" /></span>
                  <span className="dashboard-pending-item__copy">
                    <span className="dashboard-pending-item__title"><strong>{item.vehicle_plate}</strong><span className="status-badge status-MANUTENCAO">EM ANDAMENTO</span></span>
                    <span>{item.service_description}</span>
                    <small>Início {formatDate(item.start_date)} · Atualizado {formatDate(item.updated_at)}</small>
                  </span>
                  <AppIcon name="chevron-right" className="app-icon dashboard-pending-item__arrow" />
                </Link>
              ))
            )}
          </div>
        </section>

        <aside className="dashboard-side-stack">
          <section className="dashboard-panel dashboard-day-panel" aria-labelledby="dashboard-day-title">
            <div className="dashboard-section__heading"><div><h2 id="dashboard-day-title">Leitura rápida do dia</h2><p>Resumo da base neste momento.</p></div></div>
            <div className="dashboard-day-metrics">
              {canViewPossession ? <Link to="/posses?indicator=active"><strong>{loading ? '--' : stats.possesAtivas}</strong><span>posses ativas →</span></Link> : null}
              {canViewVehicles ? <Link to="/vehicles?indicator=inactive"><strong>{loading ? '--' : stats.inativos}</strong><span>inativos →</span></Link> : null}
            </div>
            <p className="dashboard-day-summary">A base reúne {loading ? '--' : stats.total} veículos cadastrados.</p>
          </section>
          <section className="dashboard-profile-note" aria-label={`Atalhos do perfil ${user?.role || '-'}`}>
            <AppIcon name="spark" className="app-icon" />
            <div><strong>Perfil {user?.role || '-'}</strong><p>{canWrite ? 'Acesso a cadastro e atualização de dados operacionais.' : 'Acesso para consulta, filtros e exportações.'}</p></div>
          </section>
        </aside>
      </div>

      <section className="dashboard-section dashboard-shortcuts" aria-labelledby="dashboard-shortcuts-title">
        <div className="dashboard-section__heading"><div><h2 id="dashboard-shortcuts-title">{adminActions.length > 0 ? 'Atalhos administrativos' : 'Consulta e relatórios'}</h2><p>{adminActions.length > 0 ? 'Ferramentas disponíveis para o perfil administrador.' : 'Recursos disponíveis nas telas operacionais.'}</p></div></div>
        {adminActions.length > 0 ? (
          <div className="dashboard-admin-grid">
            {adminActions.map((item) => (
              <Link key={item.title} to={item.to} className="dashboard-admin-action">
                <span className="dashboard-admin-action__icon" aria-hidden="true"><AppIcon name={item.icon} className="app-icon" /></span>
                <span><strong>{item.title}</strong><small>{item.description}</small></span>
                <span className="dashboard-admin-action__cta">{item.cta}<AppIcon name="chevron-right" className="app-icon" /></span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="dashboard-report-note"><AppIcon name="catalog" className="app-icon" /><span>As telas operacionais mantêm exportações em PDF e XLSX para compartilhamento.</span></div>
        )}
      </section>
    </div>
  )
}
