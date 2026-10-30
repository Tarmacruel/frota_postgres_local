import GuidedForm, { FormSection as GuidedSection } from './GuidedForm'
import MoneyInput from './MoneyInput'
import { useEffect, useMemo, useState } from 'react'
import { maintenanceAPI } from '../api/maintenance'
import SearchableSelect from './SearchableSelect'
import { getApiErrorMessage } from '../utils/apiError'
import { toDateTimeLocalValue } from '../utils/datetime'
import { useContractControl } from '../hooks/useContractFunding'
import { MaintenanceOrderForm } from './contracts/MaintenanceOrdersPanel'
import { contractControlAPI } from '../api/contractControl'
import ContractItemLines from './contracts/ContractItemLines'
import { itemLinesPayload, itemLinesTotal } from '../utils/contractItemLines'

function buildInitialState(initialData, vehicles) {
  if (initialData) {
    return {
      vehicle_id: initialData.vehicle_id,
      start_date: toDateTimeLocalValue(initialData.start_date),
      end_date: toDateTimeLocalValue(initialData.end_date),
      service_description: initialData.service_description || '',
      parts_replaced: initialData.parts_replaced || '',
      total_cost: initialData.total_cost ?? '',
    }
  }

  return {
    vehicle_id: '',
    start_date: toDateTimeLocalValue(new Date().toISOString()),
    end_date: '',
    service_description: '',
    parts_replaced: '',
    total_cost: '',
  }
}

