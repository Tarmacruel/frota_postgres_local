import { Link } from 'react-router-dom'

export default function UnauthorizedPage() {
  return (
    <div className="app-loading">
      <div className="loading-card">
        <strong>Acesso não autorizado</strong>
        <p className="muted">Seu perfil não tem permissão para acessar esta área. Peça ao superusuário para conferir seu acesso.</p>
        <Link to="/" className="app-button">Voltar ao início</Link>
      </div>
    </div>
  )
}
