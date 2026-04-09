import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState({ total: 0, ativos: 0, manutencao: 0, inativos: 0, manutencoesAbertas: 0, possesAtivas: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        const [all, ativos, manutencao, inativos, maintenance, possession] = await Promise.all([
          api.get('/vehicles'),
          api.get('/vehicles/em-atividade'),
          api.get('/vehicles/em-manutencao'),
          api.get('/vehicles/inativos'),
          api.get('/maintenance'),
          api.get('/possession/active'),
        ])
        setStats({
          total: all.data.length,
          ativos: ativos.data.length,
          manutencao: manutencao.data.length,
          inativos: inativos.data.length,
          manutencoesAbertas: maintenance.data.filter((item) => !item.end_date).length,
          possesAtivas: possession.data.length,
        })
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar os indicadores da frota.'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const metricCards = [
    {
      label: 'Total de veiculos',
      value: stats.total,
      note: 'Base consolidada de acompanhamento institucional.',
    },
    {
      label: 'Em atividade',
      value: stats.ativos,
      note: 'Prontos para operacao imediata.',
    },
    {
      label: 'Em manutencao',
      value: stats.manutencao,
      note: 'Demandam acompanhamento tecnico.',
    },
    {
      label: 'Inativos',
      value: stats.inativos,
      note: 'Fora de operacao no momento.',
    },
    {
      label: 'Manutencoes abertas',
      value: stats.manutencoesAbertas,
      note: 'Servicos ainda em acompanhamento.',
    },
    {
      label: 'Condutores ativos',
      value: stats.possesAtivas,
      note: 'Posses em vigor na consulta atual.',
    },
  ]

  const actions = [
    {
      title: 'Veiculos em atividade',
      description: 'Consulte rapidamente a frota liberada para uso e acompanhe lotacao atual.',
      to: '/vehicles?status=ATIVO',
      cta: 'Abrir ativos',
    },
    {
      title: 'Veiculos em manutencao',
      description: 'Visualize os itens em manutencao para apoiar priorizacao e retorno operacional.',
      to: '/vehicles?status=MANUTENCAO',
      cta: 'Abrir manutencao',
    },
    {
      title: 'Veiculos inativos',
      description: 'Separe com clareza os registros fora de circulacao ou indisponiveis.',
      to: '/vehicles?status=INATIVO',
      cta: 'Abrir inativos',
    },
    {
      title: 'Historico de manutencoes',
      description: 'Consulte custos, servicos concluidos e demandas em andamento.',
      to: '/manutencoes',
      cta: 'Abrir manutencoes',
    },
    {
      title: 'Posse de veiculos',
      description: 'Veja quem esta com cada veiculo e acompanhe as transferencias.',
      to: '/condutores',
      cta: 'Abrir condutores',
    },
  ]

  if (user?.role === 'ADMIN') {
    actions.unshift({
      title: 'Cadastro e ajustes',
      description: 'Crie novos registros e atualize historico de departamento sem sair da operacao.',
      to: '/vehicles',
      cta: 'Gerenciar frota',
    })
    actions.push({
      title: 'Gestao de usuarios',
      description: 'Controle administradores, operadores de producao e perfis de consulta.',
      to: '/users',
      cta: 'Abrir usuarios',
    })
    actions.push({
      title: 'Auditoria administrativa',
      description: 'Revise a trilha de criacoes, edicoes e exclusoes das areas sensiveis.',
      to: '/auditoria',
      cta: 'Abrir auditoria',
    })
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Painel da frota</h2>
          <p className="section-copy">Um resumo direto para abrir as areas certas sem precisar navegar por telas vazias.</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="metrics-grid">
        {metricCards.map((item) => (
          <article key={item.label} className="metric-card">
            <span>{item.label}</span>
            <div className="metric-value">{loading ? '--' : item.value}</div>
            <div className="metric-note">{item.note}</div>
          </article>
        ))}
      </div>

      <div className="dashboard-grid" style={{ marginTop: 24 }}>
        <section className="surface-panel" style={{ padding: 0, boxShadow: 'none', background: 'transparent', border: '0' }}>
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Acessos rapidos</h3>
              <p className="section-copy">Atalhos para os fluxos que mais importam no dia a dia da secretaria.</p>
            </div>
          </div>
          <div className="quick-stats">
            {actions.map((item) => (
              <Link key={item.title} to={item.to} className="action-card">
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <footer>
                  <span>{item.cta}</span>
                  <span>{'->'}</span>
                </footer>
              </Link>
            ))}
          </div>
        </section>

        <section className="surface-panel" style={{ padding: 24 }}>
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Leitura operacional</h3>
              <p className="section-copy">O ambiente local ja esta preparado para testar autenticacao, CRUD e historico.</p>
            </div>
          </div>
          <ul className="bullet-list">
            <li className="bullet-item">Use o painel de veiculos para cadastrar, editar e visualizar lotacao atual.</li>
            <li className="bullet-item">As telas de manutencoes e condutores centralizam historico mecanico e posse atual por veiculo.</li>
            <li className="bullet-item">O perfil padrao fica em leitura, o perfil de producao cadastra e edita, e o admin mantem controle total.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
