import { useEffect, useId, useRef, useState } from 'react'
import Modal from './Modal'
import { vehicleTagsAPI } from '../api/vehicleTags'
import { getApiErrorMessage } from '../utils/apiError'
import { tagSummary, VEHICLE_TAG_COLORS } from '../utils/vehicleTags'
import './VehicleTags.css'

const empty = { name: '', color: 'blue', is_active: true }
const date = (value) => new Date(value).toLocaleString('pt-BR')

export function TagChip({ tag, children }) {
  return <span className="vehicle-tag" data-color={tag.color}>{children || tag.name}</span>
}

export function VehicleTagColorPicker({ value, onChange, disabled = false }) {
  const groupId = useId()
  const selectedName = VEHICLE_TAG_COLORS.find(([color]) => color === value)?.[1] || ''
  return <fieldset className="vehicle-tag-color-picker" disabled={disabled}>
    <legend><span>Cor <span className="vehicle-tag-selected-color">· {selectedName}</span></span><span className="vehicle-tag-color-count">{VEHICLE_TAG_COLORS.length} cores</span></legend>
    <div className="vehicle-tag-palette">
      {VEHICLE_TAG_COLORS.map(([color, label]) => <label className="vehicle-tag-color-choice" data-color={color} key={color}>
        <input className="vehicle-tag-color-input" type="radio" name={groupId} value={color} aria-label={label} checked={value === color} onChange={() => onChange(color)} />
        <span className="vehicle-tag-color-dot" aria-hidden="true">{value === color ? '✓' : ''}</span>
        <span className="vehicle-tag-color-name">{label}</span>
      </label>)}
    </div>
  </fieldset>
}

export function VehicleTagBadges({ tags = [], interactive = true, current = false }) {
  const [detail, setDetail] = useState(null)
  if (!tags.length) return null
  const visible = tags.slice(0, 2)
  return <>
    <span className="vehicle-tags" data-tour="vehicle-tags-badges" aria-label={current ? 'Etiquetas atuais do veículo' : 'Etiquetas do veículo'}>
      {visible.map((tag) => interactive
        ? <button type="button" className="vehicle-tag-button" key={tag.id} onClick={() => setDetail(tag)} aria-label={`Detalhes da etiqueta ${tag.name}, de ${tag.owner_name}`}><TagChip tag={tag} /></button>
        : <TagChip key={tag.id} tag={tag} />)}
      {tags.length > 2 ? interactive
        ? <button type="button" className="vehicle-tag-more" onClick={() => setDetail('all')} aria-label="Ver todas as etiquetas">+{tags.length - 2}</button>
        : <span className="vehicle-tag-more" title={tagSummary(tags)}>+{tags.length - 2}</span> : null}
    </span>
    {interactive ? <Modal open={Boolean(detail)} title="Etiquetas atuais do veículo" onClose={() => setDetail(null)}>
      {(detail === 'all' ? tags : detail ? [detail] : []).map((tag) => <div className="vehicle-tag-entry" key={tag.id}>
        <TagChip tag={tag} /><span>Aplicada por {tag.applied_by_name || tag.owner_name}</span>
        {tag.applied_at ? <span className="muted">{date(tag.applied_at)}</span> : null}
        {tag.note ? <p className="vehicle-tag-note">{tag.note}</p> : null}
      </div>)}
    </Modal> : null}
  </>
}

