import { useMemo, useRef, useState } from 'react'
import { analyticsV2API } from '../../api/analyticsV2'
import { getApiErrorMessage } from '../../utils/apiError'
import useCockpitResource from './useCockpitResource'
import AnalyticsEntityLink from './AnalyticsEntityLink'
import { ALERT_RULES, ALERT_SEVERITIES, ALERT_STATES, alertOrigin, alertInstant as instant } from './analyticsAlertFormat'

const fetchDetail = ({ id }, signal) => analyticsV2API.alert(id, signal)
const fetchEvents = ({ id, offset }, signal) => analyticsV2API.alertEvents(id, { offset, limit: 50 }, signal)
function Evidence({ evidence, context, title }) {
  return <section className="analytics-detail-origin" aria-label={title}>
    <h4>{title}</h4>{evidence ? <>
      <strong>{evidence.label}</strong><p>{evidence.rule}</p>
      <p>Observado: {evidence.observed} · referência: {evidence.reference} · amostra: {evidence.sample_size}</p>
      <p>{evidence.limitation}</p>
      <p>Versão: {evidence.rule_version} · {context?.date_from} a {context?.date_to} · {context?.timezone}</p>
      <p>Histórico: {context?.history_date_from} a {context?.history_date_to}. {context?.history_limit}</p>
    </> : <p>Evidência indisponível neste escopo. A evidência original permanece preservada.</p>}</section>
}