function buildVehicleOption(vehicle) {
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação'
  return {
    value: vehicle.id, tags: vehicle.tags || [],
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: `${vehicle.ownership_type === 'LOCADO' ? 'Locado' : 'Próprio'} | ${locationLabel}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.chassis_number, locationLabel].filter(Boolean).join(' '),
  }
}

export default function MaintenanceForm(props) {
  const mode = useContractControl()
  if (!props.initialData && mode.enabled === null) return <p role="status">Conferindo controle contratual…</p>
  if (!props.initialData && mode.enabled) return <MaintenanceOrderForm {...props} />
  return <LegacyMaintenanceForm {...props} quantityEnabled={mode.quantityEnabled} />
}

function LegacyMaintenanceForm({ vehicles, initialData = null, onClose, onSuccess, onVehicleOptionsOpen, quantityEnabled = false }) {
  const isEdit = Boolean(initialData?.id)
  const [form, setForm] = useState(() => buildInitialState(initialData, vehicles))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [quantityContext, setQuantityContext] = useState({ loaded:false, tracked:false, items:[], prices:[] })
  const [lines,setLines] = useState([])
  const contextId=initialData?.id
  const needsContext=Boolean(quantityEnabled&&initialData?.contract_reservation_id)
  useEffect(()=>{
    let active=true
    if(needsContext) maintenanceAPI.getById(contextId).then(async({data})=>{
      const funding=data.contract_funding
      const tracked=Array.isArray(funding?.actual_item_lines)
      let options={items:[],prices:[]}
      if(tracked) options=(await contractControlAPI.itemOptions(data.contract_id,data.contract_provider_id)).data
      if(active){setQuantityContext({...options,loaded:true,tracked});setLines((funding?.actual_item_lines||[]).map((r)=>({...r,key:crypto.randomUUID(),quantity:String(r.quantity),amount:String(r.amount)})))}
    }).catch((err)=>{if(active)setError(getApiErrorMessage(err,'Não foi possível conferir os itens para retificação.'))})
    return()=>{active=false}
  },[needsContext,contextId])
  const quantitative=quantityContext.tracked
  const actualCost=quantitative?itemLinesTotal(lines):form.total_cost
  const changesFundedCost = Boolean(initialData?.contract_reservation_id) && (quantitative||Number(actualCost) !== Number(initialData.total_cost))

  const submitLabel = useMemo(() => {
    if (submitting) return 'Salvando...'
    return isEdit ? 'Atualizar manutenção' : 'Registrar manutenção'
  }, [isEdit, submitting])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!form.vehicle_id) {
      setError('Selecione um veículo para continuar.')
      return
    }

    try {
      setSubmitting(true)
      setError('')

      if (isEdit) {
        await maintenanceAPI.update(initialData.id, {
          end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
          service_description: form.service_description,
          parts_replaced: form.parts_replaced || null,
          total_cost: Number(actualCost),
          ...(quantitative?{item_lines:itemLinesPayload(lines,true)}:{}),
          ...(changesFundedCost ? { reason: reason.trim() } : {}),
        })
        onSuccess?.('Manutenção atualizada com sucesso.')
      } else {
        await maintenanceAPI.create({
          vehicle_id: form.vehicle_id,
          start_date: new Date(form.start_date).toISOString(),
          end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
          service_description: form.service_description,
          parts_replaced: form.parts_replaced || null,
          total_cost: Number(form.total_cost),
        })
        onSuccess?.('Manutenção registrada com sucesso.')
      }

      onClose?.()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar a manutenção.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <GuidedForm module="maintenance" recordId={initialData?.id} busy={submitting} onSubmit={handleSubmit} className="form-grid modal-form-grid">
      {error ? <div className="alert alert-error modal-field-span">{error}</div> : null}

      <GuidedSection title="Execução" description="Confira o veículo, as datas e o custo realizado.">
<div className="form-field">
        <label>Veículo</label>
        <SearchableSelect required
          value={form.vehicle_id} onOpen={onVehicleOptionsOpen}
          onChange={(value) => setForm({ ...form, vehicle_id: value })}
          options={vehicles.filter((vehicle) => vehicle.can_operate_vehicle !== false).map(buildVehicleOption)}
          placeholder="Selecione o veículo"
          searchPlaceholder="Buscar veículo por placa, modelo ou chassi"
          disabled={isEdit}
          emptyLabel="Nenhum veículo disponível."
        />
      </div>

      <div className="form-field">
        <label htmlFor="maintenance-start">Início</label>
        <input required
          id="maintenance-start"
          type="datetime-local"
          className="app-input"
          value={form.start_date}
          disabled={isEdit}
          onChange={(event) => setForm({ ...form, start_date: event.target.value })}
        />
      </div>

      <div className="form-field">
        <label htmlFor="maintenance-end">Conclusão</label>
        <input
          id="maintenance-end"
          type="datetime-local"
          className="app-input"
          value={form.end_date}
          onChange={(event) => setForm({ ...form, end_date: event.target.value })}
        />
      </div>

      <div className="form-field">
        <label htmlFor="maintenance-cost">Custo total</label>
        <MoneyInput
          id="maintenance-cost"
          type="number"
          min="0"
          step="0.01"
          className="app-input"
          placeholder="0,00"
          value={actualCost}
          readOnly={quantitative}
          onChange={(event) => setForm({ ...form, total_cost: event.target.value })}
        />
      </div>


</GuidedSection>
<GuidedSection title="Serviços e peças" description="Descreva os serviços e confira as peças e os itens realizados.">
<div className="form-field modal-field-span">
        <label htmlFor="maintenance-description">Serviço realizado</label>
        <textarea required
          id="maintenance-description"
          className="app-textarea"
          rows="5"
          placeholder="Descreva o serviço executado e o contexto da manutenção."
          value={form.service_description}
          onChange={(event) => setForm({ ...form, service_description: event.target.value })}
        />
      </div>

      <div className="form-field modal-field-span">
        <label htmlFor="maintenance-parts">Peças trocadas</label>
        <textarea
          id="maintenance-parts"
          className="app-textarea"
          rows="4"
          placeholder="Itens substituídos, observações e referências."
          value={form.parts_replaced}
          onChange={(event) => setForm({ ...form, parts_replaced: event.target.value })}
        />
      </div>

      {quantitative?<ContractItemLines actual allowUnknown label="Itens e quantidades realizados" items={quantityContext.items} prices={quantityContext.prices} lines={lines} onChange={setLines}/>:null}
      {needsContext&&!quantityContext.loaded?<p role="status">Conferindo itens da manutenção…</p>:null}
</GuidedSection>
      <div className="actions-inline modal-actions">
        {changesFundedCost ? <div className="form-field modal-field-span"><label htmlFor="maintenance-correction-reason">Justificativa da alteração de custo</label><textarea id="maintenance-correction-reason" className="app-textarea" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={2000} required /></div> : null}
        <button className="app-button" type="submit" disabled={submitting || vehicles.length === 0 || (needsContext&&!quantityContext.loaded)}>
          {submitLabel}
        </button>
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </GuidedForm>
  )
}
