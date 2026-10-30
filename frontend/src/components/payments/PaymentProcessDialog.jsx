import { FormFields } from '../GuidedForm'
import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../Modal'
import MoneyInput from '../MoneyInput'
import { contractControlAPI } from '../../api/contractControl'
import { paymentProcessesAPI } from '../../api/paymentProcesses'
import { fuelSuppliesAPI } from '../../api/fuelSupplies'
import { maintenanceAPI } from '../../api/maintenance'
import { useContractControl } from '../../hooks/useContractFunding'
import { getApiErrorMessage } from '../../utils/apiError'
import { formatContractMoney as brl } from '../../utils/contractBalance'
import { assertPaymentOperationsCurrent, availablePaymentOperations, centsAmount, initialPaymentForm, mergePaymentSuggestions, operationSuggestions, paymentCents, paymentPayload } from '../../utils/paymentProcessDraft'

const day = (value) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const month = (value) => value ? value.split('-').reverse().join('/') : 'A informar'

function Field({ label, children, hint }) {
  return <FormFields><label className="payment-composer__field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label></FormFields>
}

export default function PaymentProcessDialog({ record, contractId = '', operationId = '', contracts = [], suppliers = [], organizations = [], user, onClose, onSaved }) {
  const control = useContractControl()
  const [form, setForm] = useState(() => ({ ...initialPaymentForm(record, contracts.find((c) => c.id === contractId), user?.organization_id || ''), ...(!record && contractId ? { contract_id: contractId } : {}) }))
  const [guided, setGuided] = useState(true)
  const [step, setStep] = useState(record ? 'invoice' : 'source')
  const [list, setList] = useState({ data: [], pages: 0, total: 0 })
  const [selected, setSelected] = useState([])
  const [sources, setSources] = useState({})
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null)
  const [uncertain, setUncertain] = useState(false)
  const [reason, setReason] = useState('')
  const [confirmedDifference, setConfirmedDifference] = useState(false)
  const touched = useRef({})
  const requested = useRef(new Set())
  const sourceRevision = useRef(0)
  const mounted = useRef(true)
  const busy = useRef(false)
  const savedRef = useRef(null)
  const seeded = useRef(false)
  const errorRef = useRef(null)
  const invoiceRef = useRef(null)
  const formRef = useRef(null)
  const contract = contracts.find((item) => item.id === form.contract_id)
  const integrated = !record && guided && control.enabled === true && !control.error
  const sourceLoading = selected.some((row) => !Object.hasOwn(sources, row.id))
  const suggestions = useMemo(() => operationSuggestions(selected, sources), [selected, sources])
  const difference = paymentCents(form.amount) - paymentCents(suggestions.amount)
  const hasDifference = integrated && selected.length > 0 && difference !== 0n

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      formRef.current?.closest('.modal-body')?.scrollTo?.({ top: 0 })
      if (step === 'invoice') invoiceRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [step])
  useEffect(() => {
    if (!record && contract) setForm((current) => ({ ...current, supplier_id: contract.supplier_id, kind: contract.kind || current.kind }))
  }, [contract, record])
  useEffect(() => {
    if (!integrated) return
    const next = { ...suggestions }
    if (sourceLoading) { delete next.organization_id; delete next.unit_name }
    setForm((current) => mergePaymentSuggestions(current, next, touched.current))
  }, [integrated, suggestions, sourceLoading])
  useEffect(() => { setConfirmedDifference(false) }, [form.amount, suggestions.amount])

  useEffect(() => {
    if (!integrated || !form.contract_id || step !== 'source') return undefined
    let active = true
    setLoading(true); setListError('')
    const timer = setTimeout(async () => {
      try {
        let response
        if (operationId && form.contract_id === contractId && !seeded.current) {
          const rows = await availablePaymentOperations(contractControlAPI, form.contract_id)
          const source = rows.find((row) => row.id === operationId)
          if (!source) throw new Error('Este serviço não está disponível neste contrato ou já foi conciliado. Selecione outra operação.')
          if (active) { setSelected([source]); seeded.current = true }
        }
        const query = { unbilled: true, page, limit: 25, vehicle_search: search || undefined }
        if (period) {
          const [year, monthNumber] = period.split('-').map(Number)
          query.start = new Date(`${period}-01T00:00:00-03:00`).toISOString()
          const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)
          query.end = new Date(new Date(`${nextMonth}T00:00:00-03:00`).getTime() - 1).toISOString()
        }
        response = await contractControlAPI.operations(form.contract_id, query)
        if (active) setList(response.data)
      } catch (err) { if (active) { setListError(getApiErrorMessage(err, err.message || 'Não foi possível consultar os serviços.')); setList({ data: [], total: 0, pages: 0 }) } }
      finally { if (active) setLoading(false) }
    }, search ? 300 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [integrated, form.contract_id, contractId, step, search, period, page, revision, operationId])

  useEffect(() => {
    const missing = selected.filter((row) => !requested.current.has(row.id))
    if (!missing.length) return
    const version = sourceRevision.current
    missing.forEach((row) => requested.current.add(row.id))
    Promise.allSettled(missing.map((row) => row.source_type === 'MAINTENANCE'
      ? maintenanceAPI.getById(row.source_id) : fuelSuppliesAPI.getById(row.source_id))).then((results) => {
      if (mounted.current && sourceRevision.current === version) setSources((current) => ({ ...current, ...Object.fromEntries(missing.map((row, index) => [row.id, results[index].status === 'fulfilled' ? results[index].value.data : null])) }))
    })
  }, [selected])

  function change(key, value) {
    touched.current[key] = true
    setForm((current) => ({ ...current, [key]: value }))
  }
  function changeContract(id) {
    seeded.current = true
    clearSources()
    setSelected([]); setError(''); setSearch(''); setPeriod(''); setPage(1)
    const next = contracts.find((item) => item.id === id)
    setForm((current) => ({ ...mergePaymentSuggestions(current, { amount: '', competence_month: '', organization_id: '', unit_name: '' }, touched.current), contract_id: id, supplier_id: next?.supplier_id || '', kind: next?.kind || current.kind }))
  }
  function close() { if (!busy.current) { if (created) onSaved(created, { pending: true }); else onClose() } }
  function toggle(row) { setSelected((current) => current.some((item) => item.id === row.id) ? current.filter((item) => item.id !== row.id) : [...current, row]) }
  function clearSources() { sourceRevision.current++; requested.current.clear(); setSources({}) }
  function updateGuided(next) {
    setGuided(next); setSelected([]); setError('')
    setForm((current) => mergePaymentSuggestions(current, { amount: '', competence_month: '', organization_id: '', unit_name: '' }, touched.current))
  }
  async function save(event) {
    event.preventDefault()
    if (busy.current || uncertain) return
    busy.current = true; setSaving(true); setError('')
    let writing = false
    try {
      if (integrated && !selected.length) throw new Error('Selecione pelo menos um serviço realizado.')
      if (hasDifference && (!confirmedDifference || reason.trim().length < 10)) throw new Error('Justifique e confirme o ajuste da diferença antes de salvar.')
      let process = savedRef.current
      if (!process) {
        if (integrated) assertPaymentOperationsCurrent(selected, await availablePaymentOperations(contractControlAPI, form.contract_id))
        writing = true
        const payload = paymentPayload(form, { editing: Boolean(record), operations: integrated ? selected : [], sources })
        const response = record ? await paymentProcessesAPI.update(record.id, payload) : await paymentProcessesAPI.create(payload)
        process = response.data
        writing = false
        if (!record) { savedRef.current = process; setCreated(process) }
      }
      if (integrated) await contractControlAPI.reconcile(process.id, { operation_ids: selected.map((row) => row.id), justification: hasDifference ? reason.trim() : null })
      onSaved(process, { reconciled: integrated })
    } catch (err) {
      if (writing && !record && (err.response?.status >= 500 || (!err.response && (err.request || ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(err.code))))) setUncertain(true)
      setError(getApiErrorMessage(err, err.message || 'Não foi possível salvar o processo.'))
    } finally { busy.current = false; if (mounted.current) setSaving(false) }
  }
  function input(key, label, type = 'text', props = {}) {
    const Input = key === 'amount' ? MoneyInput : 'input'
    return <Field label={label}><Input ref={key === 'process_number' ? invoiceRef : undefined} className="app-input" type={type} value={form[key]} onChange={(event) => change(key, event.target.value)} {...props} /></Field>
  }

  return <FormFields><Modal open title={record ? 'Editar processo' : 'Novo processo de pagamento'} onClose={close} canClose={!saving} className="payment-composer" backdropClassName="payment-composer-backdrop">
    {!record ? <ol className="payment-composer__steps" aria-label="Etapas do cadastro"><li aria-current={step === 'source' ? 'step' : undefined}><span>1</span>Origem e serviços</li><li aria-current={step === 'invoice' ? 'step' : undefined}><span>2</span>Dados da fatura</li></ol> : <p className="payment-composer__intro">Atualize os dados deste processo. A etapa e as operações conciliadas permanecem acessíveis no acompanhamento.</p>}
    {error ? <div ref={errorRef} tabIndex={-1} className="alert alert-error" role="alert">{error}</div> : null}
    {created ? <div className="alert alert-warning" role="status"><strong>Processo {created.process_number} já foi criado.</strong><p>A conciliação ainda precisa ser confirmada. Tentar novamente usa este mesmo processo.</p></div> : null}
    {uncertain ? <div className="alert alert-warning" role="status">Não foi possível confirmar a criação. Confira a fila de processos antes de iniciar outro cadastro.</div> : null}
    <form ref={formRef} className="payment-composer__form" onSubmit={save}>
      <fieldset className="payment-composer__fields" disabled={saving || Boolean(created) || uncertain}>
        {step === 'source' ? <>
          <p className="payment-composer__intro">Selecione os serviços desta fatura para reaproveitar os dados já registrados.</p>
          {control.enabled === true && !control.error ? <div className="payment-composer__modes" aria-label="Origem do processo"><button type="button" aria-pressed={guided} onClick={() => updateGuided(true)}>Serviços realizados</button><button type="button" aria-pressed={!guided} onClick={() => updateGuided(false)}>Preenchimento manual</button></div> : null}
          {control.error ? <p className="alert alert-warning" role="status">{control.error} O cadastro manual permanece disponível.</p> : null}
          <Field label="Contrato da fatura"><select className="app-select" value={form.contract_id} onChange={(event) => changeContract(event.target.value)}><option value="">Selecione o contrato</option>{contracts.map((item) => <option value={item.id} key={item.id}>{item.number} · {item.supplier_name}</option>)}</select></Field>
          {contract ? <div className="payment-composer__context"><span>Empresa contratada<strong>{contract.supplier_name || suppliers.find((s) => s.id === contract.supplier_id)?.name || 'Conforme contrato'}</strong></span><span>Objeto<strong>{form.kind === 'MAINTENANCE' ? 'Manutenção' : 'Combustíveis'}</strong></span></div> : null}
          {integrated && form.contract_id ? <section className="payment-composer__operations" aria-label="Serviços disponíveis para a fatura">
            <div className="payment-composer__section-heading"><h4>Serviços sem conciliação</h4><button type="button" className="ghost-button" onClick={() => { clearSources(); setSelected([]); setRevision((r) => r + 1) }} disabled={loading}>Atualizar serviços</button></div>
            <div className="payment-composer__grid"><Field label="Buscar placa"><input className="app-input" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Placa do veículo" /></Field><Field label="Mês do serviço"><input className="app-input" type="month" value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1) }} /></Field></div>
            {listError ? <p className="alert alert-error" role="alert">{listError}</p> : null}
            {loading ? <p role="status">Consultando serviços…</p> : <>
              <div className="payment-composer__operation-list">{list.data.filter((row) => !row.invoice_process_id).map((row) => <label key={row.id} className="payment-operation" data-selected={selected.some((item) => item.id === row.id)}><input type="checkbox" checked={selected.some((item) => item.id === row.id)} onChange={() => toggle(row)} /><span><strong>{row.vehicle_plate || 'Sem veículo'} <small>{day(row.occurred_at)}</small></strong><span>{row.provider_name || (row.source_type === 'MAINTENANCE' ? 'Manutenção' : 'Abastecimento')}</span><small>{row.organization_name || 'Secretaria não informada'}</small></span><b>{brl(row.amount)}</b></label>)}
                {!list.data.length && !listError ? <p className="payment-composer__empty">Nenhum serviço sem conciliação neste filtro. Você pode cadastrar uma fatura manualmente.</p> : null}</div>
              {list.pages > 1 ? <div className="payment-composer__pagination"><button type="button" className="ghost-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button><span>{page} de {list.pages} · {list.total} serviços</span><button type="button" className="ghost-button" disabled={page >= list.pages} onClick={() => setPage((p) => p + 1)}>Próxima</button></div> : null}
            </>}
            {selected.length ? <div className="payment-composer__selection"><span>{selected.length} serviço(s) selecionado(s)<strong>{brl(suggestions.amount)}</strong></span><button className="ghost-button" type="button" onClick={() => setSelected([])}>Limpar seleção</button><details><summary>Conferir seleção</summary>{selected.map((row) => <div key={row.id}><span>{row.vehicle_plate || row.source_id.slice(0, 8)} · {day(row.occurred_at)} · {brl(row.amount)}</span><button type="button" className="ghost-button" aria-label={`Remover serviço ${row.vehicle_plate || row.source_id.slice(0, 8)} de ${day(row.occurred_at)}`} onClick={() => toggle(row)}>Remover</button></div>)}</details></div> : null}
          </section> : integrated ? <p className="payment-composer__empty">Escolha o contrato para consultar abastecimentos e manutenções realizados.</p> : null}
        </> : <>
          {contract ? <div className="payment-composer__context payment-composer__context--invoice"><span>Contrato {contract.number}<strong>{contract.supplier_name}</strong></span><span>{integrated ? `${selected.length} serviço(s) selecionado(s)` : 'Cadastro do processo'}<strong>{integrated ? brl(suggestions.amount) : form.kind === 'MAINTENANCE' ? 'Manutenção' : 'Combustíveis'}</strong></span></div> : null}
          {integrated ? <p className="payment-composer__autofill" role="status">Dados reaproveitados dos serviços. Confira o valor e complete o documento fiscal.{sourceLoading ? ' Consultando a secretaria…' : selected.some((row) => sources[row.id] === null) ? ' Alguns detalhes de origem não estão acessíveis; confira a secretaria.' : ''}</p> : null}
          {integrated ? <details className="payment-composer__disclosure"><summary>Serviços desta fatura <small>{selected.length} registro(s) · consumo já registrado</small></summary><div className="payment-composer__source-summary">{selected.map((row) => <article key={row.id}><div><strong>{row.vehicle_plate || 'Sem veículo'} · {day(row.occurred_at)}</strong><b>{brl(row.amount)}</b></div><p>{row.provider_name} · {row.organization_name || 'Secretaria não informada'}</p>{sources[row.id]?.service_description ? <p>{sources[row.id].service_description}</p> : sources[row.id]?.fuel_type ? <p>{sources[row.id].fuel_type} · {sources[row.id].liters} L</p> : null}</article>)}</div></details> : null}
          <section className="payment-composer__section"><h4>Dados da fatura</h4><div className="payment-composer__grid">
            {input('process_number', 'Número do processo', 'text', { required: true, maxLength: 80, placeholder: 'Informe o número administrativo' })}
            {input('invoice_number', 'Número da NF', 'text', { maxLength: 80 })}
            {input('billing_number', 'Número da fatura', 'text', { maxLength: 80 })}
            {input('issue_date', 'Emissão', 'date')}
            {input('due_date', 'Vencimento', 'date')}
            {input('competence_month', 'Competência', 'month')}
            {input('amount', 'Valor da fatura (R$)', 'number', { step: '0.01', min: '0', required: integrated })}
          </div>
            {hasDifference ? <div className="payment-composer__difference"><strong>Diferença de {brl(centsAmount(difference))} em relação aos serviços</strong><p>A diferença será registrada como ajuste no contrato.</p><Field label="Justificativa da diferença"><textarea className="app-textarea" required minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><label className="payment-composer__check"><input type="checkbox" checked={confirmedDifference} required onChange={(event) => setConfirmedDifference(event.target.checked)} />Confirmo o ajuste desta diferença no contrato.</label></div> : null}
          </section>
          <details className="payment-composer__disclosure" open={!integrated || undefined}><summary>Identificação e dados reaproveitados <small>{integrated ? `${month(form.competence_month)} · ${form.unit_name || 'Conferir secretaria'}` : 'Tipo, empresa, contrato e unidade'}</small></summary><div className="payment-composer__grid">
            <Field label="Tipo"><select className="app-select" value={form.kind} disabled={Boolean(form.contract_id)} onChange={(event) => change('kind', event.target.value)}><option value="FUEL">Combustíveis</option><option value="MAINTENANCE">Manutenção</option></select></Field>
            <Field label="Fornecedor"><select className="app-select" value={form.supplier_id} disabled={Boolean(form.contract_id)} onChange={(event) => change('supplier_id', event.target.value)}><option value="">Selecione</option>{suppliers.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></Field>
            {record ? <Field label="Contrato"><select className="app-select" value={form.contract_id} onChange={(event) => { const next = contracts.find((c) => c.id === event.target.value); setForm((current) => ({ ...current, contract_id: event.target.value, supplier_id: next?.supplier_id || current.supplier_id, kind: next?.kind || current.kind })) }}><option value="">Sem contrato</option>{contracts.map((c) => <option value={c.id} key={c.id}>{c.number}</option>)}</select></Field> : null}
            <Field label="Secretaria"><select className="app-select" value={form.organization_id} onChange={(event) => { change('organization_id', event.target.value); change('unit_name', organizations.find((o) => o.id === event.target.value)?.name || '') }}><option value="">{selected.length > 1 && !suggestions.organization_id ? 'Conferir / múltiplas secretarias' : 'Não informada'}</option>{organizations.map((o) => <option value={o.id} key={o.id}>{o.name}</option>)}</select></Field>
            {input('unit_name', 'Unidade', 'text', { maxLength: 255 })}
          </div></details>
          <details className="payment-composer__disclosure"><summary>Execução financeira <small>Empenho, liquidação e pagamento</small></summary><div className="payment-composer__grid">
            {input('commitment_number', 'Empenho', 'text', { maxLength: 80 })}{input('commitment_date', 'Data do empenho', 'date')}
            {input('liquidation_number', 'Liquidação', 'text', { maxLength: 80 })}{input('liquidation_date', 'Data da liquidação', 'date')}
            {input('payment_order_number', 'Ordem de pagamento', 'text', { maxLength: 80 })}{input('payment_order_date', 'Data da ordem de pagamento', 'date')}{input('paid_at', 'Pago em', 'date')}
          </div></details>
          <details className="payment-composer__disclosure"><summary>Responsável e observações <small>Localização e notas do processo</small></summary><div className="payment-composer__grid">{input('stage_owner', 'Responsável', 'text', { maxLength: 120 })}{input('location', 'Localização', 'text', { maxLength: 255 })}</div><Field label="Notas"><textarea className="app-textarea" rows={3} maxLength={4000} value={form.notes} onChange={(event) => change('notes', event.target.value)} /></Field></details>
        </>}
      </fieldset>
      <footer className="payment-composer__footer"><span>{step === 'source' ? integrated ? `${selected.length} serviço(s) · ${brl(suggestions.amount || 0)}` : 'Cadastro manual' : record ? 'Edição dos dados cadastrais' : 'Será criado na etapa Montagem'}</span><div>
        {created || uncertain ? <button className="ghost-button" type="button" disabled={saving} onClick={close}>{created ? 'Abrir processo salvo' : 'Conferir fila de processos'}</button> : step === 'invoice' && !record ? <button className="ghost-button" type="button" disabled={saving} onClick={() => setStep('source')}>Alterar origem</button> : <button className="ghost-button" type="button" disabled={saving} onClick={close}>Cancelar</button>}
        {step === 'source' ? <button className="app-button" type="button" disabled={control.enabled === null || (integrated && (!form.contract_id || !selected.length || loading || Boolean(listError) || sourceLoading))} onClick={(event) => { event.preventDefault(); setStep('invoice') }}>Continuar</button>
          : <button className="app-button" type="submit" disabled={saving || uncertain || sourceLoading || (hasDifference && (!confirmedDifference || reason.trim().length < 10))}>{saving ? 'Salvando…' : created ? 'Tentar conciliação novamente' : integrated ? 'Salvar e conciliar' : 'Salvar processo'}</button>}
      </div></footer>
    </form>
  </Modal></FormFields>
}
