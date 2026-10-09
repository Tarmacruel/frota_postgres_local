import { useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { analyticsV2API } from '../../api/analyticsV2'
import SearchableSelect from '../SearchableSelect'
import AnalyticsSection from './AnalyticsSection'
import AnalyticsEntityLink from './AnalyticsEntityLink'
import useCockpitResource from './useCockpitResource'
import { closedPeriod, formatDate, formatValue, numeric } from './analyticsV2Format'

const TYPES = { SEDAN: 'Sedan', HATCH: 'Hatch', SUV: 'SUV', PERUA_SW: 'Perua/SW', PICAPE: 'Picape', VAN: 'Van', MICRO_ONIBUS: 'Micro-ônibus', ONIBUS: 'Ônibus', CAMINHAO: 'Caminhão', MOTOCICLETA: 'Motocicleta', MAQUINA: 'Máquina' }
const ANOMALIES = { capacity: 'Capacidade', odometer: 'Hodômetro', close: 'Proximidade', consumption: 'Razão km/L', price: 'Preço/L' }

function amountLabel(amount, unit) {
  return amount?.value === null && amount.records
    ? `Subtotal conhecido: ${formatValue(amount.known_value, unit)}` : formatValue(amount?.value, unit)
}

function priceLabel(value) {
  return value == null ? formatValue(null) : `${formatValue(value, 'BRL')}/L`
}

function dateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Bahia', dateStyle: 'short', timeStyle: 'short',
  }).format(date)
}

