import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { brandingStyles, isBrandColor } from '../utils/systemBranding'
import { mergeSettingsDraft, newCustomFieldKey, settingNames, settingsDifferences } from '../utils/settingsDraft'
import { useSystemSettings } from '../hooks/useSystemSettings'
import ModuleIcon from '../components/ModuleIcon'
import Modal from '../components/Modal'
import RecordAdministration from '../components/RecordAdministration'
import SettingsComparison, { SettingsConflictChoices } from '../components/SettingsComparison'
import { getApiErrorMessage } from '../utils/apiError'

const tabs = [{ key: 'identity', label: 'Identidade', icon: 'station' }, { key: 'appearance', label: 'Aparência', icon: 'settings' },
  { key: 'forms', label: 'Formulários', icon: 'registry' }, { key: 'records', label: 'Registros', icon: 'audit' }]
const moduleLabels = { vehicles: 'Veículos', drivers: 'Condutores', possession: 'Posses', vehicle_loans: 'Empréstimos',
  claims: 'Sinistros', fines: 'Multas', maintenance: 'Manutenções', fuel_supplies: 'Abastecimentos', payment_processes: 'Processos de pagamento' }
const identityFields = [{ key: 'systemName', label: 'Nome do sistema', max: 60, required: true },
  { key: 'municipality', label: 'Nome da prefeitura', max: 180, required: true }, { key: 'city', label: 'Município', max: 100, required: true },
  { key: 'state', label: 'UF', max: 2, required: true },
  { key: 'subtitle', label: 'Descrição do sistema', max: 180 }, { key: 'administrationSecretariat', label: 'Secretaria administrativa', max: 180 },
  { key: 'fleetDepartment', label: 'Setor responsável', max: 120 }, { key: 'cnpj', label: 'CNPJ', max: 30 },
  { key: 'addressLine', label: 'Endereço institucional', max: 250 }]
const palettes = [{ label: 'Azul institucional', color: '#2452e8' }, { label: 'Verde', color: '#087f5b' },
  { label: 'Petróleo', color: '#096b7b' }, { label: 'Violeta', color: '#6d28d9' }, { label: 'Terracota', color: '#a54423' }]
const copy = (value) => JSON.parse(JSON.stringify(value))

function validateSettings(values, catalog) {
  const issues = []
  for (const field of identityFields) {
    const value = values.identity[field.key].trim()
    const minimum = field.key === 'municipality' ? 3 : 2
    if (field.required && value.length < minimum || field.key === 'state' && !/^[A-Z]{2}$/.test(value)) {
      issues.push({ key: field.key, section: 'identity', message: `${field.label}: informe ${field.key === 'state' ? 'a sigla com duas letras' : `pelo menos ${minimum} caracteres`}.` })
    } else if (/[<>]/.test(value) || [...value].some((char) => char.charCodeAt(0) < 32)) issues.push({ key: field.key, section: 'identity', message: `${field.label}: use texto simples, sem marcação.` })
  }
  for (const key of ['primary', 'sidebar']) {
    if (!isBrandColor(values.appearance[key])) issues.push({ key, section: 'appearance', message: `${settingNames[key]}: informe # e seis caracteres, como #2452e8.` })
  }
  for (const [module, config] of Object.entries(values.forms)) {
    for (const [key, field] of Object.entries(config.fields)) {
      if (!field.label.trim()) issues.push({ key, section: 'forms', module, message: `${moduleLabels[module]}: informe o nome exibido de ${catalog[module]?.find((entry) => entry.key === key)?.label || key}.` })
    }
    for (const field of config.custom) {
      if (field.label.trim().length < 2) issues.push({ key: field.key, section: 'forms', module, message: `${moduleLabels[module]}: o nome do campo adicional precisa ter ao menos dois caracteres.` })
    }
  }
  return issues
}

