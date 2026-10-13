import { useMemo, useRef, useState } from 'react'
import { analyticsV2API } from '../../api/analyticsV2'
import { useAuth } from '../../context/AuthContext'
import { getApiErrorMessage } from '../../utils/apiError'
import AnalyticsSection from './AnalyticsSection'
import useCockpitResource from './useCockpitResource'
import { closedPeriod, formatDate } from './analyticsV2Format'
import { ALERT_RULES, ALERT_SEVERITIES, ALERT_STATES, alertInstant } from './analyticsAlertFormat'

export default function AnalyticsAlerts({ enabled = true, organizations = [], onOpenEntity, returnFocusRef }) {
  const auth = useAuth()
  const canRead = Boolean(auth?.canView('fuel_supplies'))
  const canReconcile = Boolean(auth?.isAdmin && auth?.canEdit('analytics') && canRead)
  const [applied, setApplied] = useState(() => ({ ...closedPeriod(), organization: '', status: '', severity: '', rule_key: '' }))
  const [draft, setDraft] = useState(applied)
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [validation, setValidation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const attempt = useRef(null)
  const inFlight = useRef(false)
  const query = useMemo(() => ({ ...applied, organization: applied.organization || undefined,
    status: applied.status || undefined, severity: applied.severity || undefined, rule_key: applied.rule_key || undefined,
    offset, limit: 50 }), [applied, offset])
  const resource = useCockpitResource(analyticsV2API.alerts, query, revision, enabled && canRead)
  const data = resource.data
  const maxDate = closedPeriod(1).date_to
  function apply(event) {
    event.preventDefault()
    const days = (Date.parse(draft.date_to) - Date.parse(draft.date_from)) / 86400000 + 1
    if (!Number.isFinite(days) || days < 1 || days > 366 || draft.date_to > maxDate || draft.date_from < '1901-01-01') {
      setValidation('Selecione de 1 a 366 dias encerrados, com início anterior ou igual ao fim.'); return
    }
    setValidation(''); setOffset(0); setApplied({ ...draft }); setMessage(''); setError('')
  }
  async function reconcile() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setMessage('')
    const filters = { date_from: applied.date_from, date_to: applied.date_to, organization: applied.organization || undefined }
    const signature = JSON.stringify(filters)
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() }
    try {
      const { data: receipt } = await analyticsV2API.reconcileAlerts(filters, attempt.current.key)
      attempt.current = null
      setMessage(`${receipt.created} caso(s) criado(s), ${receipt.revisited} reavaliado(s); ${receipt.evaluated} abastecimento(s) conferido(s). Decisões anteriores foram preservadas.`)
      setOffset(0); setRevision((value) => value + 1)
    } catch (failure) { setError(getApiErrorMessage(failure, 'Não foi possível reconciliar. Tente novamente com o mesmo recorte.')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  if (!enabled) return null
  return <div ref={returnFocusRef} tabIndex={-1} role="region" aria-label="Central de casos de alertas">
    <form className="analytics-cockpit-filters analytics-alert-filters" aria-label="Filtros dos alertas" onSubmit={apply}>
      <label>De<input type="date" value={draft.date_from} min="1901-01-01" max={maxDate} required disabled={busy} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} /></label>
      <label>Até<input type="date" value={draft.date_to} min="1901-01-01" max={maxDate} required disabled={busy} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} /></label>
      <label>Secretaria<select value={draft.organization} disabled={busy || auth?.isProduction} onChange={(e) => setDraft({ ...draft, organization: e.target.value })}>
        <option value="">{auth?.isProduction ? 'Minha secretaria' : 'Todas no meu escopo'}</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      <label>Estado<select value={draft.status} disabled={busy} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
        <option value="">Abertos (novos e em análise)</option>{Object.entries(ALERT_STATES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Severidade<select value={draft.severity} disabled={busy} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}>
        <option value="">Todas</option>{Object.entries(ALERT_SEVERITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Regra<select value={draft.rule_key} disabled={busy} onChange={(e) => setDraft({ ...draft, rule_key: e.target.value })}>
        <option value="">Todas</option>{Object.entries(ALERT_RULES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="app-button" disabled={busy}>Aplicar filtros</button>
      <button type="button" className="ghost-button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Atualizar fila</button>
    </form>
    {validation ? <p role="alert">{validation}</p> : null}
    <p className="analytics-scope-note">{formatDate(applied.date_from)} a {formatDate(applied.date_to)} · datas do abastecimento. A consulta não cria casos. As cinco regras de combustível são triagem; não comprovam fraude ou consumo efetivo.</p>
    {canReconcile ? <div className="analytics-alert-reconcile">
      <p>Conferir o período aplicado cria casos novos e registra reavaliações. Estados resolvido/ignorado não são reabertos automaticamente. Estado, severidade e regra filtram a fila, não a detecção.</p>
      <button type="button" className="app-button" disabled={busy} onClick={reconcile}>{busy ? 'Conferindo…' : 'Conferir e persistir casos do período'}</button>
    </div> : null}
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}
    {!canRead ? <p role="status">A fila de casos exige leitura de abastecimentos.</p> : <AnalyticsSection title="Casos de alertas" description={data?.coverage}
      loading={resource.loading} error={resource.error} onRetry={resource.onRetry} empty={!data?.items.length} emptyMessage="Nenhum caso persistido neste recorte. A reconciliação é uma ação explícita de administrador autorizado.">
      <p className="analytics-scope-note">{data?.total} caso(s) · exibindo a partir de {offset + 1}</p>
      <ol className="analytics-alert-list">{data?.items.map((item) => <li key={item.id}>
        <button type="button" className="analytics-entity-link" onClick={() => onOpenEntity({ entityType: 'alert', entityId: item.id,
          title: `${ALERT_RULES[item.rule_key]} · ${item.plate || 'veículo não disponível'}`, filters: data.filters,
          onChanged: () => setRevision((value) => value + 1) })}>{item.plate || 'Veículo não disponível'} · {[item.brand, item.model].filter(Boolean).join(' ')} · {ALERT_RULES[item.rule_key]}</button>
        <p>{ALERT_STATES[item.status]} · Prioridade {ALERT_SEVERITIES[item.severity]} · {item.evaluation_count} avaliação(ões)</p>
        <p>Abastecimento: {alertInstant(item.source_occurred_at)}</p>
        {item.evidence_unavailable ? <p>Evidência da última avaliação indisponível neste escopo.</p> : <p>{item.evidence?.label} · amostra: {item.evidence?.sample_size}</p>}
        {item.reappeared_after_decision ? <p>Regra acionada novamente após decisão; reabertura depende de análise humana.</p> : null}
      </li>)}</ol>
      <div className="actions-inline"><button type="button" className="ghost-button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Página anterior</button>
        <button type="button" className="ghost-button" disabled={offset + 50 >= data?.total} onClick={() => setOffset(offset + 50)}>Próxima página</button></div>
    </AnalyticsSection>}
  </div>
}
