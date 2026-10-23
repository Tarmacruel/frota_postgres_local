import { Link } from 'react-router-dom'
import { safeContractReturn } from '../../utils/contractNavigation'
import '../../styles/contracts-balances.css'

export default function ContractReturnBanner({ returnTo, compact = false, saving = false }) {
  const target = safeContractReturn(returnTo)
  if (!target) return null
  return <aside className={`contract-return${compact ? ' contract-return--compact modal-field-span contract-form__wide' : ''}`} aria-label="Contexto do contrato">
    <span>{compact ? 'Pedido no contrato selecionado' : 'Operação iniciada em Contratos e saldos'}</span>
    <Link className="ghost-button" to={target} aria-disabled={saving || undefined} onClick={(event) => { if (saving) event.preventDefault() }}>Voltar ao contrato</Link>
  </aside>
}