export function SettingsPreview({ values, mobile = false }) {
  const [active, setActive] = useState('fleet')
  const style = brandingStyles(values)
  const navigation = [{ key: 'home', label: 'Início' }, { key: 'fleet', label: 'Veículos' }, { key: 'loans', label: 'Empréstimos' },
    { key: 'driver', label: 'Condutores' }, { key: 'fuel', label: 'Abastecimentos' }, { key: 'contract', label: 'Contratos e saldos' }]
  return <div className={`settings-preview ${mobile ? 'settings-preview--mobile' : ''}`} data-preview-density={values.appearance.density} style={style} aria-label="Prévia da identidade do sistema">
    <div className="settings-preview__frame">
      <aside>
        <div className="settings-preview__brand"><img src={values.identity.logoPath} alt="Logo na prévia" /><span><strong>{values.identity.systemName}</strong><small>{values.identity.city}</small></span></div>
        <nav aria-label="Navegação da prévia">{navigation.map((item) => <button key={item.key} type="button" aria-pressed={active === item.key} onClick={() => setActive(item.key)}>
          <ModuleIcon name={values.icons[item.key] || item.key} /><span>{item.label}</span></button>)}</nav>
      </aside>
      <div className="settings-preview__main"><div className="settings-preview__topbar"><ModuleIcon name={values.icons[active] || active} /><strong>{navigation.find((item) => item.key === active)?.label}</strong><span>JD</span></div>
        <section><div className="settings-preview__title"><h4>{navigation.find((item) => item.key === active)?.label}</h4><button type="button" className="settings-preview__action">Novo registro</button></div>
          <div className="settings-preview__filters">Buscar por placa ou nome…</div>
          <div className="settings-preview__summary"><strong>24 <small>Ativos</small></strong><strong>3 <small>Pendentes</small></strong></div>
          <div className="settings-preview__table"><span>REGISTRO</span><span>SITUAÇÃO</span><strong>Veículo de exemplo</strong><small>Ativo</small><strong>Veículo de exemplo</strong><small>Ativo</small><strong>Veículo de exemplo</strong><small>Pendente</small></div>
        </section>
        <footer>{values.identity.municipality}</footer>
      </div>
    </div>
    <p className="helper-text">Prévia interativa · dados ilustrativos · alterações ainda não publicadas</p>
  </div>
}

