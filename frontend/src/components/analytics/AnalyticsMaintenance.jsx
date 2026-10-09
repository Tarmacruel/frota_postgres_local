import { useMemo, useState } from 'react'
import { analyticsV2API } from '../../api/analyticsV2'
import SearchableSelect from '../SearchableSelect'
import AnalyticsSection from './AnalyticsSection'
import AnalyticsEntityLink from './AnalyticsEntityLink'
import useCockpitResource from './useCockpitResource'
import { closedPeriod, formatDate, formatValue } from './analyticsV2Format'

const TYPES = { SEDAN: 'Sedan', HATCH: 'Hatch', SUV: 'SUV', PERUA_SW: 'Perua/SW', PICAPE: 'Picape', VAN: 'Van', MICRO_ONIBUS: 'Micro-ônibus', ONIBUS: 'Ônibus', CAMINHAO: 'Caminhão', MOTOCICLETA: 'Motocicleta', MAQUINA: 'Máquina' }

function amountLabel(amount) {
  return amount?.value === null && amount.records
    ? `Subtotal conhecido: ${formatValue(amount.known_value, 'BRL')}` : formatValue(amount?.value, 'BRL')
}

export default function AnalyticsMaintenance({ organizations = [], catalogError, onOpenEntity }) {
  const [applied, setApplied] = useState(() => ({ ...closedPeriod(), organization: '', vehicle_type: '' }))
  const [draft, setDraft] = useState(applied)
  const [validation, setValidation] = useState('')
  const [revision, setRevision] = useState(0)
  const [shown, setShown] = useState(20)
  const query = useMemo(() => ({ ...applied, organization: applied.organization || undefined,
    vehicle_type: applied.vehicle_type || undefined }), [applied])
  const resource = useCockpitResource(analyticsV2API.maintenance, query, revision, true)
  const data = resource.data
  const state = { loading: resource.loading, error: resource.error, onRetry: resource.onRetry }
  const maxDate = closedPeriod(1).date_to

  function apply(event) {
    event.preventDefault()
    const days = (Date.parse(draft.date_to) - Date.parse(draft.date_from)) / 86400000 + 1
    if (!Number.isFinite(days) || days < 1 || days > 366 || draft.date_to > maxDate || draft.date_from < '1901-01-01') {
      setValidation('Selecione de 1 a 366 dias encerrados, com início anterior ou igual ao fim.')
      return
    }
    setValidation(''); setShown(20); setApplied({ ...draft })
  }

  function openHistory(title, subset = 'all', vehicleId) {
    const filters = vehicleId ? { ...query, vehicle_id: vehicleId } : query
    const method = subset === 'open' ? data?.methodology.open : subset === 'duration' ? data?.methodology.duration
      : subset === 'repeated' ? data?.methodology.recurrence : subset === 'measured' ? data?.methodology.mileage : data?.methodology.cost
    onOpenEntity({ entityType: 'maintenance-events', title, maintenanceSubset: subset, filters,
      origin: { label: title, formula: `${data?.methodology.cohort} ${method}`,
        limitations: subset === 'measured'
          ? [`Numerador: ${amountLabel(data?.measured_cost)}. Denominador: ${formatValue(data?.measured_distance_km, 'km')}.`]
          : [] } })
  }

  function openMileage() {
    onOpenEntity({ entityType: 'mileage-events', title: 'Posses que compõem os quilômetros', filters: query,
      origin: { label: 'Quilometragem do custo de manutenção por km', formula: data?.methodology.mileage,
        limitations: [`Denominador: ${formatValue(data?.measured_distance_km, 'km')}.`,
          'A leitura das posses individuais exige permissão de Posses.'] } })
  }

  return <div className="analytics-costs">
    <form className="analytics-cockpit-filters" onSubmit={apply} aria-label="Filtros de Manutenção">
      <label>De<input type="date" value={draft.date_from} min="1901-01-01" max={maxDate} required onChange={(e) => setDraft((v) => ({ ...v, date_from: e.target.value }))} /></label>
      <label>Até<input type="date" value={draft.date_to} min="1901-01-01" max={maxDate} required onChange={(e) => setDraft((v) => ({ ...v, date_to: e.target.value }))} /></label>
      <label>Tipo de veículo<SearchableSelect ariaLabel="Tipo de veículo em Manutenção" value={draft.vehicle_type}
        options={[{ value: '', label: 'Todos os tipos' }, ...Object.entries(TYPES).map(([value, label]) => ({ value, label }))]}
        onChange={(value) => setDraft((v) => ({ ...v, vehicle_type: value }))} /></label>
      <label>Secretaria<SearchableSelect ariaLabel="Secretaria em Manutenção" value={draft.organization}
        options={[{ value: '', label: 'Todas no meu escopo' }, ...organizations.map((item) => ({ value: item.id, label: item.name }))]}
        onChange={(value) => setDraft((v) => ({ ...v, organization: value }))} /></label>
      <button type="submit" className="app-button">Aplicar filtros</button>
      <button type="button" className="ghost-button" onClick={() => setRevision((v) => v + 1)}>Atualizar</button>
    </form>
    {validation ? <p role="alert">{validation}</p> : null}
    {catalogError ? <p role="status" className="analytics-scope-note">Catálogo de secretarias indisponível. O escopo de acesso segue aplicado.</p> : null}
    <p className="analytics-scope-note">{formatDate(applied.date_from)} a {formatDate(applied.date_to)} · {data?.methodology.cohort}</p>

    <AnalyticsSection title="Manutenções registradas" description="Custo e quantidade por data de início da intervenção." {...state}>
      <div className="analytics-costs-summary">
        <div><span>Custo registrado</span><strong>{amountLabel(data?.cost)}</strong>
          <button type="button" className="analytics-entity-link" onClick={() => openHistory('Custo de manutenção')}>Ver intervenções</button></div>
        <div><span>Custo de manutenção por km válido</span><strong>{formatValue(data?.cost_per_km, 'BRL/km')}</strong>
          <p>{formatValue(data?.measured_distance_km, 'km')} · {data?.measured_vehicles ?? '—'} veículo(s) com km válido</p>
          <button type="button" className="analytics-entity-link" onClick={() => openHistory('Numerador do custo de manutenção por km', 'measured')}>Ver numerador</button>
          <button type="button" className="analytics-entity-link" onClick={openMileage}>Ver posses do denominador</button></div>
        <div><span>Intervenções iniciadas</span><strong>{data?.interventions ?? '—'}</strong>
          <button type="button" className="analytics-entity-link" onClick={() => openHistory('Intervenções iniciadas')}>Ver intervenções</button></div>
      </div>
      {data?.cost.missing_or_invalid ? <p role="status" className="analytics-scope-note">{data.cost.missing_or_invalid} custo(s) ausente(s) ou inválido(s); subtotal conhecido identificado.</p> : null}
      <p className="analytics-scope-note">{data?.methodology.cost} {data?.methodology.mileage}</p>
    </AnalyticsSection>

    <div className="analytics-cockpit-grid">
      <AnalyticsSection title="Duração e abertas" {...state}>
        <dl className="analytics-definition-list">
          <div><dt><button type="button" className="analytics-entity-link" onClick={() => openHistory('Duração das intervenções', 'duration')}>Duração média válida</button></dt>
            <dd>{formatValue(data?.average_duration_hours, 'h')}</dd></div>
          <div><dt>Amostra da duração</dt><dd>{data?.valid_duration_count ?? '—'} encerrada(s) válida(s); {data?.invalid_duration_count ?? '—'} intervalo(s) inválido(s)</dd></div>
          <div><dt><button type="button" className="analytics-entity-link" onClick={() => openHistory('Manutenções abertas', 'open')}>Manutenções abertas</button></dt>
            <dd>{data?.open_interventions ?? '—'}</dd></div>
        </dl>
        <p className="analytics-scope-note">{data?.methodology.duration} {data?.methodology.open}</p>
      </AnalyticsSection>
      <AnalyticsSection title="Repetição quantitativa" {...state}>
        <p><strong>{data?.repeated_vehicles ?? '—'}</strong> veículo(s) com duas ou mais intervenções iniciadas no recorte.</p>
        <button type="button" className="analytics-entity-link" onClick={() => openHistory('Veículos com intervenções repetidas', 'repeated')}>Ver histórico dos veículos</button>
        <p className="analytics-scope-note">{data?.methodology.recurrence}</p>
      </AnalyticsSection>
    </div>

    <AnalyticsSection title="Ranking por veículo" description="Ordenado pelo subtotal conhecido de manutenção; cada veículo abre seu histórico de intervenções." {...state} empty={!data?.vehicles.length}>
      <div className="table-wrap" tabIndex={0}><table className="data-table"><thead><tr><th>Veículo</th><th>Custo registrado</th><th>Intervenções</th><th>Abertas</th><th>Duração média válida</th><th>Custo/km válido</th></tr></thead>
        <tbody>{data?.vehicles.slice(0, shown).map((item) => <tr key={item.vehicle_id}>
          <td><AnalyticsEntityLink entityType="vehicle" entityId={item.vehicle_id} entityName={item.plate}
            onOpen={() => openHistory(`Manutenções de ${item.plate}`, 'all', item.vehicle_id)}>{item.plate}</AnalyticsEntityLink></td>
          <td>{amountLabel(item.cost)}</td><td>{item.interventions}</td><td>{item.open_interventions}</td>
          <td>{formatValue(item.average_duration_hours, 'h')}</td><td>{formatValue(item.cost_per_km, 'BRL/km')}</td>
        </tr>)}</tbody></table></div>
      {shown < (data?.vehicles.length || 0) ? <button type="button" className="ghost-button" onClick={() => setShown((value) => value + 20)}>Mostrar mais veículos</button> : null}
    </AnalyticsSection>
  </div>
}
