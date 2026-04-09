import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { AppIcon } from '../components/AppIcon'

function formatDate(value) {
  if (!value) return 'Atual'
  return new Date(value).toLocaleString('pt-BR')
}

export default function DashboardPage() {
  const { user, isAdmin, canWrite } = useAuth()
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
          api.get('/vehicles'),
          api.get('/maintenance'),
          api.get('/possession/active'),
        ])
        setVehicles(vehiclesResponse.data)
        setMaintenance(maintenanceResponse.data)
        setActivePossessions(possessionResponse.data)
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar os indicadores da frota.'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

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
    { label: 'Veiculos ativos', value: stats.ativos, note: 'Disponiveis para uso imediato.' },
    { label: 'Em manutencao', value: stats.manutencao, note: 'Demandam retorno operacional.' },
    { label: 'Sem condutor', value: stats.semCondutor, note: 'Precisam de responsavel definido.' },
    { label: 'Pendencias abertas', value: stats.manutencoesAbertas, note: 'Chamados de oficina em andamento.' },
  ]

  const primaryActions = [
    {
      title: 'Abrir veiculos ativos',
      description: 'Vá direto para a frota pronta para operação e filtre apenas o que está liberado.',
      to: '/vehicles?status=ATIVO',
      cta: 'Consultar ativos',
    },
    {
      title: 'Revisar manutencoes abertas',
      description: 'Priorize os veículos em oficina e acompanhe o custo e o prazo dos serviços.',
      to: '/manutencoes',
      cta: 'Abrir manutencoes',
    },
    {
      title: 'Ver veiculos sem condutor',
      description: 'Encontre rapidamente os ativos sem posse vigente para redistribuição.',
      to: '/condutores',
      cta: 'Abrir condutores',
    },
    {
      title: canWrite ? 'Cadastrar novo veiculo' : 'Consultar base completa',
      description: canWrite
        ? 'Acesse o módulo principal da frota para cadastrar, editar e abrir históricos.'
        : 'Acesse a base consolidada para pesquisa, filtros e emissão de relatórios.',
      to: '/vehicles',
      cta: canWrite ? 'Gerenciar frota' : 'Consultar frota',
    },
  ]

  const adminActions = isAdmin
    ? [
        {
          title: 'Gestao de usuarios',
          description: 'Ajuste perfis administrativos, produção e leitura conforme a secretaria.',
          to: '/users',
          cta: 'Abrir usuarios',
        },
        {
          title: 'Auditoria administrativa',
          description: 'Revise quem criou, editou ou removeu registros sensíveis da operação.',
          to: '/auditoria',
          cta: 'Abrir auditoria',
        },
      ]
    : []

  return (
    <div className="surface-panel">
      <section className="hub-hero">
        <div className="hub-hero-copy">
          <span className="eyebrow" style={{ background: 'color-mix(in srgb, var(--navy) 10%, transparent)', color: 'var(--navy)' }}>
            Hub operacional
          </span>
          <h2 className="section-title">Painel da frota municipal</h2>
          <p>
            Entre pelas ações que importam agora: frota ativa, pendências de manutenção, veículos sem condutor e atalhos rápidos para cadastro ou consulta.
          </p>
        </div>

        <div className="actions-inline">
          <button type="button" className="secondary-button" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}>
            Ver pendencias
          </button>
          <Link to="/vehicles" className="app-button">
            Abrir operacao
          </Link>
        </div>
      </section>

      {error ? <div className="alert alert-error" style={{ marginTop: 18 }}>{error}</div> : null}

      <div className="metrics-grid" style={{ marginTop: 18 }}>
        {metricCards.map((item) => (
          <article key={item.label} className="metric-card">
            <span>{item.label}</span>
            <div className="metric-value">{loading ? '--' : item.value}</div>
            <div className="metric-note">{item.note}</div>
          </article>
        ))}
      </div>

      <div className="hub-layout" style={{ marginTop: 24 }}>
        <section className="hub-action-grid">
          {primaryActions.map((item) => (
            <Link key={item.title} to={item.to} className="hub-action-card">
              <strong>{item.title}</strong>
              <p>{item.description}</p>
              <footer className="hub-card-footer">
                <span>{item.cta}</span>
                <AppIcon name="chevron-right" className="app-icon" />
              </footer>
            </Link>
          ))}
        </section>

        <section className="hub-secondary-grid">
          <article className="hub-side-card">
            <strong>Leitura rapida do dia</strong>
            <p>Hoje a base tem {loading ? '--' : stats.total} veículos, {loading ? '--' : stats.possesAtivas} posses ativas e {loading ? '--' : stats.inativos} registros inativos.</p>
            <div className="panel-metrics" style={{ marginBottom: 0 }}>
              <div className="metric-inline">
                <strong>{loading ? '--' : stats.possesAtivas}</strong>
                <span>posses ativas</span>
              </div>
              <div className="metric-inline">
                <strong>{loading ? '--' : stats.inativos}</strong>
                <span>inativos</span>
              </div>
            </div>
          </article>

          <article className="hub-side-card">
            <strong>Atalhos do perfil {user?.role || '-'}</strong>
            <p>
              {canWrite
                ? 'Seu perfil pode cadastrar e atualizar dados operacionais. Use o topo para busca global e a barra mobile para acessar os módulos principais.'
                : 'Seu perfil está em modo consulta. Use filtros, busca global e exportações para localizar e compartilhar informações rapidamente.'}
            </p>
          </article>
        </section>
      </div>

      <div className="dashboard-grid" style={{ marginTop: 24 }}>
        <section className="surface-panel" style={{ padding: 0, boxShadow: 'none', background: 'transparent', border: '0' }}>
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Pendencias e historicos recentes</h3>
              <p className="section-copy">Os itens em aberto ficam reunidos aqui para encurtar o caminho entre leitura e ação.</p>
            </div>
          </div>

          <div className="hub-urgent-list">
            {loading ? (
              <div className="empty-state">Carregando pendencias operacionais...</div>
            ) : stats.manutencoesPendentes.length === 0 ? (
              <div className="empty-state">Nenhuma manutencao aberta no momento. A frota está sem chamados pendentes de oficina.</div>
            ) : (
              stats.manutencoesPendentes.map((item) => (
                <Link key={item.id} to={`/manutencoes?focus=${item.id}`} className="hub-urgent-item">
                  <header>
                    <strong>{item.vehicle_plate}</strong>
                    <span className="status-badge status-MANUTENCAO">EM ANDAMENTO</span>
                  </header>
                  <span>{item.service_description}</span>
                  <footer>
                    <span className="muted">Inicio {formatDate(item.start_date)}</span>
                    <span className="muted">Atualizado {formatDate(item.updated_at)}</span>
                  </footer>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="hub-secondary-grid">
          {adminActions.length > 0 ? (
            adminActions.map((item) => (
              <Link key={item.title} to={item.to} className="hub-side-card">
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <footer className="hub-card-footer">
                  <span>{item.cta}</span>
                  <AppIcon name="chevron-right" className="app-icon" />
                </footer>
              </Link>
            ))
          ) : (
            <article className="hub-side-card">
              <strong>Consulta e relatorios</strong>
              <p>As telas operacionais mantêm exportações em PDF e XLSX com identidade institucional da Prefeitura para compartilhamento imediato.</p>
              <footer className="hub-card-footer">
                <span>Usar relatorios</span>
                <AppIcon name="spark" className="app-icon" />
              </footer>
            </article>
          )}
        </section>
      </div>
    </div>
  )
}