export default function AnalyticsAlertDetail({ detail, onOpen }) {
  const [revision, setRevision] = useState(0)
  const [offset, setOffset] = useState(0)
  const query = useMemo(() => ({ id: detail.entityId }), [detail.entityId])
  const historyQuery = useMemo(() => ({ id: detail.entityId, offset }), [detail.entityId, offset])
  const resource = useCockpitResource(fetchDetail, query, revision)
  const history = useCockpitResource(fetchEvents, historyQuery, revision)
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [conflict, setConflict] = useState(false)
  const attempt = useRef(null)
  const inFlight = useRef(false)
  const data = resource.data
  function refresh() { attempt.current = null; setConflict(false); setTarget(''); setOffset(0); setRevision((value) => value + 1) }
  async function submit(event) {
    event.preventDefault()
    if (inFlight.current || !data || !target) return
    if (!(data.status === 'NEW' && target === 'IN_REVIEW') && !reason.trim()) {
      setError('Informe a ação realizada ou o motivo da decisão/reabertura.'); return
    }
    inFlight.current = true; setBusy(true); setError(''); setSuccess('')
    const payload = { status: target, reason: reason.trim() || null }
    const signature = JSON.stringify({ id: data.id, version: data.version, payload })
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() }
    try {
      await analyticsV2API.changeAlertStatus(data.id, payload, data.version, attempt.current.key)
      setSuccess('Decisão registrada no histórico.'); setReason(''); refresh(); detail.onChanged?.()
    } catch (failure) {
      setConflict(failure.response?.status === 409)
      setError(getApiErrorMessage(failure, 'Não foi possível registrar. Tente novamente; a chave de repetição será preservada.'))
    } finally { inFlight.current = false; setBusy(false) }
  }
  if (resource.loading) return <p role="status">Carregando caso…</p>
  if (resource.error) return <div role="alert"><p>{resource.error}</p><button className="ghost-button" onClick={resource.onRetry}>Tentar novamente</button></div>
  if (!data) return null
  const evidence = data.evidence || data.compatible_evidence
  const context = data.evaluation_context || data.compatible_context
  const filters = context?.date_from ? { date_from: context.date_from, date_to: context.date_to, organization: context.organization || undefined,
    vehicle_type: context.vehicle_type || undefined } : detail.filters
  const origin = alertOrigin(evidence, context)
  function record(id, title) { onOpen({ entityType: 'record', entityId: id, source: 'fuel_supply', title, filters, origin }) }
  return <>
    <p>{ALERT_RULES[data.rule_key]} · {ALERT_STATES[data.status]} · prioridade {ALERT_SEVERITIES[data.severity]}</p>
    <p>{data.plate || 'Veículo não disponível'} · {[data.brand, data.model].filter(Boolean).join(' ')}</p>
    <p>Abastecimento: {instant(data.source_occurred_at)}</p>
    <p className="analytics-scope-note">Primeira detecção: {instant(data.first_detected_at)} · última: {instant(data.last_detected_at)} · {data.evaluation_count} avaliação(ões)</p>
    {data.reappeared_after_decision ? <p role="status">Regra acionada após decisão. O estado foi preservado; a reabertura exige justificativa.</p> : null}
    {data.evidence_unavailable ? <p>Evidência da última avaliação indisponível neste escopo.{data.compatible_evidence ? ' Abaixo está uma avaliação anterior compatível, identificada por seu recorte.' : ''}</p> : null}
    <Evidence evidence={evidence} context={context} title="Como foi calculado?" />
    <div className="analytics-detail-related">
      {data.source_available ? <button type="button" className="analytics-entity-link" onClick={() => record(data.source_id, 'Abastecimento de origem')}>Abrir abastecimento de origem</button> : <p>Registro de origem indisponível. Histórico preservado.</p>}
      {evidence?.previous_supply_id ? <button type="button" className="analytics-entity-link" onClick={() => record(evidence.previous_supply_id, 'Abastecimento anterior de referência')}>Abrir registro anterior</button> : null}
      {data.can_view_vehicle && data.vehicle_id ? <AnalyticsEntityLink entityType="vehicle" entityId={data.vehicle_id} entityName={data.plate}
        onOpen={(item) => onOpen({ ...item, filters, origin })}>Ver veículo</AnalyticsEntityLink> : null}
      {data.driver_id ? <AnalyticsEntityLink entityType="driver" entityId={data.driver_id} entityName="Condutor vinculado"
        onOpen={(item) => onOpen({ ...item, filters, origin })}>Ver condutor vinculado</AnalyticsEntityLink> : null}
    </div>
    {data.allowed_states.length ? <form className="analytics-alert-treatment" aria-label="Tratamento do alerta" onSubmit={submit}>
      <h4>Registrar decisão</h4>
      <label>Novo estado<select value={target} disabled={busy || conflict} required onChange={(e) => setTarget(e.target.value)}>
        <option value="">Selecione</option>{data.allowed_states.map((value) => <option key={value} value={value}>{ALERT_STATES[value]}</option>)}</select></label>
      <label>Justificativa<textarea value={reason} maxLength={2000} disabled={busy || conflict}
        required={Boolean(target && !(data.status === 'NEW' && target === 'IN_REVIEW'))} onChange={(e) => setReason(e.target.value)} /></label>
      <p className="analytics-scope-note">Obrigatória para resolver, ignorar ou reabrir. A decisão não altera o abastecimento nem apaga evidências.</p>
      <button className="app-button" disabled={busy || conflict || !target}>{busy ? 'Registrando…' : 'Registrar decisão'}</button>
    </form> : <p>Consulta somente leitura; tratamento depende de permissão de edição de Análises e do perfil autorizado.</p>}
    {error ? <p role="alert">{error}</p> : null}{success ? <p role="status">{success}</p> : null}
    <button type="button" className="ghost-button" disabled={busy} onClick={refresh}>{conflict ? 'Recarregar caso antes de decidir' : 'Atualizar caso'}</button>
    <details className="analytics-costs-legacy"><summary>Evidência original preservada</summary>
      <Evidence evidence={data.original_evidence} context={data.original_context} title="Evidência original" /></details>
    <section aria-label="Histórico do alerta"><h4>Histórico do alerta</h4>
      {history.loading ? <p role="status">Carregando histórico…</p> : history.error ? <div role="alert"><p>{history.error}</p><button className="ghost-button" onClick={history.onRetry}>Tentar novamente histórico</button></div> : <>
        <p>{history.data?.total} evento(s) acessível(is)</p>
        <ol className="analytics-detail-timeline">{history.data?.items.map((item) => <li key={item.id}>
          <strong>{item.event_type === 'DETECTED' ? 'Detecção original' : item.event_type === 'REEVALUATED' ? 'Reavaliação' : `${ALERT_STATES[item.from_status]} → ${ALERT_STATES[item.to_status]}`}</strong>
          <p>{instant(item.created_at)} · {item.actor_label}</p>{item.reason ? <p>{item.reason}</p> : null}
          {item.event_type !== 'STATUS_CHANGED' ? <details><summary>Regra e amostra desta avaliação</summary><Evidence evidence={item.evidence} context={item.evaluation_context} title="Evidência da avaliação" /></details> : null}
        </li>)}</ol>
        <div className="actions-inline"><button type="button" className="ghost-button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Histórico anterior</button>
          <button type="button" className="ghost-button" disabled={offset + 50 >= history.data?.total} onClick={() => setOffset(offset + 50)}>Mais histórico</button></div>
      </>}
    </section>
  </>
}
