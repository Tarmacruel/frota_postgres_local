import { useMemo, useState } from 'react'
import { analyticsV2API } from '../../api/analyticsV2'
import SearchableSelect from '../SearchableSelect'
import AnalyticsSection from './AnalyticsSection'
import useCockpitResource from './useCockpitResource'
import { closedPeriod, formatDate, formatValue } from './analyticsV2Format'

const TYPES = { SEDAN: 'Sedan', HATCH: 'Hatch', SUV: 'SUV', PERUA_SW: 'Perua/SW', PICAPE: 'Picape', VAN: 'Van', MICRO_ONIBUS: 'Micro-ônibus', ONIBUS: 'Ônibus', CAMINHAO: 'Caminhão', MOTOCICLETA: 'Motocicleta', MAQUINA: 'Máquina' }
const SOURCES = { possession: 'Posses', fine: 'Multas', claim: 'Sinistros', fuel_supply: 'Abastecimentos', anomaly: 'Anomalias' }
const RANKINGS = [
  ['possessions', 'Mais posses', 'possession'], ['distance_km', 'Mais km válido', 'possession'],
  ['fines', 'Mais multas', 'fine'], ['claims', 'Mais sinistros', 'claim'],
  ['fuel_supplies', 'Mais abastecimentos', 'fuel_supply'], ['anomaly_rules', 'Mais regras de anomalia', 'anomaly'],
]
const LICENSE = { expired: 'Vencida', expiring: 'A vencer em 30 dias', valid: 'Válida', missing: 'Sem data cadastrada' }

