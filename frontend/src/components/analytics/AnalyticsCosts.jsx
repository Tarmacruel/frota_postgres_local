import { useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { analyticsV2API } from '../../api/analyticsV2'
import SearchableSelect from '../SearchableSelect'
import AnalyticsSection from './AnalyticsSection'
import AnalyticsEntityLink from './AnalyticsEntityLink'
import useCockpitResource from './useCockpitResource'
import { closedPeriod, formatDate, formatValue, numeric } from './analyticsV2Format'

const SOURCES = [
  ['fuel', 'fuel_supply', 'Combustível'],
  ['maintenance', 'maintenance', 'Manutenção'],
  ['fines', 'fine', 'Multas'],
]
const TYPES = { SEDAN: 'Sedan', HATCH: 'Hatch', SUV: 'SUV', PERUA_SW: 'Perua/SW', PICAPE: 'Picape', VAN: 'Van', MICRO_ONIBUS: 'Micro-ônibus', ONIBUS: 'Ônibus', CAMINHAO: 'Caminhão', MOTOCICLETA: 'Motocicleta', MAQUINA: 'Máquina' }

function amountLabel(amount) {
  return amount?.value === null && amount.records ? `Subtotal conhecido: ${formatValue(amount.known_value, 'BRL')}` : formatValue(amount?.value, 'BRL')
}

export default function AnalyticsCosts({ organizations = [], catalogError, onOpenEntity }) {
  const [applied, setApplied] = useState(() => ({ ...closedPeriod(), organization: '', vehicle_type: '' }))
  const [draft, setDraft] = useState(applied)
  const [validation, setValidation] = useState('')
  const [revision, setRevision] = useState(0)
  const [shown, setShown] = useState(20)
  const query = useMemo(() => ({ ...applied, organization: applied.organization || undefined, vehicle_type: applied.vehicle_type || undefined }), [applied])
  const resource = useCockpitResource(analyticsV2API.costs, query, revision, true)
  const data = resource.data
  const maxDate = closedPeriod(1).date_to
  const knownTotal = numeric(data?.totals.operational_cost.known_value) || 0
  const chart = (data?.monthly || []).map((item) => ({ month: item.month.split('-').reverse().join('/'),
    fuel: numeric(item.totals.fuel.value), maintenance: numeric(item.totals.maintenance.value), fines: numeric(item.totals.fines.value) }))

  function apply(event) {
    event.preventDefault()
    const days = (Date.parse(draft.date_to) - Date.parse(draft.date_from)) / 86400000 + 1
    if (!Number.isFinite(days) || days < 1 || days > 366 || draft.date_to > maxDate || draft.date_from < '1901-01-01') {
      setValidation('Selecione de 1 a 366 dias encerrados, com início anterior ou igual ao fim.')
      return
    }
    setValidation(''); setShown(20); setApplied({ ...draft })
  }
  function openEvents(title, { source, organizationBucket, dates, measuredOnly } = {}) {
    const filters = dates ? { ...query, ...dates } : query
    onOpenEntity({ entityType: 'costs', title, costSource: source || 'operational', organizationBucket, measuredOnly, filters,
      origin: { label: title, formula: source === 'claim' ? data?.methodology.claims : measuredOnly
        ? `${data?.methodology.mileage} Numerador: ${formatValue(data?.measured_cost.value, 'BRL')}. Denominador: ${formatValue(data?.measured_distance_km, 'km')}.`
        : data?.methodology.cost,
        limitations: [data?.methodology.missing, data?.methodology.organization, data?.methodology.claims].filter(Boolean) } })
  }
  function openVehicle(vehicle, label = 'Custo operacional do veículo') {
    onOpenEntity({ entityType: 'vehicle', entityId: vehicle.vehicle_id, title: vehicle.plate, filters: query,
      origin: { label, formula: label.includes('km') ? data?.methodology.mileage : data?.methodology.cost,
        limitations: [data?.methodology.missing, data?.methodology.claims].filter(Boolean) } })
  }
  function openMileage() {
    onOpenEntity({ entityType: 'mileage-events', title: 'Posses que compõem os quilômetros', filters: query,
      origin: { label: 'Quilometragem do custo operacional por km', formula: data?.methodology.mileage,
        limitations: [`Denominador: ${formatValue(data?.measured_distance_km, 'km')}.`,
          'A leitura dos registros individuais exige permissão de Posses.'].filter(Boolean) } })
  }
  function monthDates(month) {
    const start = `${month}-01`
    const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
    return { date_from: start < query.date_from ? query.date_from : start, date_to: end > query.date_to ? query.date_to : end }
  }
  const state = { loading: resource.loading, error: resource.error, onRetry: resource.onRetry }
  return <div className="analytics-costs">
    <form className="analytics-cockpit-filters" onSubmit={apply} aria-label="Filtros de Custos">
      <label>De<input type="date" value={draft.date_from} min="1901-01-01" max={maxDate} required onChange={(e) => setDraft((v) => ({ ...v, date_from: e.target.value }))} /></label>
      <label>Até<input type="date" value={draft.date_to} min="1901-01-01" max={maxDate} required onChange={(e) => setDraft((v) => ({ ...v, date_to: e.target.value }))} /></label>
      <label>Tipo de veículo<SearchableSelect ariaLabel="Tipo de veículo em Custos" value={draft.vehicle_type}
        options={[{ value: '', label: 'Todos os tipos' }, ...Object.entries(TYPES).map(([value, label]) => ({ value, label }))]}
        onChange={(value) => setDraft((v) => ({ ...v, vehicle_type: value }))} /></label>
      <label>Secretaria<SearchableSelect ariaLabel="Secretaria em Custos" value={draft.organization}
        options={[{ value: '', label: 'Todas no meu escopo' }, ...organizations.map((item) => ({ value: item.id, label: item.name }))]}
        onChange={(value) => setDraft((v) => ({ ...v, organization: value }))} /></label>
      <button type="submit" className="app-button">Aplicar filtros</button>
      <button type="button" className="ghost-button" onClick={() => setRevision((v) => v + 1)}>Atualizar</button>
    </form>
    {validation ? <p role="alert">{validation}</p> : null}
    {catalogError ? <p role="status" className="analytics-scope-note">Catálogo de secretarias indisponível. O escopo de acesso segue aplicado.</p> : null}
    <p className="analytics-scope-note">{formatDate(applied.date_from)} a {formatDate(applied.date_to)} · dias encerrados. {data?.methodology.cost}</p>

    <AnalyticsSection title="Custo operacional registrado" description="Combustível, manutenção e multas. Estimativas de sinistros ficam fora do total." {...state}>
      <div className="analytics-costs-summary">
        <div><span>Total do período</span><strong>{amountLabel(data?.totals.operational_cost)}</strong>
          <button type="button" className="analytics-entity-link" onClick={() => openEvents('Custo operacional registrado')}>Ver registros</button></div>
        <div><span>Custo operacional por km válido</span><strong>{formatValue(data?.cost_per_km, 'BRL/km')}</strong>
          <p>{formatValue(data?.measured_distance_km, 'km')} em {data?.measured_vehicles} veículo(s) medidos</p>
          <button type="button" className="analytics-entity-link" onClick={() => openEvents('Custo operacional por km válido', { measuredOnly: true })}>Ver registros do numerador</button>
          <button type="button" className="analytics-entity-link" onClick={openMileage}>Ver posses do denominador</button></div>
        <div><span>Sinistros estimados · fora do total</span><strong>{amountLabel(data?.totals.claim_estimate)}</strong>
          <button type="button" className="analytics-entity-link" onClick={() => openEvents('Sinistros estimados', { source: 'claim' })}>Ver registros</button></div>
      </div>
      {data?.totals.operational_cost.missing_or_invalid ? <p role="status" className="analytics-scope-note">{data.totals.operational_cost.missing_or_invalid} valor(es) ausente(s) ou inválido(s). O total completo não está disponível.</p> : null}
      <p className="analytics-scope-note">{data?.methodology.mileage}</p>
    </AnalyticsSection>

    <div className="analytics-cockpit-grid">
      <AnalyticsSection title="Composição" {...state}>
        <dl className="analytics-definition-list">{SOURCES.map(([key, source, label]) => <div key={key}><dt><button type="button" className="analytics-entity-link" onClick={() => openEvents(label, { source })}>{label}</button></dt>
          <dd>{amountLabel(data?.totals[key])}</dd></div>)}</dl>
        <p className="analytics-scope-note">Multas entram na data da infração, em todos os status. Valor registrado não comprova pagamento.</p>
      </AnalyticsSection>
      <AnalyticsSection title="Tendência mensal" description="Meses civis do recorte; valores ausentes não são preenchidos." {...state} empty={!data?.monthly.some((item) => item.totals.operational_cost.records)}>
        <div className="analytics-chart"><ResponsiveContainer><LineChart data={chart}>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis width={65} /><Tooltip formatter={(value) => formatValue(value, 'BRL')} /><Legend />
          <Line dataKey="fuel" name="Combustível" stroke="var(--ui-info)" connectNulls={false} isAnimationActive={false} />
          <Line dataKey="maintenance" name="Manutenção" stroke="var(--ui-warning)" connectNulls={false} isAnimationActive={false} />
          <Line dataKey="fines" name="Multas" stroke="var(--ui-danger)" connectNulls={false} isAnimationActive={false} />
        </LineChart></ResponsiveContainer></div>
        <div className="analytics-costs-months">{data?.monthly.filter((item) => item.totals.operational_cost.records).map((item) => <button type="button" key={item.month} className="analytics-entity-link"
          onClick={() => openEvents(`Custos de ${item.month}`, { dates: monthDates(item.month) })}>{item.month} · {amountLabel(item.totals.operational_cost)}</button>)}</div>
      </AnalyticsSection>
    </div>

    <AnalyticsSection title="Pareto por veículo" description="Participação no subtotal conhecido do período; a ordem não atribui causalidade." {...state} empty={!data?.vehicles.length}>
      {data?.totals.operational_cost.missing_or_invalid ? <p className="analytics-scope-note">Há valores ausentes ou inválidos. Participações usam apenas o subtotal conhecido.</p> : null}
      <ol className="analytics-costs-pareto">{data?.vehicles.slice(0, 10).map((vehicle, index) => {
        const cumulative = data.vehicles.slice(0, index + 1).reduce((sum, item) => sum + (numeric(item.totals.operational_cost.known_value) || 0), 0)
        return <li key={vehicle.vehicle_id}><button type="button" className="analytics-entity-link" onClick={() => openVehicle(vehicle)}>{vehicle.plate}</button>
          <progress value={knownTotal ? cumulative / knownTotal : 0} max="1" aria-label={`Participação acumulada até ${vehicle.plate}`} />
          <span>{knownTotal ? `${(cumulative / knownTotal * 100).toFixed(1)}% acumulado` : 'Sem valor conhecido'} · {amountLabel(vehicle.totals.operational_cost)}</span></li>
      })}</ol>
      {data?.vehicles.length > 10 ? <p className="analytics-scope-note">Exibindo 10 de {data.vehicles.length} veículos. O ranking completo está abaixo.</p> : null}
    </AnalyticsSection>

    <AnalyticsSection title="Custos por secretaria" description="Responsabilidade do evento ou lotação histórica não ambígua." {...state} empty={!data?.organizations.length}>
      <div className="table-wrap" tabIndex={0}><table className="data-table"><thead><tr><th>Secretaria</th><th>Veículos</th><th>Custo operacional</th><th>Combustível</th><th>Manutenção</th><th>Multas</th><th>Sinistros estimados</th></tr></thead>
        <tbody>{data?.organizations.map((item) => { const bucket = item.organization_id || 'unattributed'
          return <tr key={bucket}><td><button type="button" className="analytics-entity-link" onClick={() => openEvents(item.name, { organizationBucket: bucket })}>{item.name}</button></td>
            <td>{item.vehicle_count}</td><td>{amountLabel(item.totals.operational_cost)}</td>
            {SOURCES.map(([key, source, label]) => <td key={key}><button type="button" className="analytics-entity-link" aria-label={`${item.name} · ${label}`}
              onClick={() => openEvents(`${item.name} · ${label}`, { organizationBucket: bucket, source })}>{amountLabel(item.totals[key])}</button></td>)}
            <td><button type="button" className="analytics-entity-link" onClick={() => openEvents(`${item.name} · sinistros estimados`, { organizationBucket: bucket, source: 'claim' })}>{amountLabel(item.totals.claim_estimate)}</button></td></tr> })}</tbody></table></div>
    </AnalyticsSection>

    <AnalyticsSection title="Ranking de veículos" description="Custo registrado e custo/km somente quando há km válido no recorte." {...state} empty={!data?.vehicles.length}>
      <div className="table-wrap" tabIndex={0}><table className="data-table"><thead><tr><th>Veículo</th><th>Custo operacional</th><th>Km válido</th><th>Custo/km</th></tr></thead>
        <tbody>{data?.vehicles.slice(0, shown).map((vehicle) => <tr key={vehicle.vehicle_id}>
          <td><AnalyticsEntityLink entityType="vehicle" entityId={vehicle.vehicle_id} entityName={vehicle.plate}
            onOpen={() => openVehicle(vehicle)}>{vehicle.plate}</AnalyticsEntityLink></td>
          <td>{amountLabel(vehicle.totals.operational_cost)}</td><td>{formatValue(vehicle.distance_km, 'km')}</td>
          <td>{formatValue(vehicle.cost_per_km, 'BRL/km')}</td></tr>)}</tbody></table></div>
      {shown < (data?.vehicles.length || 0) ? <button type="button" className="ghost-button" onClick={() => setShown((v) => v + 20)}>Mostrar mais veículos</button> : null}
    </AnalyticsSection>
  </div>
}
