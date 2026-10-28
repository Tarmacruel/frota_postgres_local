import { FormFields } from '../GuidedForm'
import MoneyInput from '../MoneyInput'

export default function FuelItemAllocationFields({ allocation }) {
  if(!allocation.active)return null
  return <FormFields><section className="contract-editor-section modal-field-span" aria-label="Itens efetivamente abastecidos"><h4>Itens do comprovante</h4>
    {allocation.warning?<p className="alert alert-warning">{allocation.warning}</p>:null}
    {allocation.fuelItems.length>1?<label>Item contratual do combustível<select className="app-select" value={allocation.selectedFuel?.id||''} onChange={(e)=>allocation.setPrimary(e.target.value)}><option value="">Registrar sem vínculo e sinalizar divergência</option>{allocation.fuelItems.map((r)=><option key={r.id} value={r.id}>{r.code} · {r.description}</option>)}</select></label>:null}
    {!allocation.selectedFuel?<p className="contract-pending-note">Combustível sem identificação contratual única. O gasto real será registrado com divergência para conferência.</p>:<p className="muted">Combustível: {allocation.selectedFuel.description}</p>}
    {allocation.withAdditive?<><label>Valor do aditivo no comprovante (R$)<MoneyInput className="app-input" aria-label="Valor do aditivo no comprovante" type="number" min="0" step=".01" required value={allocation.additiveAmount} onChange={(e)=>allocation.setAdditiveAmount(e.target.value)}/></label>{allocation.additiveItems.length>1?<label>Item contratual do aditivo<select className="app-select" value={allocation.selectedAdditive?.id||''} onChange={(e)=>allocation.setAdditional(e.target.value)}><option value="">Sem vínculo contratual</option>{allocation.additiveItems.map((r)=><option key={r.id} value={r.id}>{r.code} · {r.description}</option>)}</select></label>:null}{!allocation.selectedAdditive?<p className="contract-pending-note">Aditivo sem vínculo contratual: será registrada divergência.</p>:null}</>:null}
    {allocation.error?<p className="alert alert-error" role="alert">{allocation.error}</p>:<p className="muted">A soma do combustível e do aditivo corresponde ao valor total do comprovante.</p>}
  </section></FormFields>
}
