import { useMemo, useState } from 'react'
import { analyticsV2API } from '../../api/analyticsV2'
import SearchableSelect from '../SearchableSelect'
import AnalyticsSection from './AnalyticsSection'
import AnalyticsEntityLink from './AnalyticsEntityLink'
import useCockpitResource from './useCockpitResource'
import { closedPeriod, formatDate, formatValue } from './analyticsV2Format'

const TYPES = { SEDAN: 'Sedan', HATCH: 'Hatch', SUV: 'SUV', PERUA_SW: 'Perua/SW', PICAPE: 'Picape', VAN: 'Van', MICRO_ONIBUS: 'Micro-ônibus', ONIBUS: 'Ônibus', CAMINHAO: 'Caminhão', MOTOCICLETA: 'Motocicleta', MAQUINA: 'Máquina' }
const STATUS = { ATIVO: 'Ativo', MANUTENCAO: 'Em manutenção', INATIVO: 'Inativo' }

function eventDate(value) {
  if (!value) return 'Sem registro até o fim do recorte'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Bahia', dateStyle: 'short', timeStyle: 'short',
  }).format(date)
}

export default function AnalyticsUtilization({ organizations = [], catalogError, onOpenEntity }) {
  const [applied, setApplied] = useState(() => ({ ...closedPeriod(), organization: '', vehicle_type: '' }))
  const [draft, setDraft] = useState(applied)
  const [validation, setValidation] = useState('')
  const [revision, setRevision] = useState(0)
  const [shown, setShown] = useState(20)
  const [selectedOrganization, setSelectedOrganization] = useState(null)
  const [selectedStatus, setSelectedStatus] = useState(null)
  const query = useMemo(() => ({ ...applied, organization: applied.organization || undefined,
    vehicle_type: applied.vehicle_type || undefined }), [applied])
  const resource = useCockpitResource(analyticsV2API.utilization, query, revision, true)
  const data = resource.data
  const state = { loading: resource.loading, error: resource.error, onRetry: resource.onRetry }
  const maxDate = closedPeriod(1).date_to
  const vehicles = data?.vehicles || []
  const measured = vehicles.filter((item) => item.distance_km !== null)
  const byKm = [...measured].sort((a, b) => Number(b.distance_km) - Number(a.distance_km) || a.plate.localeCompare(b.plate))
  const noEvent = vehicles.filter((item) => item.started === 0 && item.ended === 0)
    .sort((a, b) => (b.days_since_last_event ?? Infinity) - (a.days_since_last_event ?? Infinity) || a.plate.localeCompare(b.plate))
  const latest = vehicles.filter((item) => item.last_possession_event_at)
    .sort((a, b) => Date.parse(b.last_possession_event_at) - Date.parse(a.last_possession_event_at))
  const filtered = vehicles.filter((item) => (selectedOrganization === null || (item.organization_id || 'unattributed') === selectedOrganization)
    && (selectedStatus === null || item.status === selectedStatus))

  function apply(event) {
    event.preventDefault()
    const days = (Date.parse(draft.date_to) - Date.parse(draft.date_from)) / 86400000 + 1
    if (!Number.isFinite(days) || days < 1 || days > 366 || draft.date_to > maxDate || draft.date_from < '1901-01-01') {
      setValidation('Selecione de 1 a 366 dias encerrados, com início anterior ou igual ao fim.')
      return
    }
    setValidation(''); setShown(20); setSelectedOrganization(null); setSelectedStatus(null); setApplied({ ...draft })
  }

  function openPossessions(title, mode = 'period', vehicleId) {
    const filters = vehicleId ? { ...query, vehicle_id: vehicleId } : query
    const method = mode === 'km' ? data?.methodology.distance : mode === 'duration' ? data?.methodology.duration
      : mode === 'history' ? data?.methodology.last : data?.methodology.events
    onOpenEntity({ entityType: 'utilization-events', title, utilizationMode: mode, filters,
      origin: { label: title, formula: method,
        limitations: [data?.methodology.roster, data?.methodology.without].filter(Boolean) } })
  }

  function vehicleLink(item, label) {
    return <AnalyticsEntityLink entityType="vehicle" entityId={item.vehicle_id} entityName={item.plate}
      onOpen={() => openPossessions(label || `Histórico de posses de ${item.plate}`, 'history', item.vehicle_id)}>{item.plate}</AnalyticsEntityLink>
  }

  return <div className="analytics-costs">
    <form className="analytics-cockpit-filters" onSubmit={apply} aria-label="Filtros de Utilização">
      <label>De<input type="date" value={draft.date_from} min="1901-01-01" max={maxDate} required onChange={(e) => setDraft((v) => ({ ...v, date_from: e.target.value }))} /></label>
      <label>Até<input type="date" value={draft.date_to} min="1901-01-01" max={maxDate} required onChange={(e) => setDraft((v) => ({ ...v, date_to: e.target.value }))} /></label>
      <label>Tipo de veículo<SearchableSelect ariaLabel="Tipo de veículo em Utilização" value={draft.vehicle_type}
        options={[{ value: '', label: 'Todos os tipos' }, ...Object.entries(TYPES).map(([value, label]) => ({ value, label }))]}
        onChange={(value) => setDraft((v) => ({ ...v, vehicle_type: value }))} /></label>
      <label>Secretaria<SearchableSelect ariaLabel="Secretaria em Utilização" value={draft.organization}
        options={[{ value: '', label: 'Todas no meu escopo' }, ...organizations.map((item) => ({ value: item.id, label: item.name }))]}
        onChange={(value) => setDraft((v) => ({ ...v, organization: value }))} /></label>
      <button type="submit" className="app-button">Aplicar filtros</button>
      <button type="button" className="ghost-button" onClick={() => setRevision((value) => value + 1)}>Atualizar</button>
    </form>
    {validation ? <p role="alert">{validation}</p> : null}
    {catalogError ? <p role="status" className="analytics-scope-note">Catálogo de secretarias indisponível. O escopo de acesso segue aplicado.</p> : null}
    <p className="analytics-scope-note">{formatDate(applied.date_from)} a {formatDate(applied.date_to)} · {data?.methodology.roster}</p>

    <AnalyticsSection title="Registros de posse no período" description="Eventos e distâncias observáveis; não são horas de veículo em operação." {...state}>
      <div className="analytics-costs-summary">
        <div><span>Km de posses encerradas válidas</span><strong>{formatValue(data?.distance_km, 'km')}</strong>
          <p>{data?.valid_km_count ?? '—'} posse(s) com km válido</p>
          <button type="button" className="analytics-entity-link" onClick={() => openPossessions('Posses que compõem os quilômetros', 'km')}>Ver posses</button></div>
        <div><span>Km por posse encerrada com km válido</span><strong>{formatValue(data?.km_per_valid_closed_possession, 'km')}</strong>
          <p>Razão descritiva do total de km pelo número de posses válidas.</p>
          <button type="button" className="analytics-entity-link" onClick={() => openPossessions('Amostra de km por posse', 'km')}>Ver amostra</button></div>
        <div><span>Posses iniciadas / encerradas</span><strong>{data ? `${data.started} / ${data.ended}` : '—'}</strong>
          <button type="button" className="analytics-entity-link" onClick={() => openPossessions('Aberturas e encerramentos de posse')}>Ver eventos</button></div>
      </div>
      <p className="analytics-scope-note">{data?.methodology.events} {data?.methodology.distance}</p>
    </AnalyticsSection>

    <div className="analytics-cockpit-grid">
      <AnalyticsSection title="Duração registrada" {...state}>
        <dl className="analytics-definition-list">
          <div><dt>Horas em posses encerradas integralmente no recorte</dt><dd>{formatValue(data?.duration_hours, 'h')}</dd></div>
          <div><dt>Posses com duração válida</dt><dd>{data?.valid_duration_count ?? '—'}</dd></div>
        </dl>
        <button type="button" className="analytics-entity-link" onClick={() => openPossessions('Posses que compõem a duração', 'duration')}>Ver posses da amostra</button>
        <p className="analytics-scope-note">{data?.methodology.duration}</p>
      </AnalyticsSection>
      <AnalyticsSection title="Sem evento de posse no recorte" {...state}>
        <p><strong>{data?.without_possession_event ?? '—'}</strong> de {data?.roster_vehicles ?? '—'} veículo(s) do cadastro atual sem abertura ou encerramento registrado no período.</p>
        <p className="analytics-scope-note">{data?.methodology.without}</p>
      </AnalyticsSection>
    </div>

    <AnalyticsSection title="Situação cadastral atual" description="Status e manutenções em aberto são estados atuais, não disponibilidade histórica." {...state}>
      <dl className="analytics-definition-list">
        {Object.entries(STATUS).map(([key, label]) => <div key={key}><dt><button type="button" className="analytics-entity-link"
          onClick={() => { setSelectedStatus(key); setShown(20) }}>{label}</button></dt><dd>{data?.status_counts[key] ?? '—'}</dd></div>)}
        <div><dt>Veículos com manutenção sem fim registrado</dt><dd>{data?.vehicles_with_open_maintenance ?? '—'}</dd></div>
        <div><dt>Registros de manutenção sem fim</dt><dd>{data?.open_maintenance_records ?? '—'}</dd></div>
      </dl>
      <p className="analytics-scope-note">{data?.methodology.status}</p>
    </AnalyticsSection>

    <div className="analytics-cockpit-grid">
      <AnalyticsSection title="Maior km observado" description="Somente veículos com posse encerrada e km válido." {...state} empty={!byKm.length}>
        <ol className="analytics-detail-timeline">{byKm.slice(0, 10).map((item) => <li key={item.vehicle_id}>
          {vehicleLink(item)} · {formatValue(item.distance_km, 'km')} · {item.valid_km_count} posse(s) válida(s)
        </li>)}</ol>
      </AnalyticsSection>
      <AnalyticsSection title="Menor km observado" description="Somente veículos com medição válida; ausência de medição não entra no ranking." {...state} empty={!byKm.length}>
        <ol className="analytics-detail-timeline">{byKm.slice(-10).reverse().map((item) => <li key={item.vehicle_id}>
          {vehicleLink(item)} · {formatValue(item.distance_km, 'km')} · {item.valid_km_count} posse(s) válida(s)
        </li>)}</ol>
      </AnalyticsSection>
    </div>
    <p className="analytics-scope-note">{data?.methodology.ranking}</p>

    <AnalyticsSection title="Sem abertura/encerramento no período" description="O último evento de posse conhecido ajuda a investigar a ausência de novos registros." {...state} empty={!noEvent.length}>
      <div className="table-wrap" tabIndex={0}><table className="data-table"><thead><tr><th>Veículo</th><th>Status atual</th><th>Último evento de posse</th><th>Dias desde o evento</th></tr></thead>
        <tbody>{noEvent.slice(0, shown).map((item) => <tr key={item.vehicle_id}><td>{vehicleLink(item)}</td>
          <td>{STATUS[item.status] || item.status}</td><td>{eventDate(item.last_possession_event_at)}</td>
          <td>{item.days_since_last_event ?? '—'}</td></tr>)}</tbody></table></div>
      {shown < noEvent.length ? <button type="button" className="ghost-button" onClick={() => setShown((value) => value + 20)}>Mostrar mais veículos</button> : null}
      <p className="analytics-scope-note">{data?.methodology.last}</p>
    </AnalyticsSection>

    <AnalyticsSection title="Últimas aberturas/encerramentos observáveis" description="Até dez veículos com evento de posse conhecido até o fim do recorte." {...state} empty={!latest.length}>
      <ol className="analytics-detail-timeline">{latest.slice(0, 10).map((item) => <li key={item.vehicle_id}>
        {vehicleLink(item)} · {eventDate(item.last_possession_event_at)} · {item.days_since_last_event} dia(s) até o fim do recorte
      </li>)}</ol>
    </AnalyticsSection>

    <AnalyticsSection title="Visão por secretaria operadora atual" description="Agrupamento do cadastro atual; registros históricos podem ter outra responsabilidade." {...state} empty={!data?.organizations.length}>
      <div className="table-wrap" tabIndex={0}><table className="data-table"><thead><tr><th>Secretaria</th><th>Veículos</th><th>Sem evento</th><th>Posse iniciada</th><th>Posse encerrada</th><th>Km válido</th></tr></thead>
        <tbody>{data?.organizations.map((item) => <tr key={item.organization_id || 'unattributed'}><td>
          <button type="button" className="analytics-entity-link" onClick={() => { setSelectedOrganization(item.organization_id || 'unattributed'); setShown(20) }}>{item.name}</button></td>
          <td>{item.vehicles}</td><td>{item.without_possession_event}</td><td>{item.started}</td><td>{item.ended}</td>
          <td>{formatValue(item.distance_km, 'km')}</td></tr>)}</tbody></table></div>
      <p className="analytics-scope-note">{data?.methodology.organization}</p>
    </AnalyticsSection>

    <AnalyticsSection title="Veículos do cadastro atual" description="Selecione um veículo para consultar seu histórico de posses observáveis." {...state} empty={!filtered.length}>
      {(selectedOrganization !== null || selectedStatus !== null) ? <p className="analytics-scope-note">Seleção local aplicada à tabela: {filtered.length} de {vehicles.length} veículo(s).</p> : null}
      {(selectedOrganization !== null || selectedStatus !== null) ? <button type="button" className="ghost-button"
        onClick={() => { setSelectedOrganization(null); setSelectedStatus(null) }}>Limpar seleção local</button> : null}
      <div className="table-wrap" tabIndex={0}><table className="data-table"><thead><tr><th>Veículo</th><th>Status atual</th><th>Iniciadas</th><th>Encerradas</th><th>Km válido</th><th>Último evento de posse</th><th>Manutenções em aberto</th></tr></thead>
        <tbody>{filtered.slice(0, shown).map((item) => <tr key={item.vehicle_id}><td>{vehicleLink(item)}</td>
          <td>{STATUS[item.status] || item.status}</td><td>{item.started}</td><td>{item.ended}</td>
          <td>{formatValue(item.distance_km, 'km')}</td><td>{eventDate(item.last_possession_event_at)}</td>
          <td>{item.open_maintenance_records}</td></tr>)}</tbody></table></div>
      {shown < filtered.length ? <button type="button" className="ghost-button" onClick={() => setShown((value) => value + 20)}>Mostrar mais veículos</button> : null}
    </AnalyticsSection>
  </div>
}
