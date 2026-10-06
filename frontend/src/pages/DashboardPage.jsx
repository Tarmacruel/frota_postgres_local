import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { VEHICLE_LIST_LIMIT } from '../constants/pagination'
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
  const canViewVehicles = canView('vehicles')
  const canViewMaintenance = canView('maintenance')
  const canViewPossession = canView('possession')
  const canCreateVehicle = canCreate('vehicles')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [vehicles, setVehicles] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [activePossessions, setActivePossessions] = useState([])

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        const [vehiclesResponse, maintenanceResponse, possessionResponse] = await Promise.all([
          canViewVehicles ? api.get('/vehicles', { params: { limit: VEHICLE_LIST_LIMIT } }) : Promise.resolve({ data: [] }),
          canViewMaintenance ? api.get('/maintenance') : Promise.resolve({ data: [] }),
          canViewPossession ? api.get('/possession/active') : Promise.resolve({ data: [] }),
        ])
        setVehicles(vehiclesResponse.data)
        setMaintenance(maintenanceResponse.data)
        setActivePossessions(possessionResponse.data)
      } catch (err) {
        setError(getApiErrorMessage(err, 'Não foi possível carregar os indicadores da frota.'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [canViewVehicles, canViewMaintenance, canViewPossession])

  const stats = useMemo(() => {
    const ativos = vehicles.filter((item) => item.status === 'ATIVO')
    const manutencaoCount = vehicles.filter((item) => item.status === 'MANUTENCAO').length
    const inativos = vehicles.filter((item) => item.status === 'INATIVO').length
    const manutencoesAbertas = maintenance.filter((item) => !item.end_date)
    const semCondutor = ativos.filter((item) => !item.current_driver_name).length

    return {
      total: vehicles.length,
      ativos: ativos.length,
      manutencao: manutencaoCount,
      inativos,
      manutencoesAbertas: manutencoesAbertas.length,
      possesAtivas: activePossessions.length,
      semCondutor,
      manutencoesPendentes: manutencoesAbertas.slice(0, 4),
    }
  }, [vehicles, maintenance, activePossessions])

  const metricCards = [
    { icon: 'vehicles', tone: 'info', label: 'Veículos ativos', value: stats.ativos, note: 'Em uso ou disponíveis' },
    { icon: 'maintenance', tone: 'warning', label: 'Em manutenção', value: stats.manutencao, note: 'Demandam retorno operacional' },
    { icon: 'drivers', tone: 'neutral', label: 'Sem condutor', value: stats.semCondutor, note: 'Aguardando posse' },
    { icon: 'audit', tone: 'danger', label: 'Pendências abertas', value: stats.manutencoesAbertas, note: 'Precisam de atenção' },
  ]

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
        {metricCards.map((item) => <StatCard key={item.label} {...item} loading={loading} />)}
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
              <div><strong>{loading ? '--' : stats.possesAtivas}</strong><span>posses ativas</span></div>
              <div><strong>{loading ? '--' : stats.inativos}</strong><span>inativos</span></div>
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
