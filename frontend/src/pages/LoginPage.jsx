import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { officialBrand } from '../constants/officialBrand'
import { getApiErrorMessage } from '../utils/apiError'

const accessNotes = [
  'Credenciais liberadas somente para servidores e setores autorizados.',
  'Solicite criacao, redefinicao ou ajuste de perfil ao administrador responsavel.',
  'Utilize o subdominio oficial `frota.sirel.com.br` para acesso externo.',
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      <div className="login-stage">
        <div className="login-card">
          <section className="login-card-panel login-card-panel-brand">
            <div>
              <span className="eyebrow">Acesso institucional protegido</span>
              <div className="login-brandline">
                <img className="login-brand-logo" src={officialBrand.logoPath} alt="Brasao oficial da Prefeitura Municipal de Teixeira de Freitas" />
                <div>
                  <strong>{officialBrand.systemName}</strong>
                  <span>{officialBrand.subtitle}</span>
                </div>
              </div>
              <h1 className="login-title">Acesse a operacao oficial da frota municipal.</h1>
              <p className="login-copy">
                Entre com sua conta institucional para acompanhar veiculos, manutencoes e condutores em um ambiente alinhado a identidade oficial da Prefeitura Municipal de Teixeira de Freitas.
              </p>
            </div>

            <div className="hero-grid">
              <div className="hero-figure">
                <span>Fluxo centralizado</span>
                <strong>Veiculos, oficinas e condutores</strong>
                <span>Leitura imediata para operacao, consulta e decisao administrativa.</span>
              </div>
              <div className="hero-figure">
                <span>Ambiente institucional</span>
                <strong>Identidade oficial PMTF</strong>
                <span>Brasao, subdominio e relatorios com aparencia profissional e padronizada.</span>
              </div>
              <div className="hero-figure">
                <span>Base segura</span>
                <strong>PostgreSQL nativo</strong>
                <span>Execucao leve no host, pronta para publicacao em frota.sirel.com.br.</span>
              </div>
            </div>

            <div className="login-civic-bar">
              <span>{officialBrand.addressLine}</span>
              <span>CNPJ {officialBrand.cnpj}</span>
            </div>
          </section>

          <section className="login-card-panel login-card-panel-form">
            <div className="login-form-badge">
              <img src={officialBrand.logoPath} alt="" />
            </div>

            <div>
              <h2 className="panel-title">Bem-vindo de volta</h2>
              <p className="panel-subtitle">Entre com a conta vinculada ao ambiente institucional da Prefeitura Municipal de Teixeira de Freitas.</p>
            </div>

            <form onSubmit={handleSubmit} className="form-grid">
              <div className="form-field">
                <label htmlFor="email">Login institucional</label>
                <div className="login-input-shell">
                  <span className="login-input-icon">@</span>
                  <input
                    id="email"
                    className="app-input login-app-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@frota.local"
                  />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="password">Sua senha</label>
                <div className="login-input-shell">
                  <span className="login-input-icon">#</span>
                  <input
                    id="password"
                    className="app-input login-app-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                  />
                </div>
              </div>

              {error ? <div className="alert alert-error">{error}</div> : null}

              <button className="app-button login-submit-button" type="submit" disabled={submitting}>
                {submitting ? 'Entrando...' : 'Entrar no sistema'}
              </button>
            </form>

            <div className="login-demo-block">
              <strong>Orientacoes de acesso</strong>
              <div className="alert alert-info">
                {accessNotes.map((note) => (
                  <div key={note}>{note}</div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