export default function AnalyticsDrivers({ organizations = [], catalogError, onOpenEntity }) {
  const [applied, setApplied] = useState(() => ({ ...closedPeriod(), organization: '', vehicle_type: '' }))
  const [draft, setDraft] = useState(applied)
  const [validation, setValidation] = useState('')
  const [revision, setRevision] = useState(0)
  const [ranking, setRanking] = useState('possessions')
  const [shown, setShown] = useState(20)
  const query = useMemo(() => ({ ...applied, organization: applied.organization || undefined,
    vehicle_type: applied.vehicle_type || undefined }), [applied])
  const resource = useCockpitResource(analyticsV2API.drivers, query, revision, true)
  const data = resource.data
  const state = { loading: resource.loading, error: resource.error, onRetry: resource.onRetry }
  const maxDate = closedPeriod(1).date_to
  const rows = [...(data?.drivers || [])].sort((a, b) =>
    (b.possessions + b.fines + b.claims + b.fuel_supplies) - (a.possessions + a.fines + a.claims + a.fuel_supplies)
    || a.name.localeCompare(b.name))
  const rankingDefinition = RANKINGS.find(([key]) => key === ranking)
  const ranked = [...rows].filter((item) => Number(item[ranking]) > 0)
    .sort((a, b) => Number(b[ranking]) - Number(a[ranking]) || a.name.localeCompare(b.name))
  const administrative = rows.filter((item) => (!applied.organization || item.organization_id === applied.organization)
    && (item.license_status === 'expired' || item.license_status === 'expiring'))
    .sort((a, b) => a.license_expires_at.localeCompare(b.license_expires_at) || a.name.localeCompare(b.name))
  const showLicenseRows = !applied.vehicle_type && !applied.vehicle_id

  function apply(event) {
    event.preventDefault()
    const days = (Date.parse(draft.date_to) - Date.parse(draft.date_from)) / 86400000 + 1
    if (!Number.isFinite(days) || days < 1 || days > 366 || draft.date_to > maxDate || draft.date_from < '1901-01-01') {
      setValidation('Selecione de 1 a 366 dias encerrados, com início anterior ou igual ao fim.')
      return
    }
    setValidation(''); setShown(20); setApplied({ ...draft })
  }

  function openDriver(item, requestedSource = 'possession') {
    const readable = data?.readable_sources || []
    const source = readable.includes(requestedSource) ? requestedSource : readable[0] || null
    const method = source === 'possession' ? `${data?.methodology.possession} ${data?.methodology.distance}`
      : source === 'fine' || source === 'claim' ? data?.methodology.incidents : data?.methodology.fuel
    onOpenEntity({ entityType: 'driver-analysis', entityId: item.driver_id, title: item.name,
      driverRow: item, driverSource: source, readableSources: readable, driverMethodology: data?.methodology, filters: query,
      origin: { label: `${SOURCES[source] || 'Resumo'} de ${item.name}`, formula: method,
        limitations: [data?.methodology.scope, data?.methodology.coverage].filter(Boolean) } })
  }

  function driverButton(item, source, content) {
    return <button type="button" className="analytics-entity-link" onClick={() => openDriver(item, source)}>{content || item.name}</button>
  }

  function metricCell(item, source, value) {
    return data?.readable_sources?.includes(source) ? driverButton(item, source, value) : value
  }

  return <div className="analytics-costs">
    <form className="analytics-cockpit-filters" onSubmit={apply} aria-label="Filtros de Condutores">
      <label>De<input type="date" value={draft.date_from} min="1901-01-01" max={maxDate} required onChange={(event) => setDraft((value) => ({ ...value, date_from: event.target.value }))} /></label>
      <label>Até<input type="date" value={draft.date_to} min="1901-01-01" max={maxDate} required onChange={(event) => setDraft((value) => ({ ...value, date_to: event.target.value }))} /></label>
      <label>Tipo de veículo<SearchableSelect ariaLabel="Tipo de veículo em Condutores" value={draft.vehicle_type}
        options={[{ value: '', label: 'Todos os tipos' }, ...Object.entries(TYPES).map(([value, label]) => ({ value, label }))]}
        onChange={(value) => setDraft((current) => ({ ...current, vehicle_type: value }))} /></label>
      <label>Secretaria<SearchableSelect ariaLabel="Secretaria em Condutores" value={draft.organization}
        options={[{ value: '', label: 'Todas no meu escopo' }, ...organizations.map((item) => ({ value: item.id, label: item.name }))]}
        onChange={(value) => setDraft((current) => ({ ...current, organization: value }))} /></label>
      <button type="submit" className="app-button">Aplicar filtros</button>
      <button type="button" className="ghost-button" onClick={() => setRevision((value) => value + 1)}>Atualizar</button>
    </form>
    {validation ? <p role="alert">{validation}</p> : null}
    {catalogError ? <p role="status" className="analytics-scope-note">Catálogo de secretarias indisponível. O escopo de acesso segue aplicado.</p> : null}
    <p className="analytics-scope-note">{formatDate(applied.date_from)} a {formatDate(applied.date_to)} · {data?.methodology.scope}</p>

    <AnalyticsSection title="Registros vinculados a condutores" description="Contagens absolutas dos vínculos explícitos; sem pontuação de risco." {...state}>
      <div className="analytics-costs-summary analytics-drivers-summary">
        <div><span>Condutores no universo</span><strong>{data?.totals.drivers ?? '—'}</strong><p>{data?.drivers_with_records ?? '—'} com registro no recorte</p></div>
        <div><span>Posses iniciadas / km válido</span><strong>{data?.totals.possessions ?? '—'} / {formatValue(data?.totals.distance_km, 'km')}</strong><p>{data?.totals.valid_km_possessions ?? '—'} posse(s) com km válido</p></div>
        <div><span>Multas / sinistros</span><strong>{data ? `${data.totals.fines} / ${data.totals.claims}` : '—'}</strong><p>Eventos vinculados, sem atribuição de culpa</p></div>
        <div><span>Abastecimentos / regras de anomalia</span><strong>{data ? `${data.totals.fuel_supplies} / ${data.totals.anomaly_rules}` : '—'}</strong><p>Mais de uma regra pode ocorrer no mesmo abastecimento</p></div>
      </div>
      <p className="analytics-scope-note">{data?.methodology.distance} {data?.methodology.fuel}</p>
    </AnalyticsSection>

    <AnalyticsSection title="Ranking por medida registrada" description="Escolha a coluna de ordenação; nenhum score composto é calculado." {...state} empty={!ranked.length}>
      <div className="analytics-detail-related" role="group" aria-label="Ordenação do ranking">
        {RANKINGS.map(([key, label]) => <button key={key} type="button" className={ranking === key ? 'app-button' : 'ghost-button'}
          aria-pressed={ranking === key} onClick={() => setRanking(key)}>{label}</button>)}
      </div>
      <div className="table-wrap" tabIndex={0}><table className="data-table"><thead><tr><th>Condutor</th><th>{rankingDefinition?.[1]}</th><th>Veículos com posse</th><th>Multas</th><th>Sinistros</th><th>Anomalias</th></tr></thead>
        <tbody>{ranked.slice(0, 15).map((item) => <tr key={item.driver_id}><td>{driverButton(item, rankingDefinition?.[2])}</td>
          <td>{ranking === 'distance_km' ? formatValue(item.distance_km, 'km') : item[ranking]}</td><td>{item.vehicles_with_possession}</td>
          <td>{item.fines}</td><td>{item.claims}</td><td>{item.anomaly_rules}</td></tr>)}</tbody></table></div>
      <p className="analytics-scope-note">{data?.methodology.ranking}</p>
    </AnalyticsSection>

    <AnalyticsSection title="Condutores e fontes" description="Selecione o nome ou uma contagem para investigar os registros vinculados." {...state} empty={!rows.length}>
      <div className="table-wrap" tabIndex={0}><table className="data-table"><thead><tr><th>Condutor</th><th>Posses</th><th>Km válido</th><th>Veículos</th><th>Multas</th><th>Sinistros</th><th>Abastecimentos</th><th>Anomalias</th></tr></thead>
        <tbody>{rows.slice(0, shown).map((item) => <tr key={item.driver_id}><td>{driverButton(item, 'possession')}</td>
          <td>{item.possessions ? metricCell(item, 'possession', item.possessions) : 0}</td>
          <td>{item.distance_km !== null ? metricCell(item, 'possession', formatValue(item.distance_km, 'km')) : '—'}</td>
          <td>{item.vehicles_with_possession}</td>
          <td>{item.fines ? metricCell(item, 'fine', item.fines) : 0}</td>
          <td>{item.claims ? metricCell(item, 'claim', item.claims) : 0}</td>
          <td>{item.fuel_supplies ? metricCell(item, 'fuel_supply', item.fuel_supplies) : 0}</td>
          <td>{item.anomaly_rules ? metricCell(item, 'anomaly', item.anomaly_rules) : 0}</td></tr>)}</tbody></table></div>
      {shown < rows.length ? <button type="button" className="ghost-button" onClick={() => setShown((value) => value + 20)}>Mostrar mais condutores</button> : null}
      <p className="analytics-scope-note">{data?.methodology.possession} {data?.methodology.incidents}</p>
    </AnalyticsSection>

    <AnalyticsSection title="CNH — acompanhamento administrativo atual" description="Indicador cadastral independente das ocorrências e do ranking." {...state}>
      {data?.license ? <>
        <dl className="analytics-definition-list"><div><dt>Condutores ativos no cadastro</dt><dd>{data.license.active_drivers}</dd></div>
          <div><dt>CNH vencida</dt><dd>{data.license.expired}</dd></div><div><dt>A vencer em 30 dias</dt><dd>{data.license.expiring}</dd></div>
          <div><dt>Sem data cadastrada</dt><dd>{data.license.missing}</dd></div></dl>
        {!showLicenseRows ? <p className="analytics-scope-note">A lista individual de CNH é exibida sem filtro de tipo/veículo. Os contadores acima seguem o cadastro atual da secretaria.</p> : null}
        {showLicenseRows && administrative.length ? <div className="table-wrap" tabIndex={0}><table className="data-table"><thead><tr><th>Condutor</th><th>Validade registrada</th><th>Situação em {formatDate(data.license.as_of)}</th></tr></thead>
          <tbody>{administrative.map((item) => <tr key={item.driver_id}><td>{driverButton(item, 'possession')}</td>
            <td>{formatDate(item.license_expires_at)}</td><td>{LICENSE[item.license_status]}</td></tr>)}</tbody></table></div> : null}
      </> : <p className="analytics-scope-note">A consulta de CNH requer permissão de leitura de condutores.</p>}
      <p className="analytics-scope-note">{data?.methodology.license}</p>
    </AnalyticsSection>

    <AnalyticsSection title="Cobertura dos vínculos" description="Registros sem condutor identificado não entram nas linhas individuais." {...state}>
      <dl className="analytics-definition-list">{Object.entries({ possession: 'Posses', fine: 'Multas', claim: 'Sinistros', fuel_supply: 'Abastecimentos', anomaly_rule: 'Regras de anomalia' })
        .map(([key, label]) => <div key={key}><dt>{label} sem driver_id</dt><dd>{data?.unlinked_records[key] ?? '—'}</dd></div>)}</dl>
      <p className="analytics-scope-note">{data?.methodology.coverage}</p>
    </AnalyticsSection>
  </div>
}