export function VehicleTagFilter({ value, onChange, refreshKey = 0 }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!open) return undefined
    let alive = true
    setLoading(true); setError('')
    vehicleTagsAPI.options().then(({ data }) => { if (alive) setOptions(data) })
      .catch((err) => { if (alive) setError(getApiErrorMessage(err, 'Não foi possível consultar as etiquetas.')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, refreshKey])
  return <div className="vehicle-tag-filter">
    <button className="ghost-button" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Etiquetas{value.length ? ` (${value.length})` : ''}</button>
    {open ? <div className="vehicle-tag-filter-panel">
      <strong>Filtrar por qualquer etiqueta</strong>
      {loading ? <p role="status">Carregando etiquetas…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {!loading && !error && !options.length ? <p className="muted">Nenhuma etiqueta aplicada nos veículos acessíveis.</p> : null}
      {options.map((tag) => <label className="vehicle-tag-filter-option" key={tag.id}>
        <input type="checkbox" checked={value.some((item) => item.id === tag.id)} onChange={(event) => onChange(event.target.checked ? [...value, tag] : value.filter((item) => item.id !== tag.id))} />
        <span><TagChip tag={tag} /><small>{tag.owner_name}</small></span>
      </label>)}
      {value.length ? <button type="button" className="ghost-button" onClick={() => onChange([])}>Limpar etiquetas</button> : null}
      <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Concluir filtro</button>
    </div> : null}
  </div>
}

export function MyVehicleTagsModal({ onClose, onChanged }) {
  const [tags, setTags] = useState([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [archive, setArchive] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const deleteCancel = useRef(null)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  async function load() { const { data } = await vehicleTagsAPI.mine(); setTags(data) }
  useEffect(() => {
    if (!deleting) return
    deleteCancel.current?.focus()
    deleteCancel.current?.scrollIntoView?.({ block: 'nearest' })
  }, [deleting])
  useEffect(() => {
    let alive = true
    vehicleTagsAPI.mine().then(({ data }) => { if (alive) setTags(data) })
      .catch((err) => { if (alive) setError(getApiErrorMessage(err)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])
  async function save(event) {
    event.preventDefault()
    if (sending.current) return
    sending.current = true; setBusy(true); setError(''); setFeedback('')
    try {
      if (editing) await vehicleTagsAPI.update(editing, form)
      else await vehicleTagsAPI.create(form)
      setForm(empty); setEditing(null); setFeedback('Etiqueta salva no seu catálogo.')
      await load(); onChanged?.()
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível salvar a etiqueta.')) }
    finally { sending.current = false; setBusy(false) }
  }
  async function deleteTag() {
    if (sending.current || !deleting) return
    const tag = deleting
    sending.current = true; setBusy(true); setDeleteError(''); setError(''); setFeedback('')
    try {
      await vehicleTagsAPI.deleteDefinition(tag.id)
      setTags((current) => current.filter((item) => item.id !== tag.id))
      if (editing === tag.id) { setEditing(null); setForm(empty) }
      setDeleting(null)
      setFeedback('Etiqueta excluída do seu catálogo. O histórico foi preservado.')
      onChanged?.()
    } catch (err) { setDeleteError(getApiErrorMessage(err, 'Não foi possível excluir a etiqueta.')) }
    finally { sending.current = false; setBusy(false) }
  }
  async function toggle(tag) {
    if (sending.current) return
    sending.current = true; setBusy(true); setError(''); setFeedback('')
    try {
      await vehicleTagsAPI.update(tag.id, { name: tag.name, color: tag.color, is_active: !tag.is_active })
      setArchive(null); if (editing === tag.id) { setEditing(null); setForm(empty) }
      setFeedback(tag.is_active ? 'Etiqueta arquivada. As marcações existentes foram preservadas.' : 'Etiqueta reativada.')
      await load(); onChanged?.()
    } catch (err) { setError(getApiErrorMessage(err)) }
    finally { sending.current = false; setBusy(false) }
  }
  return <Modal open className="vehicle-tags-catalog-modal" backdropClassName="vehicle-tags-catalog-backdrop" title="Minhas etiquetas" description="Seu catálogo pessoal. As etiquetas aplicadas ficam visíveis para quem tem acesso ao veículo." onClose={onClose} canClose={!busy}>
    <div className="vehicle-tags-workspace">
      {loading ? <p role="status">Carregando seu catálogo…</p> : null}
      {!loading && !tags.length ? <p className="muted">Você ainda não criou etiquetas. Comece por uma sugestão ou escolha seu próprio nome.</p> : null}
      <div className="vehicle-tag-catalog">
        {tags.map((tag) => <div className="vehicle-tag-catalog-row" key={tag.id}>
          <span><TagChip tag={tag} />{!tag.is_active ? <small>Arquivada</small> : null}</span>
          <span className="actions-inline">
            <button type="button" className="mini-button" disabled={busy} onClick={() => { setDeleting(null); setArchive(null); setEditing(tag.id); setForm({ name: tag.name, color: tag.color, is_active: tag.is_active }); setError(''); setFeedback('') }}>Editar</button>
            <button type="button" className="mini-button" disabled={busy} onClick={() => { setDeleting(null); tag.is_active ? setArchive(tag) : toggle(tag) }}>{tag.is_active ? 'Arquivar' : 'Reativar'}</button>
            <button type="button" className="mini-button danger" disabled={busy} onClick={() => { setArchive(null); setDeleteError(''); setDeleting(tag) }}>Excluir</button>
          </span>
        </div>)}
      </div>
      {deleting ? <div className="vehicle-tag-confirm" role="group" aria-label={`Excluir etiqueta ${deleting.name}`}>
        <h4>Excluir “{deleting.name}” do seu catálogo?</h4>
        <p>A etiqueta deixará de aparecer no catálogo. O histórico será preservado. Se estiver aplicada em algum veículo, retire a marcação antes de excluir.</p>
        {deleteError ? <div className="alert alert-error" role="alert">{deleteError}</div> : null}
        <div className="actions-inline">
          <button type="button" className="secondary-button danger" disabled={busy} onClick={deleteTag}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button>
          <button ref={deleteCancel} type="button" className="ghost-button" disabled={busy} onClick={() => { setDeleting(null); setDeleteError('') }}>Cancelar</button>
        </div>
      </div> : null}
      {archive ? <div className="vehicle-tag-confirm">
        <p>Arquivar “{archive.name}” impede novas aplicações. As marcações nos veículos permanecem até serem retiradas manualmente.</p>
        <div className="actions-inline"><button type="button" className="secondary-button" disabled={busy} onClick={() => toggle(archive)}>Confirmar arquivamento</button><button type="button" className="ghost-button" disabled={busy} onClick={() => setArchive(null)}>Voltar</button></div>
      </div> : null}
      <form onSubmit={save} className="vehicle-tag-form">
        <h4>{editing ? 'Editar etiqueta' : 'Criar etiqueta'}</h4>
        {!editing ? <div className="actions-inline vehicle-tag-suggestions">{[['Em manutenção', 'amber'], ['Inativo temporariamente', 'red'], ['Em lavagem', 'blue']].map(([name, color]) => <button className="ghost-button" type="button" key={name} disabled={busy} onClick={() => setForm({ ...empty, name, color })}>{name}</button>)}</div> : null}
        <label>Nome<input className="app-input" value={form.name} maxLength={40} required disabled={busy} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <VehicleTagColorPicker value={form.color} disabled={busy} onChange={(color) => setForm({ ...form, color })} />
        <div className="vehicle-tag-preview">
          <span className="vehicle-tag-preview-caption">Assim ficará sua etiqueta</span>
          <span aria-live="polite" aria-atomic="true" aria-label={`Prévia: ${form.name || 'Sua etiqueta'}, cor ${VEHICLE_TAG_COLORS.find(([color]) => color === form.color)?.[1] || form.color}`}><TagChip tag={form}>{form.name || 'Sua etiqueta'}</TagChip></span>
        </div>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        {feedback ? <p role="status">{feedback}</p> : null}
        <div className="actions-inline"><button type="submit" className="app-button" disabled={busy || !form.name.trim()}>{busy ? 'Salvando…' : 'Salvar etiqueta'}</button>{editing ? <button type="button" className="ghost-button" disabled={busy} onClick={() => { setEditing(null); setForm(empty) }}>Cancelar edição</button> : null}</div>
      </form>
    </div>
  </Modal>
}

export function VehicleTagsManager({ vehicle, user, isAdmin, onClose, onChanged }) {
  const [marks, setMarks] = useState([])
  const [mine, setMine] = useState([])
  const [tagId, setTagId] = useState('')
  const [note, setNote] = useState('')
  const [removing, setRemoving] = useState(null)
  const [reason, setReason] = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  async function reload() {
    const [a, b] = await Promise.all([vehicleTagsAPI.list(vehicle.id), vehicleTagsAPI.mine()])
    setMarks(a.data); setMine(b.data)
  }
  useEffect(() => {
    let alive = true
    Promise.all([vehicleTagsAPI.list(vehicle.id), vehicleTagsAPI.mine()])
      .then(([a, b]) => { if (alive) { setMarks(a.data); setMine(b.data) } })
      .catch((err) => { if (alive) setError(getApiErrorMessage(err)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [vehicle.id])
  async function mutate(action) {
    if (sending.current) return
    sending.current = true; setBusy(true); setError(''); setFeedback('')
    try {
      const { data } = await action()
      setMarks(data); setTagId(''); setNote(''); setRemoving(null); setReason('')
      setFeedback('Etiquetas atualizadas. O status do veículo foi preservado.'); onChanged?.()
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível atualizar as etiquetas.')) }
    finally { sending.current = false; setBusy(false) }
  }
  const available = mine.filter((tag) => tag.is_active && !marks.some((mark) => mark.tag_id === tag.id))
  return <>
    <Modal open title="Gerenciar etiquetas" description={`${vehicle.plate} · ${vehicle.brand} ${vehicle.model}`} onClose={onClose} canClose={!busy}>
      <div className="vehicle-tags-workspace">
        {loading ? <p role="status">Carregando etiquetas…</p> : null}
        {!loading && !marks.length ? <p className="muted">Nenhuma etiqueta aplicada neste veículo.</p> : null}
        {marks.map((mark) => <div className="vehicle-tag-entry" key={mark.id}>
          <div className="vehicle-tag-entry-header"><TagChip tag={mark} />{isAdmin || mark.applied_by_user_id === user?.id ? <button className="mini-button" type="button" disabled={busy} onClick={() => { setRemoving(mark); setReason('') }}>Retirar</button> : null}</div>
          <span>{mark.applied_by_name} · {date(mark.applied_at)}</span>
          {mark.note ? <p className="vehicle-tag-note">{mark.note}</p> : null}
          {!isAdmin && mark.applied_by_user_id !== user?.id ? <small className="muted">Somente o autor ou um administrador pode retirar.</small> : null}
        </div>)}
        {removing ? <div className="vehicle-tag-confirm">
          <strong>Retirar “{removing.name}” deste veículo?</strong>
          {removing.applied_by_user_id !== user?.id ? <label>Justificativa<textarea className="app-input" maxLength={500} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label> : null}
          <div className="actions-inline"><button className="secondary-button" type="button" disabled={busy || (removing.applied_by_user_id !== user?.id && !reason.trim())} onClick={() => mutate(() => vehicleTagsAPI.remove(vehicle.id, removing.id, reason))}>Confirmar retirada</button><button className="ghost-button" type="button" disabled={busy} onClick={() => setRemoving(null)}>Voltar</button></div>
        </div> : null}
        <form className="vehicle-tag-form" onSubmit={(event) => { event.preventDefault(); if (tagId) mutate(() => vehicleTagsAPI.apply(vehicle.id, { tag_id: tagId, note: note.trim() || null })) }}>
          <div className="vehicle-tag-entry-header"><h4>Adicionar uma etiqueta minha</h4><button type="button" className="ghost-button" disabled={busy} onClick={() => setCatalogOpen(true)}>Minhas etiquetas</button></div>
          <label>Etiqueta<select className="app-select" value={tagId} disabled={busy || loading} onChange={(event) => setTagId(event.target.value)}><option value="">Selecione uma etiqueta</option>{available.map((tag) => <option value={tag.id} key={tag.id}>{tag.name}</option>)}</select></label>
          {!loading && !available.length ? <p className="muted">Crie uma etiqueta em “Minhas etiquetas” ou reative uma etiqueta arquivada.</p> : null}
          <label>Observação opcional<textarea className="app-input" maxLength={500} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} /></label>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          {feedback ? <p role="status">{feedback}</p> : null}
          <div className="actions-inline"><button className="app-button" type="submit" disabled={busy || !tagId}>{busy ? 'Salvando…' : 'Adicionar etiqueta'}</button><button className="ghost-button" type="button" disabled={busy} onClick={onClose}>Fechar</button></div>
        </form>
      </div>
    </Modal>
    {catalogOpen ? <MyVehicleTagsModal onClose={() => { setCatalogOpen(false); reload().catch((err) => setError(getApiErrorMessage(err))) }} onChanged={onChanged} /> : null}
  </>
}