export default function AnalyticsFuel({ organizations = [], catalogError, onOpenEntity }) {
  const [applied, setApplied] = useState(() => ({ ...closedPeriod(), organization: '', vehicle_type: '' }))
  const [draft, setDraft] = useState(applied)
  const [validation, setValidation] = useState('')
  const [revision, setRevision] = useState(0)
  const [shownVehicles, setShownVehicles] = useState(20)
  const [shownAnomalies, setShownAnomalies] = useState(20)
  const query = useMemo(() => ({ ...applied, organization: applied.organization || undefined,
    vehicle_type: applied.vehicle_type || undefined }), [applied])
  const resource = useCockpitResource(analyticsV2API.fuel, query, revision, true)
  const data = resource.data
  const maxDate = closedPeriod(1).date_to
  const chart = (data?.monthly || []).map((item) => ({ month: item.month.split('-').reverse().join('/'),
    cost: numeric(item.totals.cost.value), liters: numeric(item.totals.liters.value) }))
  const state = { loading: resource.loading, error: resource.error, onRetry: resource.onRetry }

  function apply(event) {
    event.preventDefault()
    const days = (Date.parse(draft.date_to) - Date.parse(draft.date_from)) / 86400000 + 1
    if (!Number.isFinite(days) || days < 1 || days > 366 || draft.date_to > maxDate || draft.date_from < '1901-01-01') {
      setValidation('Selecione de 1 a 366 dias encerrados, com início anterior ou igual ao fim.')
      return
    }
    setValidation(''); setShownVehicles(20); setShownAnomalies(20); setApplied({ ...draft })
  }
  function openEvents(title, stationKey, dates) {
    onOpenEntity({ entityType: 'fuel-events', title, stationKey, filters: dates ? { ...query, ...dates } : query,
      origin: { label: title, formula: `${data?.methodology.liters} ${data?.methodology.cost}`,
        limitations: [data?.methodology.period, data?.methodology.anomalies].filter(Boolean) } })
  }
  function openVehicle(item) {
    onOpenEntity({ entityType: 'vehicle', entityId: item.vehicle_id, title: item.plate, filters: query,
      origin: { label: `Abastecimentos de ${item.plate}`, formula: data?.methodology.mileage,
        limitations: [data?.methodology.category, data?.methodology.liters].filter(Boolean) } })
  }
  function openAnomaly(item, supplyId = item.supply_id) {
    onOpenEntity({ entityType: 'record', entityId: supplyId, source: 'fuel_supply',
      title: `${item.label} · ${item.plate}`, filters: query,
      origin: { label: item.label, formula: item.rule,
        limitations: [`Observado: ${item.observed}. Referência: ${item.reference}. Amostra: ${item.sample_size} registro(s)/intervalo(s).`,
          item.limitation, `Versão da regra: ${item.rule_version}.`] } })
  }
  function monthDates(month) {
    const start = `${month}-01`
    const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
    return { date_from: start < query.date_from ? query.date_from : start,
      date_to: end > query.date_to ? query.date_to : end }
  }
  return <div className="analytics-fuel">
    <form className="analytics-cockpit-filters" onSubmit={apply} aria-label="Filtros de Combustível">
      <label>De<input type="date" value={draft.date_from} min="1901-01-01" max={maxDate} required onChange={(e) => setDraft((v) => ({ ...v, date_from: e.target.value }))} /></label>
      <label>Até<input type="date" value={draft.date_to} min="1901-01-01" max={maxDate} required onChange={(e) => setDraft((v) => ({ ...v, date_to: e.target.value }))} /></label>
      <label>Tipo de veículo<SearchableSelect ariaLabel="Tipo de veículo em Combustível" value={draft.vehicle_type}
        options={[{ value: '', label: 'Todos os tipos' }, ...Object.entries(TYPES).map(([value, label]) => ({ value, label }))]}
        onChange={(value) => setDraft((v) => ({ ...v, vehicle_type: value }))} /></label>
      <label>Secretaria<SearchableSelect ariaLabel="Secretaria em Combustível" value={draft.organization}
        options={[{ value: '', label: 'Todas no meu escopo' }, ...organizations.map((item) => ({ value: item.id, label: item.name }))]}
        onChange={(value) => setDraft((v) => ({ ...v, organization: value }))} /></label>
      <button type="submit" className="app-button">Aplicar filtros</button>
      <button type="button" className="ghost-button" onClick={() => setRevision((value) => value + 1)}>Atualizar</button>
    </form>
    {validation ? <p role="alert">{validation}</p> : null}
    {catalogError ? <p role="status" className="analytics-scope-note">Catálogo de secretarias indisponível. O escopo de acesso segue aplicado.</p> : null}
    <p className="analytics-scope-note">{formatDate(applied.date_from)} a {formatDate(applied.date_to)} · {data?.methodology.period}</p>

    <AnalyticsSection title="Abastecimentos do período" description="Litros e valores registrados; não há medição estruturada de tanque cheio." {...state}>
      <div className="analytics-fuel-summary">
        <div><span>Litros abastecidos</span><strong>{amountLabel(data?.totals.liters, 'L')}</strong>
          <small>{data?.totals.records} abastecimento(s)</small></div>
        <div><span>Valor registrado</span><strong>{amountLabel(data?.totals.cost, 'BRL')}</strong>
          <small>Período anterior: {amountLabel(data?.previous_totals.cost, 'BRL')}</small></div>
        <div><span>Preço médio ponderado</span><strong>{priceLabel(data?.totals.price_per_liter)}</strong>
          <small>{data?.totals.priced_records} registro(s) com valor e litros válidos</small></div>
        <div><span>Km de posses válidas</span><strong>{formatValue(data?.measured_distance_km, 'km')}</strong>
          <small>{data?.measured_vehicles} veículo(s) medidos</small></div>
        <div><span>Km por litro abastecido</span><strong>{formatValue(data?.measured_km_per_liter_supplied, 'km/L')}</strong>
          <small>Secundário: {formatValue(data?.measured_liters_per_100km_supplied, 'L/100km')}</small></div>
      </div>
      {data?.can_view_records ? <button type="button" className="analytics-entity-link" onClick={() => openEvents('Abastecimentos do período')}>Ver abastecimentos de origem</button> : null}
      <p className="analytics-scope-note">{data?.methodology.price} {data?.methodology.mileage}</p>
      {data?.totals.cost.missing_or_invalid || data?.totals.liters.missing_or_invalid ? <p role="status" className="analytics-scope-note">Há valores ou litros ausentes/inválidos; totais completos e razões dependentes ficam indisponíveis.</p> : null}
    </AnalyticsSection>

    <div className="analytics-cockpit-grid">
      <AnalyticsSection title="Evolução de abastecimentos" description="Valor e litros por mês civil no recorte aplicado." {...state} empty={!data?.totals.records}>
        <div className="analytics-chart"><ResponsiveContainer><LineChart data={chart}>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" />
          <YAxis yAxisId="cost" width={65} /><YAxis yAxisId="liters" orientation="right" width={65} />
          <Tooltip formatter={(value, name) => formatValue(value, name === 'Litros' ? 'L' : 'BRL')} /><Legend />
          <Line yAxisId="cost" dataKey="cost" name="Valor registrado" stroke="var(--ui-info)" connectNulls={false} isAnimationActive={false} />
          <Line yAxisId="liters" dataKey="liters" name="Litros" stroke="var(--ui-success)" connectNulls={false} isAnimationActive={false} />
        </LineChart></ResponsiveContainer></div>
        {data?.can_view_records ? <div className="analytics-costs-months">{data.monthly.filter((item) => item.totals.records).map((item) => <button type="button" key={item.month}
          className="analytics-entity-link" onClick={() => openEvents(`Abastecimentos de ${item.month}`, undefined, monthDates(item.month))}>{item.month} · {item.totals.records} registro(s)</button>)}</div> : null}
      </AnalyticsSection>
      <AnalyticsSection title="Qualidade e cobertura" description="Contagens verificáveis, sem score estimado." {...state}>
        <dl className="analytics-quality-grid">
          <div><dt>Sem valor válido</dt><dd>{data?.quality.missing_value}</dd></div>
          <div><dt>Litros inválidos</dt><dd>{data?.quality.invalid_liters}</dd></div>
          <div><dt>Sem capacidade cadastrada</dt><dd>{data?.quality.missing_tank_capacity}</dd></div>
          <div><dt>Sem posto</dt><dd>{data?.quality.missing_station}</dd></div>
          <div><dt>Sem amostra para km/L</dt><dd>{data?.quality.insufficient_consumption_reference}</dd></div>
          <div><dt>Sem amostra para preço</dt><dd>{data?.quality.insufficient_price_reference}</dd></div>
        </dl>
        <p className="analytics-scope-note">Flags operacionais já registradas: {data?.quality.registered_operational_flags}. São uma regra distinta e não foram recalculadas nesta análise.</p>
      </AnalyticsSection>
    </div>

    <AnalyticsSection title="Anomalias para conferência" description="Regras de triagem explicáveis, sem inferir fraude ou causa." {...state}>
      <dl className="analytics-fuel-anomaly-counts">{Object.entries(ANOMALIES).map(([kind, label]) => <div key={kind}><dt>{label}</dt><dd>{data?.anomaly_counts[kind] || 0}</dd></div>)}</dl>
      {data?.can_view_records ? <>
        {data.anomalies.length ? <ol className="analytics-fuel-anomalies">{data.anomalies.slice(0, shownAnomalies).map((item) => <li key={`${item.kind}-${item.supply_id}`}>
          <div><strong>{item.label}</strong><span>{item.plate} · {dateTime(item.supplied_at)}</span></div>
          <p>Observado: {item.observed} · referência: {item.reference} · amostra: {item.sample_size}</p>
          <p>{item.rule}</p><p className="analytics-scope-note">{item.limitation}</p>
          <div className="analytics-fuel-anomaly-actions"><button type="button" className="analytics-entity-link" onClick={() => openAnomaly(item)}>Abrir abastecimento e regra</button>
            {item.previous_supply_id ? <button type="button" className="analytics-entity-link" onClick={() => openAnomaly(item, item.previous_supply_id)}>Registro anterior</button> : null}</div>
        </li>)}</ol> : <p>Sem anomalias para as regras e amostras disponíveis neste recorte.</p>}
        {shownAnomalies < data.anomalies.length ? <button type="button" className="ghost-button" onClick={() => setShownAnomalies((value) => value + 20)}>Mostrar mais anomalias</button> : null}
      </> : <p className="analytics-scope-note">A consulta individual exige permissão de leitura de abastecimentos. Os totais permanecem no escopo de Analytics.</p>}
      <p className="analytics-scope-note">{data?.methodology.anomalies}</p>
    </AnalyticsSection>

    <AnalyticsSection title="Ranking de veículos" description="Ordenado por valor conhecido; km e razões usam posses válidas dos mesmos veículos." {...state} empty={!data?.vehicles.length}>
      <div className="table-wrap" tabIndex={0}><table className="data-table"><thead><tr><th>Veículo</th><th>Abastecimentos</th><th>Valor</th><th>Litros</th><th>Km válido</th><th>Km/L abastecido</th><th>Categoria L/100 km</th><th>Anomalias</th></tr></thead>
        <tbody>{data?.vehicles.slice(0, shownVehicles).map((item) => <tr key={item.vehicle_id}>
          <td><AnalyticsEntityLink entityType="vehicle" entityId={item.vehicle_id} entityName={item.plate} onOpen={() => openVehicle(item)}>{item.plate}</AnalyticsEntityLink></td>
          <td>{item.totals.records}</td><td>{amountLabel(item.totals.cost, 'BRL')}</td><td>{amountLabel(item.totals.liters, 'L')}</td>
          <td>{formatValue(item.distance_km, 'km')}</td><td>{formatValue(item.km_per_liter_supplied, 'km/L')}</td>
          <td>{item.category_sample_vehicles ? `${formatValue(item.category_liters_per_100km, 'L/100km')} · ${item.category_sample_vehicles} pares` : 'Amostra insuficiente'}</td>
          <td>{item.anomaly_count}</td></tr>)}</tbody></table></div>
      {shownVehicles < (data?.vehicles.length || 0) ? <button type="button" className="ghost-button" onClick={() => setShownVehicles((value) => value + 20)}>Mostrar mais veículos</button> : null}
      <p className="analytics-scope-note">{data?.methodology.category}</p>
    </AnalyticsSection>

    <AnalyticsSection title="Abastecimentos por posto" description="Posto vinculado ou nome registrado no evento; sem posto aparece separado." {...state} empty={!data?.stations.length}>
      <div className="table-wrap" tabIndex={0}><table className="data-table"><thead><tr><th>Posto</th><th>Registros</th><th>Litros</th><th>Valor</th><th>Preço/L ponderado</th><th>Anomalias</th></tr></thead>
        <tbody>{data?.stations.map((item) => <tr key={item.key}>
          <td>{data.can_view_records ? <button type="button" className="analytics-entity-link" onClick={() => openEvents(`Abastecimentos · ${item.name}`, item.key)}>{item.name}</button> : item.name}</td>
          <td>{item.totals.records}</td><td>{amountLabel(item.totals.liters, 'L')}</td><td>{amountLabel(item.totals.cost, 'BRL')}</td>
          <td>{priceLabel(item.totals.price_per_liter)}</td><td>{item.anomaly_count}</td></tr>)}</tbody></table></div>
    </AnalyticsSection>
  </div>
}
