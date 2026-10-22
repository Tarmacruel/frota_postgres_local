import { useAuth } from '../context/AuthContext'
import { getCnhIssues } from '../utils/driverLicense'
import './DriverLicenseNotice.css'

export default function DriverLicenseNotice({ driver, onEdit, onRefresh, refreshing = false, error = '', disabled = false }) {
  const { canEdit } = useAuth()
  const issues = getCnhIssues(driver)
  if (!issues.length) return null
  const editable = Boolean(canEdit?.('drivers'))
  return <div className="driver-license-notice" role="alert">
    <strong>CNH precisa ser regularizada</strong>
    <span>{driver.nome_completo}</span>
    <ul>{issues.map((issue) => <li key={issue.code}>{issue.label}{issue.detail ? ` · ${issue.detail}` : ''}.</li>)}</ul>
    {editable ? <>
      <p>Abra a edição em outra aba para manter o preenchimento desta operação.</p>
      <div className="actions-inline">
        {!disabled ? <a className="secondary-button" href={`/condutores?editar=${encodeURIComponent(driver.id)}&regularizar=cnh`} target="_blank" rel="noopener noreferrer" onClick={onEdit}>Editar dados do condutor <span className="driver-license-new-tab">(nova aba)</span></a> : null}
        <button type="button" className="ghost-button" disabled={refreshing || disabled} onClick={onRefresh}>{refreshing ? 'Atualizando…' : 'Atualizar cadastro'}</button>
      </div>
    </> : <p>Solicite a regularização a um usuário com permissão para editar condutores.</p>}
    {error ? <p className="driver-license-refresh-error">{error}</p> : null}
  </div>
}