function FormsEditor({ values, catalog, update, module, setModule, showErrors }) {
  const config = values.forms[module] || { fields: {}, custom: [] }
  const fields = catalog?.[module] || []
  function change(next) { update('forms', { ...values.forms, [module]: next }) }
  function rule(field, patch) {
    change({ ...config, fields: { ...config.fields, [field.key]: { label: field.label, visible: true, required: field.required, ...config.fields[field.key], ...patch } } })
  }
  function custom(index, patch) { change({ ...config, custom: config.custom.map((field, position) => position === index ? { ...field, ...patch } : field) }) }
  function addCustom() {
    change({ ...config, custom: [...config.custom, { key: newCustomFieldKey(), label: 'Novo campo', type: 'text', required: false, active: true }] })
  }
  return <>
    <header className="settings-section-heading"><h3>Campos dos formulários</h3><p>Renomeie, organize a visibilidade e acrescente informações ao cadastro.</p></header>
    <label className="form-field">Formulário<select className="app-select" value={module} onChange={(event) => setModule(event.target.value)}>{Object.entries(moduleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <div className="settings-field-list"><div className="settings-field-list__head"><span>Nome exibido</span><span>Exibir</span><span>Obrigatório</span></div>
      {fields.map((field) => {
        const current = config.fields[field.key] || { label: field.label, visible: true, required: field.required }
        return <div className="settings-field-list__row" key={field.key}>
          <label><span className="helper-text">{field.label}</span><input aria-label={`Nome exibido para ${field.label}`} className="app-input" required maxLength={80} aria-invalid={showErrors && !current.label.trim() || undefined} value={current.label} onChange={(event) => rule(field, { label: event.target.value })} /></label>
          <label className="settings-flag"><input type="checkbox" aria-label={`Exibir ${field.label}`} disabled={field.required || field.locked_visibility} checked={current.visible} onChange={(event) => rule(field, { visible: event.target.checked, ...(event.target.checked ? {} : { required: false }) })} /></label>
          <label className="settings-flag"><input type="checkbox" aria-label={`Tornar ${field.label} obrigatório`} disabled={field.required || !current.visible} checked={current.required} onChange={(event) => rule(field, { required: event.target.checked })} /></label>
        </div>
      })}
    </div>
    <p className="helper-text">Campos que identificam o registro permanecem obrigatórios. Ocultar um campo preserva os dados já cadastrados.</p>
    <header className="settings-section-heading settings-section-heading--inline"><div><h3>Campos adicionais</h3><p>Os valores são salvos junto ao registro.</p></div><button className="secondary-button" type="button" disabled={config.custom.length >= 20} onClick={addCustom}>+ Adicionar campo</button></header>
    {!config.custom.length ? <p className="settings-empty">Nenhum campo adicional neste formulário.</p> : null}
    <div className="settings-custom-list">{config.custom.map((field, index) => <section key={field.key}>
      <label className="form-field">Nome do campo<input className="app-input" required minLength={2} aria-invalid={showErrors && field.label.trim().length < 2 || undefined} value={field.label} maxLength={80} onChange={(event) => custom(index, { label: event.target.value })} /></label>
      <label className="form-field">Tipo<select className="app-select" value={field.type} onChange={(event) => custom(index, { type: event.target.value })}><option value="text">Texto</option><option value="number">Número</option><option value="date">Data</option><option value="boolean">Sim / Não</option></select></label>
      <label className="settings-checkbox"><input type="checkbox" checked={field.required} onChange={(event) => custom(index, { required: event.target.checked })} />Obrigatório</label>
      <button type="button" className="record-editor__clear" onClick={() => change({ ...config, custom: config.custom.filter((_, position) => position !== index) })} aria-label={`Excluir campo ${field.label}`}>Excluir campo</button>
    </section>)}</div>
    <div className="settings-form-preview"><h4>Prévia dos campos</h4><div className="settings-field-grid">
      {fields.filter((field) => config.fields[field.key]?.visible !== false).slice(0, 5).map((field) => <label className="form-field" key={field.key}>{config.fields[field.key]?.label || field.label}{field.required || config.fields[field.key]?.required ? ' *' : ''}<input className="app-input" placeholder="Prévia" readOnly /></label>)}
      {config.custom.filter((field) => field.active !== false).map((field) => <label className="form-field" key={field.key}><span>{field.label}{field.required ? <span className="guided-form__required"> *</span> : null}</span>{field.type === 'boolean' ? <select className="app-select" disabled><option>Selecione: Sim / Não</option></select> : <input type={field.type} className="app-input" placeholder="Campo adicional" readOnly />}</label>)}
    </div></div>
  </>
}

export default function SystemSettingsPage() {
  const system = useSystemSettings()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const section = tabs.some((tab) => tab.key === params.get('section')) ? params.get('section') : 'identity'
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [review, setReview] = useState(false)
  const [reason, setReason] = useState('')
  const [mobilePreview, setMobilePreview] = useState(false)
  const [formModule, setFormModule] = useState('vehicles')
  const [showErrors, setShowErrors] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [conflict, setConflict] = useState(null)
  const [choices, setChoices] = useState({})
  const [leaveTo, setLeaveTo] = useState(null)
  const fileRef = useRef(null)
  async function load() {
    setLoading(true)
    try { const { data } = await api.get('/system-settings'); setSaved(data); setDraft(copy(data.values)); setError('') }
    catch (cause) { setError(getApiErrorMessage(cause, 'Não foi possível carregar os parâmetros.')) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const dirty = Boolean(saved && draft && JSON.stringify(saved.values) !== JSON.stringify(draft))
  useEffect(() => {
    const onLeave = (event) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty])
  useEffect(() => {
    const onLink = (event) => {
      if (!dirty || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const anchor = event.target.closest('a[href]')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin || destination.pathname === '/parametros') return
      event.preventDefault(); event.stopPropagation()
      setLeaveTo(destination.pathname + destination.search + destination.hash)
    }
    document.addEventListener('click', onLink, true)
    return () => document.removeEventListener('click', onLink, true)
  }, [dirty])
  const issues = useMemo(() => draft ? validateSettings(draft, saved.form_catalog) : [], [draft, saved])
  const comparison = useMemo(() => saved && draft ? settingsDifferences(saved.values, draft, { ...saved, modules: moduleLabels }) : [], [saved, draft])
  const changes = useMemo(() => {
    if (!saved || !draft) return []
    return ['identity', 'appearance', 'icons', 'forms'].filter((key) => JSON.stringify(saved.values[key]) !== JSON.stringify(draft[key]))
  }, [saved, draft])
  function update(key, value) { setDraft((current) => ({ ...current, [key]: value })); setFeedback('') }
  function goToIssue(issue) {
    setParams((current) => { const next = new URLSearchParams(current); next.set('section', issue.section); return next })
    if (issue.module) setFormModule(issue.module)
  }
  function openReview(event) {
    event.preventDefault(); setShowErrors(true); setError('')
    if (issues.length) { goToIssue(issues[0]); return }
    setReview(true)
  }
  async function reconcile() {
    setReconciling(true); setError('')
    try {
      const { data } = await api.get('/system-settings')
      const merged = mergeSettingsDraft(saved.values, draft, data.values)
      setReview(false)
      if (!merged.conflicts.length) {
        setSaved(data); setDraft(copy(merged.values)); setStale(false)
        setFeedback('Referência atualizada. Suas edições e as alterações da outra sessão foram preservadas. Confira novamente antes de publicar.')
      } else { setConflict({ remote: data, base: saved.values, local: draft, conflicts: merged.conflicts }); setChoices({}) }
    } catch (cause) { setError(getApiErrorMessage(cause, 'Não foi possível atualizar a referência. Seu rascunho foi mantido.')) }
    finally { setReconciling(false) }
  }
  async function upload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Escolha uma imagem PNG, JPG ou WEBP de até 2 MB.'); event.target.value = ''; return }
    setUploading(true); setError('')
    try { const body = new FormData(); body.append('file', file); const { data } = await api.post('/system-settings/logo', body); setDraft((current) => ({ ...current, identity: { ...current.identity, logoPath: data.logoPath } })); setFeedback('') }
    catch (cause) { setError(getApiErrorMessage(cause, 'Não foi possível enviar a logo.')) }
    finally { setUploading(false); event.target.value = '' }
  }
  async function save(event) {
    event.preventDefault()
    if (saving || stale || reason.trim().length < 8) return
    setSaving(true); setError('')
    try {
      const { data } = await api.put('/system-settings', { expected_revision: saved.revision, values: draft, justification: reason })
      system.publish(data); setSaved(data); setDraft(copy(data.values)); setReason(''); setReview(false); setShowErrors(false)
      setFeedback('Parâmetros publicados. A identidade e os formulários já usam a nova configuração.')
    } catch (cause) { setError(getApiErrorMessage(cause, 'Não foi possível salvar. Seu rascunho foi mantido.')); setStale(cause.response?.status === 409) }
    finally { setSaving(false) }
  }
  return <div className="surface-panel operation-page system-settings-page">
    <header className="settings-page-header"><div><span className="settings-eyebrow">Administração do sistema</span><h2>Parâmetros</h2></div><span className="settings-badge settings-badge--private">Superusuário</span></header>
    <nav className="settings-tabs" aria-label="Áreas dos parâmetros">{tabs.map((tab) => <button type="button" key={tab.key} aria-current={section === tab.key ? 'page' : undefined} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set('section', tab.key); return next })}><ModuleIcon name={tab.icon} />{tab.label}</button>)}</nav>
    {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
    {feedback ? <div className="alert alert-success" role="status">{feedback}</div> : null}
    {stale && !review ? <div className="settings-recovery"><p>A configuração foi alterada por outra sessão. Atualize a referência para conferir as diferenças e manter seu preenchimento.</p><button type="button" className="secondary-button" disabled={reconciling} onClick={reconcile}>{reconciling ? 'Consultando…' : 'Atualizar referência sem perder rascunho'}</button></div> : null}
    {showErrors && issues.length ? <div className="settings-validation" role="alert"><strong>Revise os campos antes de publicar</strong><ul>{issues.map((issue) => <li key={`${issue.section}-${issue.module || ''}-${issue.key}`}><button type="button" onClick={() => goToIssue(issue)}>{issue.message}</button></li>)}</ul></div> : null}
    {section === 'records' ? <RecordAdministration initialModule={params.get('module') || 'vehicles'} initialRecordId={params.get('record_id') || ''} /> : !draft ? <div className="settings-load-state">{loading ? <p role="status">Carregando configuração…</p> : <button type="button" className="secondary-button" onClick={load}>Tentar carregar novamente</button>}</div> : <>
      <div className={`settings-workspace ${section === 'forms' ? 'settings-workspace--forms' : ''}`}>
        <form id="system-settings-draft" className="settings-editor" noValidate onSubmit={openReview}>
          {section === 'identity' ? <>
            <header className="settings-section-heading"><h3>Identidade institucional</h3><p>Usada na navegação, no acesso e nos novos relatórios.</p></header>
            <div className="settings-logo-editor"><div><img src={draft.identity.logoPath} alt="Logo selecionada" /></div><section><strong>Logo ou brasão</strong><p>PNG, JPG ou WEBP · até 2 MB</p><div><button className="secondary-button" type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Enviando…' : 'Trocar imagem'}</button><button className="ghost-button" type="button" disabled={uploading || draft.identity.logoPath === saved.defaults.identity.logoPath} onClick={() => update('identity', { ...draft.identity, logoPath: saved.defaults.identity.logoPath })}>Restaurar brasão</button></div></section><input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} /></div>
            <div className="settings-field-grid">{identityFields.map((field) => <label className={`form-field ${field.key === 'municipality' || field.key === 'addressLine' ? 'settings-field-wide' : ''}`} key={field.key}><span>{field.label}{field.required ? <span className="guided-form__required"> *</span> : null}</span><input className="app-input" required={field.required} aria-invalid={showErrors && issues.some((issue) => issue.section === 'identity' && issue.key === field.key) || undefined} minLength={field.required ? field.key === 'municipality' ? 3 : 2 : undefined} maxLength={field.max} pattern={field.key === 'state' ? '[A-Z]{2}' : undefined} value={draft.identity[field.key]} onChange={(event) => update('identity', { ...draft.identity, [field.key]: field.key === 'state' ? event.target.value.toUpperCase() : event.target.value })} /></label>)}</div>
          </> : section === 'appearance' ? <>
            <header className="settings-section-heading"><h3>Cores e navegação</h3><p>Confira a combinação nos dois formatos antes de publicar.</p></header>
            <div className="settings-palette">{palettes.map((palette) => <button key={palette.color} className={draft.appearance.primary === palette.color ? 'is-selected' : ''} type="button" title={palette.label} aria-label={palette.label} aria-pressed={draft.appearance.primary === palette.color} style={{ '--swatch': palette.color }} onClick={() => update('appearance', { ...draft.appearance, primary: palette.color })}><span />{palette.label}</button>)}</div>
            <div className="settings-field-grid">{[{ key: 'primary', label: 'Cor principal' }, { key: 'sidebar', label: 'Menu lateral' }].map((field) => <label className="form-field" key={field.key}>{field.label}<span className="settings-color-input"><input type="color" aria-label={`Escolher ${field.label}`} value={isBrandColor(draft.appearance[field.key]) ? draft.appearance[field.key] : saved.values.appearance[field.key]} onChange={(event) => update('appearance', { ...draft.appearance, [field.key]: event.target.value })} /><input className="app-input" required aria-label={`Código de ${field.label}`} aria-invalid={showErrors && !isBrandColor(draft.appearance[field.key]) || undefined} pattern="#[0-9a-fA-F]{6}" maxLength={7} value={draft.appearance[field.key]} onChange={(event) => update('appearance', { ...draft.appearance, [field.key]: event.target.value })} /></span></label>)}</div>
            <p className="helper-text">A cor escolhida é mantida nos botões. Textos e ícones recebem contraste adequado nos temas claro e escuro.</p>
            <label className="form-field"><span>Densidade da interface</span><select aria-label="Densidade da interface" className="app-select" value={draft.appearance.density} onChange={(event) => update('appearance', { ...draft.appearance, density: event.target.value })}><option value="comfortable">Confortável</option><option value="compact">Compacta</option></select></label>
            <details className="settings-icons"><summary>Ícones de cada aba <small>{Object.keys(saved.navigation).length} módulos</small></summary><p className="helper-text">Escolha o símbolo de cada módulo e confira a navegação na prévia.</p>
            <div className="settings-icon-list">{Object.entries(saved.navigation).map(([key, label]) => <label key={key}><ModuleIcon name={draft.icons[key] || key} /><span>{label}</span><select className="app-select" aria-label={`Ícone de ${label}`} value={draft.icons[key] || key} onChange={(event) => update('icons', { ...draft.icons, [key]: event.target.value })}>{saved.icons.map((icon) => <option key={icon} value={icon}>{saved.navigation[icon] || ({ settings: 'Parâmetros', orders: 'Ordens de abastecimento' })[icon] || icon}</option>)}</select></label>)}</div>
            </details>
          </> : <FormsEditor values={draft} catalog={saved.form_catalog} update={update} module={formModule} setModule={setFormModule} showErrors={showErrors} />}
        </form>
        {section !== 'forms' ? <aside className="settings-preview-column"><header><strong>Prévia ao vivo</strong><div role="group" aria-label="Formato da prévia"><button type="button" className={!mobilePreview ? 'is-selected' : ''} aria-pressed={!mobilePreview} onClick={() => setMobilePreview(false)}>Desktop</button><button type="button" className={mobilePreview ? 'is-selected' : ''} aria-pressed={mobilePreview} onClick={() => setMobilePreview(true)}>Celular</button></div></header><SettingsPreview values={draft} mobile={mobilePreview} /></aside> : null}
      </div>
      <footer className="settings-savebar"><span role="status">{dirty ? `${changes.length} área(s) com alterações não publicadas` : `Configuração publicada · versão ${saved.revision}`}</span><div><button className="secondary-button" type="button" disabled={!dirty || saving} onClick={() => { setDraft(copy(saved.values)); setError(''); setShowErrors(false); setFeedback('') }}>Descartar alterações</button><button form="system-settings-draft" type="submit" className="primary-button" disabled={!dirty || uploading || saving || stale}>Conferir e publicar</button></div></footer>
      <Modal open={review} title="Conferir alterações" onClose={saving ? () => {} : () => setReview(false)} className="settings-review">
        <form onSubmit={save} className="settings-review__form"><p>As alterações serão aplicadas aos usuários do sistema após a publicação.</p>
          <SettingsComparison rows={comparison} />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {stale ? <button className="secondary-button" type="button" disabled={reconciling} onClick={reconcile}>{reconciling ? 'Consultando…' : 'Atualizar referência sem perder rascunho'}</button> : null}
          <label className="form-field"><span>Justificativa <span className="guided-form__required">*</span></span><textarea required minLength={8} maxLength={1000} className="app-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Descreva o motivo da atualização" /></label>
          <div className="form-actions"><button className="secondary-button" type="button" disabled={saving} onClick={() => setReview(false)}>Voltar à prévia</button><button className="primary-button" type="submit" disabled={saving || stale || reason.trim().length < 8}>{saving ? 'Publicando…' : 'Publicar parâmetros'}</button></div>
        </form>
      </Modal>
    </>}
    <Modal open={Boolean(conflict)} title="Conciliar versões dos parâmetros" onClose={() => setConflict(null)} className="settings-review">
      {conflict ? <div className="settings-review__form"><p>Outra sessão alterou os mesmos campos. Escolha o valor de cada conflito. As demais alterações serão combinadas sem perder dados.</p>
        <SettingsConflictChoices conflicts={conflict.conflicts} choices={choices} onChoose={(key, value) => setChoices((current) => ({ ...current, [key]: value }))} describe={(entry) => entry.path.map((key) => settingNames[key] || moduleLabels[key] || saved.navigation[key] || draft.forms?.[entry.path[1]]?.custom?.find((field) => field.key === key)?.label || key).filter((key) => !['custom', 'fields'].includes(key)).join(' · ')} />
        <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setConflict(null)}>Manter rascunho sem conciliar</button><button type="button" className="primary-button" disabled={conflict.conflicts.some((entry) => !choices[entry.key])} onClick={() => {
          const merged = mergeSettingsDraft(conflict.base, conflict.local, conflict.remote.values, choices)
          setSaved(conflict.remote); setDraft(copy(merged.values)); setConflict(null); setStale(false); setError('')
          setFeedback('Versões conciliadas no rascunho. Confira novamente antes de publicar.')
        }}>Aplicar escolhas ao rascunho</button></div>
      </div> : null}
    </Modal>
    <Modal open={Boolean(leaveTo)} title="Sair com alterações não publicadas?" onClose={() => setLeaveTo(null)}>
      <p>Você tem alterações na prévia. Continue editando para conferir e publicar, ou descarte para sair.</p>
      <div className="form-actions"><button className="secondary-button" type="button" onClick={() => setLeaveTo(null)}>Continuar editando</button><button className="primary-button" type="button" onClick={() => { const path = leaveTo; setLeaveTo(null); navigate(path) }}>Descartar e sair</button></div>
    </Modal>
  </div>
}
