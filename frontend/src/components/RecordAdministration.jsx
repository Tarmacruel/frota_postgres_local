import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/client'
import Modal from './Modal'
import GuidedForm, { FormSection } from './GuidedForm'
import { useSystemSettings } from '../hooks/useSystemSettings'
import { getApiErrorMessage } from '../utils/apiError'
import SearchableSelect from './SearchableSelect'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { mergeSettingsDraft } from '../utils/settingsDraft'
import { SettingsConflictChoices } from './SettingsComparison'

function errorText(error) { return getApiErrorMessage(error, 'Não foi possível concluir. Confira os dados e tente novamente.') }

function RecordEditor({ module, record, onClose, onSaved }) {
  const { values: settings } = useSystemSettings()
  const catalog = useMasterDataCatalog({ organizationsOnly: true })
  const [draft, setDraft] = useState(record.values)
  const [custom, setCustom] = useState(record.custom_fields || {})
  const [inactive, setInactive] = useState(record.inactive)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [history, setHistory] = useState(null)
  const [effectConfirmed, setEffectConfirmed] = useState(false)
  const [currentRecord, setCurrentRecord] = useState(record)
  const [stale, setStale] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [conflict, setConflict] = useState(null)
  const [choices, setChoices] = useState({})
  const [historyError, setHistoryError] = useState('')
  const lifecycle = currentRecord.lifecycle || { steps: [], can_confirm: true, has_effects: false }
  const changingVisibility = inactive !== currentRecord.inactive
  const customDefinitions = settings.forms?.[module]?.custom?.filter((field) => field.active !== false) || []
  const changes = Object.fromEntries(Object.entries(draft).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(currentRecord.values[key])))
  function applyReference(data, merged) {
    setCurrentRecord(data); setDraft(merged.values); setCustom(merged.custom_fields || {}); setInactive(merged.inactive)
    setEffectConfirmed(false); setStale(false); setConflict(null); setError('')
  }
  async function refresh() {
    setRefreshing(true)
    try {
      const { data } = await api.get(`/record-admin/${module}/${record.id}`)
      const base = { values: currentRecord.values, custom_fields: currentRecord.custom_fields || {}, inactive: currentRecord.inactive }
      const local = { values: draft, custom_fields: custom, inactive }
      const remote = { values: data.values, custom_fields: data.custom_fields || {}, inactive: data.inactive }
      const merged = mergeSettingsDraft(base, local, remote)
      if (merged.conflicts.length) { setConflict({ data, base, local, remote, conflicts: merged.conflicts }); setChoices({}) }
      else applyReference(data, merged.values)
    } catch (cause) { setError(errorText(cause)) }
    finally { setRefreshing(false) }
  }
  async function loadHistory() {
    setHistoryError('')
    try { const { data } = await api.get(`/record-admin/${module}/${record.id}/history`); setHistory(data) }
    catch { setHistoryError('Não foi possível carregar o histórico. Tente novamente.'); setHistory(null) }
  }
  async function save(event) {
    event.preventDefault()
    if (saving || stale || conflict) return
    setSaving(true); setError('')
    const body = { expected_revision: currentRecord.revision, expected_updated_at: currentRecord.updated_at,
      justification: reason, inactive, changes,
      custom_fields: Object.fromEntries(customDefinitions.filter((field) => Object.hasOwn(custom, field.key)).map((field) => [field.key, custom[field.key]])),
      confirmation: deleting ? confirmation : null,
      effect_action: changingVisibility && lifecycle.has_effects && effectConfirmed ? lifecycle.restoring ? 'restore' : 'reverse' : 'none',
      expected_effect_token: changingVisibility ? lifecycle.token : null }
    try {
      if (deleting) await api.delete(`/record-admin/${module}/${record.id}`, { data: body })
      else await api.patch(`/record-admin/${module}/${record.id}`, body)
      onSaved(deleting ? 'Registro excluído.' : inactive !== record.inactive ? inactive ? 'Registro inativado. Agora somente o superusuário pode consultá-lo.' : 'Registro reativado.' : 'Correção registrada no histórico.')
    } catch (cause) { setError(errorText(cause)); setStale(cause.response?.status === 409); setEffectConfirmed(false) }
    finally { setSaving(false) }
  }
  function control(field, value, onChange) {
    if (field.key === 'organization_id') return <SearchableSelect value={value || ''} onChange={(next) => onChange(next || null)}
      options={catalog.organizations.map((item) => ({ value: item.id, label: item.name }))} ariaLabel={field.label}
      required={field.required} allowClear={!field.required} loading={catalog.loading} placeholder="Selecione a secretaria" />
    const attributes = { className: 'app-input', value: value ?? '', required: field.required,
      onChange: (event) => onChange(event.target.value === '' ? null : field.type === 'boolean' ? event.target.value === 'true'
        : field.type === 'number' ? Number(event.target.value) : event.target.value) }
    if (field.type === 'select' || field.type === 'boolean') return <select {...attributes} className="app-select" value={value == null ? '' : String(value)}>
      <option value="">Selecione</option>{(field.type === 'boolean' ? ['true', 'false'] : field.options || []).map((option) => <option key={option} value={option}>{field.type === 'boolean' ? option === 'true' ? 'Sim' : 'Não' : option}</option>)}
    </select>
    if (field.type === 'datetime-local') return <input {...attributes} type="datetime-local" value={value ? new Date(value).toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16) : ''}
      onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : null)} />
    if (field.type === 'text' && (!field.max_length || field.max_length > 500)) return <textarea {...attributes} rows={3} maxLength={field.max_length || 4000} />
    return <input {...attributes} type={field.type} step={field.type === 'number' ? 'any' : undefined} maxLength={field.max_length || undefined} />
  }
  return <Modal open title={`Administrar · ${record.label}`} onClose={saving ? () => {} : onClose} className="record-editor">
    <GuidedForm module="" busy={saving} formError={error} onSubmit={save} className="record-editor__form">
      <FormSection title="Dados do registro" description="A correção registra os valores anteriores, os novos e sua justificativa.">
        <p className="helper-text">{record.protected_hint}</p>
        <div className="settings-field-grid">
          {record.fields.map((field) => <label className="form-field" key={field.key}>
            <span className="record-editor__label"><span>{field.label}{field.required ? <span className="guided-form__required"> *</span> : null}</span>{!field.required && draft[field.key] != null && draft[field.key] !== '' ? <button className="record-editor__clear" type="button" onClick={() => setDraft({ ...draft, [field.key]: null })} aria-label={`Limpar ${field.label}`}>Limpar</button> : null}</span>
            {control(field, draft[field.key], (value) => setDraft({ ...draft, [field.key]: value }))}
          </label>)}
          {customDefinitions.map((field) => <label className="form-field" key={field.key}><span>{field.label}{field.required ? <span className="guided-form__required"> *</span> : null}</span>
            {control(field, custom[field.key], (value) => setCustom({ ...custom, [field.key]: value }))}</label>)}
        </div>
      </FormSection>
      <FormSection title="Visibilidade e conferência">
        {stale ? <div className="settings-recovery"><p>O registro mudou desde a abertura. Confira a versão atual sem perder suas edições.</p><button type="button" className="secondary-button" disabled={refreshing} onClick={refresh}>{refreshing ? 'Consultando…' : 'Atualizar registro preservando edições'}</button></div> : null}
        {conflict ? <section className="settings-recovery"><p>Escolha os valores dos campos alterados pelas duas sessões.</p><SettingsConflictChoices conflicts={conflict.conflicts} choices={choices} onChoose={(key, value) => setChoices((current) => ({ ...current, [key]: value }))} describe={(entry) => record.fields.find((field) => field.key === entry.path.at(-1))?.label || customDefinitions.find((field) => field.key === entry.path.at(-1))?.label || 'Visibilidade do registro'} />
          <button className="secondary-button" type="button" disabled={conflict.conflicts.some((entry) => !choices[entry.key])} onClick={() => applyReference(conflict.data, mergeSettingsDraft(conflict.base, conflict.local, conflict.remote, choices).values)}>Aplicar escolhas e conferir novamente</button></section> : null}
        <label className="settings-toggle"><input type="checkbox" checked={inactive} onChange={(event) => setInactive(event.target.checked)} />
          <span><strong>Inativar registro</strong><small>Confira os efeitos abaixo. O registro será ocultado dos demais perfis após resolver entregas, reservas e gastos.</small></span></label>
        {changingVisibility ? <section className="record-lifecycle" aria-label="Conferência dos efeitos">
          <h4>{inactive ? 'Preparar inativação' : 'Preparar reativação'}</h4>
          <ol>{lifecycle.steps.map((step) => <li key={step.key} data-blocked={step.blocked}><strong>{step.label}</strong><p>{step.message}</p><a className="secondary-button" href={step.href} target="_blank" rel="noreferrer">{step.action} ↗</a>
            {step.can_release_invoice ? <button type="button" className="secondary-button" disabled={saving || reason.trim().length < 8} onClick={async () => {
              setSaving(true); setError('')
              try { const { data } = await api.post(`/record-admin/${module}/${record.id}/release-invoice`, { expected_revision: currentRecord.revision,
                justification: reason, expected_effect_token: lifecycle.token }); setCurrentRecord(data); setEffectConfirmed(false) }
              catch (cause) { setError(errorText(cause)) }
              finally { setSaving(false) }
            }}>Desvincular da fatura cancelada</button> : null}</li>)}</ol>
          {lifecycle.has_effects ? <><p><strong>{lifecycle.restoring ? 'Consumo a restabelecer' : 'Consumo a estornar'}: {Number(lifecycle.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></p>
            {Number(lifecycle.reserved) > 0 ? <p>Reserva a liberar: {Number(lifecycle.reserved).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. O pedido será cancelado; uma reativação posterior mantém o cancelamento até nova emissão.</p> : null}
            {lifecycle.quantities?.length ? <ul>{lifecycle.quantities.map((item) => <li key={`${item.item_id}-${item.effect}`}><strong>{item.label}</strong>: {Number(item.quantity).toLocaleString('pt-BR')} {item.unit} · {item.effect === 'reservation' ? 'reserva a liberar' : lifecycle.restoring ? 'consumo a restabelecer' : 'consumo a estornar'}</li>)}</ul> : null}
            <label className="settings-checkbox"><input type="checkbox" required checked={effectConfirmed} onChange={(event) => setEffectConfirmed(event.target.checked)} />Conferi o efeito financeiro e as quantidades. Autorizo {lifecycle.restoring ? 'restabelecer o consumo' : 'o estorno e a liberação das reservas'} junto com esta alteração.</label></> : <p>Sem reserva ou consumo de contrato a alterar. {inactive ? 'O registro será ocultado dos demais perfis.' : 'O registro voltará a aparecer na situação atual, sem recriar entregas ou pedidos já cancelados.'}</p>}
          {lifecycle.steps.length ? <button className="secondary-button" type="button" disabled={refreshing} onClick={refresh}>Atualizar conferência após resolver as pendências</button> : null}
        </section> : null}
        <label className="form-field">Justificativa<input required minLength={8} maxLength={1000} className="app-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="O que está sendo corrigido e por quê?" /></label>
        <p className="helper-text">{Object.keys(changes).length} campo(s) alterado(s) · {inactive ? 'Acesso exclusivo do superusuário' : 'Visibilidade normal conforme permissões'}</p>
        <details className="record-editor__history" onToggle={(event) => {
          if (event.currentTarget.open && history === null && !historyError) loadHistory()
        }}><summary>Histórico administrativo</summary>
          {historyError ? <><p role="alert">{historyError}</p><button type="button" className="secondary-button" onClick={loadHistory}>Recarregar histórico</button></> : history === null ? <p>Carregando…</p> : history.length ? history.map((item) => <article key={item.id}><strong>{item.action}</strong><span>{new Date(item.created_at).toLocaleString('pt-BR')} · {item.actor_name}</span><p>{item.justification}</p></article>) : <p>Sem alterações administrativas registradas.</p>}
        </details>
        <details className="record-editor__danger" open={deleting}><summary onClick={(event) => { event.preventDefault(); setDeleting(!deleting) }}>Excluir permanentemente</summary>
          <p>A exclusão verifica vínculos e histórico. Registros vinculados podem ser inativados.</p>
          {deleting ? <label className="form-field">Digite EXCLUIR para confirmar<input required pattern="EXCLUIR" className="app-input" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label> : null}
        </details>
      </FormSection>
      <div className="modal-actions"><button className="secondary-button" type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className={deleting ? 'danger-button' : 'primary-button'} disabled={saving || stale || Boolean(conflict) || (!deleting && changingVisibility && (!lifecycle.can_confirm || lifecycle.has_effects && !effectConfirmed))} type="submit">{saving ? 'Salvando…' : deleting ? 'Excluir registro' : changingVisibility ? inactive ? 'Concluir inativação' : 'Concluir reativação' : 'Salvar alterações'}</button></div>
    </GuidedForm>
  </Modal>
}

export default function RecordAdministration({ initialModule = 'vehicles', initialRecordId = '' }) {
  const [catalog, setCatalog] = useState([])
  const [module, setModule] = useState(initialModule)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('all')
  const [page, setPage] = useState(1)
  const [records, setRecords] = useState({ data: [], total: 0 })
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const requestId = useRef(0)
  const detailRequestId = useRef(0)
  const [opening, setOpening] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  function changeFilter(update) {
    requestId.current += 1; detailRequestId.current += 1
    setSelected(null); setOpening(false); setRecords({ data: [], total: 0 }); setLoading(true); setFeedback('')
    update()
  }
  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const { data } = await api.get(`/record-admin/${module}`, { params: { search: search || undefined,
        inactive: scope === 'all' ? undefined : scope === 'inactive', page } })
      if (id === requestId.current) { setRecords(data); setError('') }
    } catch (cause) { if (id === requestId.current) setError(errorText(cause)) }
    finally { if (id === requestId.current) setLoading(false) }
  }, [module, search, scope, page])
  const loadCatalog = useCallback(async () => {
    try { const { data } = await api.get('/record-admin/catalog'); setCatalog(data); setCatalogError('') }
    catch (cause) { setCatalogError(errorText(cause)) }
  }, [])
  useEffect(() => { loadCatalog() }, [loadCatalog])
  useEffect(() => { const timer = setTimeout(load, 300); return () => { clearTimeout(timer); requestId.current += 1 } }, [load])
  useEffect(() => () => { detailRequestId.current += 1 }, [])
  const open = useCallback(async (id) => {
    const request = ++detailRequestId.current
    setError(''); setOpening(true)
    try { const { data } = await api.get(`/record-admin/${module}/${id}`); if (request === detailRequestId.current) setSelected(data) }
    catch (cause) { if (request === detailRequestId.current) setError(errorText(cause)) }
    finally { if (request === detailRequestId.current) setOpening(false) }
  }, [module])
  const initialOpen = useRef(initialRecordId)
  useEffect(() => {
    if (initialOpen.current) { const id = initialOpen.current; initialOpen.current = ''; open(id) }
  }, [open])
  return <section className="record-administration">
    <header className="settings-section-heading"><h3>Registros do sistema</h3><p>Localize um registro para corrigir informações, inativar, reativar ou excluir.</p></header>
    <div className="record-admin-filters">
      <label>Módulo<select aria-label="Módulo" className="app-select" value={module} onChange={(event) => changeFilter(() => { setModule(event.target.value); setPage(1) })}>{catalog.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label>Buscar<input className="app-input" value={search} onChange={(event) => changeFilter(() => { setSearch(event.target.value); setPage(1) })} placeholder="Placa, nome, informação ou ID" /></label>
      <label>Visibilidade<select className="app-select" value={scope} onChange={(event) => changeFilter(() => { setScope(event.target.value); setPage(1) })}><option value="all">Todos</option><option value="active">Visibilidade normal</option><option value="inactive">Somente superusuário</option></select></label>
    </div>
    {catalogError ? <div className="alert alert-error" role="alert">{catalogError}<button type="button" className="secondary-button" onClick={loadCatalog}>Recarregar módulos</button></div> : null}
    {error ? <div className="alert alert-error" role="alert">{error}<button type="button" className="secondary-button" onClick={load}>Consultar novamente</button></div> : null}
    {feedback ? <div className="alert alert-success" role="status">{feedback}</div> : null}
    <p className="helper-text">{loading ? 'Consultando…' : `${records.total} registro(s)`}</p>
    {opening ? <p role="status">Abrindo registro…</p> : null}
    <div className="record-admin-list" aria-busy={loading || opening}>{records.data.map((record) => <button type="button" disabled={loading || opening} key={record.id} onClick={() => open(record.id)}>
      <span><strong>{record.label}</strong><small>{record.id}</small></span><span className={record.inactive ? 'settings-badge settings-badge--private' : 'settings-badge'}>{record.inactive ? 'Somente superusuário' : 'Visibilidade normal'}</span><span aria-hidden="true">›</span>
    </button>)}</div>
    {!loading && !records.data.length ? <p className="empty-state">Nenhum registro neste filtro.</p> : null}
    <div className="settings-pagination"><button type="button" className="secondary-button" disabled={page <= 1 || loading} onClick={() => changeFilter(() => setPage(page - 1))}>Anterior</button><span>Página {page} de {Math.max(1, Math.ceil(records.total / 20))}</span><button type="button" className="secondary-button" disabled={page * 20 >= records.total || loading} onClick={() => changeFilter(() => setPage(page + 1))}>Próxima</button></div>
    {selected ? <RecordEditor key={`${module}-${selected.id}`} module={module} record={selected} onClose={() => setSelected(null)} onSaved={(message) => { setSelected(null); setFeedback(message); load() }} /> : null}
  </section>
}
