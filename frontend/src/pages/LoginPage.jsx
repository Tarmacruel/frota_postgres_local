import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'

const credentials = [
  {
    label: 'Administrador',
    email: 'admin@frota.local',
    password: 'Admin@1234',
    hint: 'Acesso completo a veiculos e usuarios.',
  },
  {
    label: 'Padrao',
    email: 'padrao@frota.local',
    password: 'User@1234',
    hint: 'Consulta operacional em modo leitura.',
  },
]

export default function LoginPage() {
  const [email, setEmail] = useState('admin@frota.local')
  const [password, setPassword] = useState('Admin@1234')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [navigate, user])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Falha ao autenticar. Revise suas credenciais.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-shell">
      <section className="login-hero">
        <div>
          <span className="eyebrow">Prefeitura Municipal de Teixeira de Freitas</span>
          <h1 className="login-title">Frota PMTF em operacao continua.</h1>
          <p className="login-copy">
            Um acesso unico para acompanhar disponibilidade, historico de lotacao e manutencao da frota com leitura imediata e menos ruido visual.
          </p>
        </div>

        <div className="hero-grid">
          <div className="hero-figure">
            <span>Gestao centralizada</span>
            <strong>3 fluxos</strong>
            <span>Ativos, manutencao e inativos com leitura direta.</span>
          </div>
          <div className="hero-figure">
            <span>Controle institucional</span>
            <strong>2 perfis</strong>
            <span>Administrador e usuario padrao com acesso coerente.</span>
          </div>
          <div className="hero-figure">
            <span>Ambiente local</span>
            <strong>PostgreSQL</strong>
            <span>Base pronta para evolucao, validacao e entrega.</span>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-card">
          <div>
            <h2 className="panel-title">Entrar no sistema</h2>
            <p className="panel-subtitle">Use um perfil seed para testar agora ou informe as credenciais operacionais do ambiente.</p>
          </div>

          <div className="credential-grid">
            {credentials.map((credential) => (
              <button
                key={credential.label}
                type="button"
                className="credential-button"
                onClick={() => {
                  setEmail(credential.email)
                  setPassword(credential.password)
                  setError('')
                }}
              >
                <strong>{credential.label}</strong>
                <span>{credential.email}</span>
                <span>{credential.hint}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-field">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                className="app-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@frota.local"
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                className="app-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
              />
            </div>

            {error ? <div className="alert alert-error">{error}</div> : null}

            <button className="app-button" type="submit" disabled={submitting}>
              {submitting ? 'Entrando...' : 'Acessar painel'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
