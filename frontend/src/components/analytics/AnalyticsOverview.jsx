import { useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { analyticsV2API } from '../../api/analyticsV2'
import SearchableSelect from '../SearchableSelect'
import VehicleThumbnail from '../ui/VehicleThumbnail'
import AnalyticsSection from './AnalyticsSection'
import AnalyticsKpiCard from './AnalyticsKpiCard'
import AnalyticsEntityLink from './AnalyticsEntityLink'
import useCockpitResource from './useCockpitResource'
import { closedPeriod, deltaText, formatDate, formatValue, numeric } from './analyticsV2Format'

const TYPES = { SEDAN: 'Sedan', HATCH: 'Hatch', SUV: 'SUV', PERUA_SW: 'Perua/SW', PICAPE: 'Picape', VAN: 'Van', MICRO_ONIBUS: 'Micro-ônibus', ONIBUS: 'Ônibus', CAMINHAO: 'Caminhão', MOTOCICLETA: 'Motocicleta', MAQUINA: 'Máquina' }
const COSTS = { fuel: 'Combustível', maintenance: 'Manutenção', fines: 'Multas' }
const STATUS = { ATIVO: 'Ativos', MANUTENCAO: 'Em manutenção', INATIVO: 'Inativos' }
const KPI_KEYS = ['operational_cost', 'operational_cost_per_km', 'distance_km', 'consumption_l_100km']

export default function AnalyticsOverview({ enabled = true, organizations = [], catalogError, onOpenEntity }) {
  const [applied, setApplied] = useState(() => ({ ...closedPeriod(), organization: '', vehicle_type: '' }))
  const [draft, setDraft] = useState(applied)
  const [validation, setValidation] = useState('')
  const [revision, setRevision] = useState(0)
  const query = useMemo(() => ({ ...applied, organization: applied.organization || undefined, vehicle_type: applied.vehicle_type || undefined }), [applied])
  const summary = useCockpitResource(analyticsV2API.summary, query, revision, enabled)
  const attention = useCockpitResource(analyticsV2API.attention, query, revision, enabled)
  const fleet = useCockpitResource(analyticsV2API.fleet, query, revision, enabled)
  const sectionState = ({ loading, error, onRetry }) => ({ loading, error, onRetry })
  const data = summary.data
  const kpis = KPI_KEYS.map((key) => data?.kpis?.find((item) => item.key === key)).filter(Boolean)
  const chart = (data?.monthly || []).map((item) => ({ month: item.month.split('-').reverse().join('/'),
    ...Object.fromEntries(Object.keys(COSTS).map((key) => [key, numeric(item.totals[key].value)])) }))
  const selectedOrg = organizations.find((item) => String(item.id) === String(applied.organization))
  const maxDate = closedPeriod(1).date_to

  function apply(event) {
    event.preventDefault()
    const days = (Date.parse(draft.date_to) - Date.parse(draft.date_from)) / 86400000 + 1
    if (!Number.isFinite(days) || days < 1 || days > 366 || draft.date_to > maxDate || draft.date_from < '1901-01-01') {
      setValidation('Selecione de 1 a 366 dias encerrados, com início anterior ou igual ao fim.')
      return
    }
    setValidation(''); setApplied({ ...draft })
  }
  function clear(key) {
    const next = { ...applied, [key]: '' }
    setApplied(next); setDraft(next)
  }
  function entity(item) { return { entityType: 'vehicle', entityId: item.vehicle_id, title: item.plate } }

  return (
    <div className="analytics-cockpit">
      <form className="analytics-cockpit-filters" onSubmit={apply} aria-label="Filtros da Visão Geral">
        <label>De<input type="date" value={draft.date_from} min="1901-01-01" max={maxDate} required onChange={(e) => setDraft((v) => ({ ...v, date_from: e.target.value }))} /></label>
        <label>Até<input type="date" value={draft.date_to} min="1901-01-01" max={maxDate} required onChange={(e) => setDraft((v) => ({ ...v, date_to: e.target.value }))} /></label>
        <label>Tipo de veículo<SearchableSelect ariaLabel="Tipo de veículo da Visão Geral" value={draft.vehicle_type}
          options={[{ value: '', label: 'Todos os tipos' }, ...Object.entries(TYPES).map(([value, label]) => ({ value, label }))]}
          onChange={(value) => setDraft((v) => ({ ...v, vehicle_type: value }))} /></label>
        <label>Secretaria<SearchableSelect ariaLabel="Secretaria da Visão Geral" value={draft.organization}
          options={[{ value: '', label: 'Todas no meu escopo' }, ...organizations.map((org) => ({ value: org.id, label: org.name }))]}
          onChange={(value) => setDraft((v) => ({ ...v, organization: value }))} /></label>
        <button type="submit" className="app-button">Aplicar filtros</button>
        <button type="button" className="ghost-button" onClick={() => setRevision((value) => value + 1)}>Atualizar</button>
      </form>
      {validation ? <p role="alert">{validation}</p> : null}
      {catalogError ? <p className="analytics-scope-note" role="status">Catálogo de secretarias indisponível. A consulta continua respeitando seu escopo de acesso.</p> : null}
      <div className="analytics-cockpit-context" aria-label="Recorte aplicado">
        <span>{formatDate(applied.date_from)} a {formatDate(applied.date_to)} · dias encerrados</span>
        {data ? <span>Comparação: {formatDate(data.previous_period.date_from)} a {formatDate(data.previous_period.date_to)}</span> : null}
        {applied.vehicle_type ? <button className="analytics-filter-chip" onClick={() => clear('vehicle_type')}>Tipo: {TYPES[applied.vehicle_type]} ×</button> : null}
        {applied.organization ? <button className="analytics-filter-chip" onClick={() => clear('organization')}>Secretaria: {selectedOrg?.name || 'Selecionada'} ×</button> : null}
      </div>

      <AnalyticsSection title="Indicadores do período" {...sectionState(summary)}>
        <div className="analytics-kpi-grid">
          {kpis.map((item) => <div key={item.key}>
            <AnalyticsKpiCard label={item.label} value={formatValue(item.value, item.unit)}
              note={deltaText(item.comparison, item.unit)} tone="status-info" />
            <details className="analytics-metric-help"><summary>{item.quality === 'partial' ? 'Cobertura parcial · fórmula' : 'Como é calculado'}</summary>
              <p>{item.calculation.formula}</p>{item.calculation.limitations.map((text) => <p key={text}>{text}</p>)}
            </details>
          </div>)}
        </div>
      </AnalyticsSection>

      <div className="analytics-cockpit-grid">
        <AnalyticsSection title="O que mudou?" description="Variação dos valores registrados frente ao período anterior." {...sectionState(summary)}>
          <ul className="analytics-change-list">{Object.entries(COSTS).map(([key, label]) => {
            const current = numeric(data?.current[key].value), previous = numeric(data?.previous[key].value)
            const delta = current === null || previous === null ? null : current - previous
            return <li key={key}><span>{label}</span><strong>{deltaText({ delta, delta_percent: previous ? delta / previous * 100 : null }, 'BRL')}</strong></li>
          })}</ul>
          <p className="analytics-scope-note">Aumento de custo não determina sua causa. Multas incluem todos os status; custos não comprovam pagamento.</p>
        </AnalyticsSection>

        <AnalyticsSection title="Veículos que exigem atenção" description={attention.data?.basis} {...sectionState(attention)}
          empty={attention.data?.items.length === 0} emptyMessage="Sem aumento de custo ou anomalias registradas neste recorte.">
          <ol className="analytics-attention-list">{attention.data?.items.map((item) => <li key={item.vehicle_id}>
            <VehicleThumbnail vehicleType={item.vehicle_type} plate={item.plate} />
            <div><AnalyticsEntityLink entityType="vehicle" entityId={item.vehicle_id} entityName={item.plate} onOpen={onOpenEntity}>{item.plate}</AnalyticsEntityLink>
              <p>{item.anomalies ? `${item.anomalies} anomalia(s) registrada(s) · ` : ''}{deltaText(item.comparison, 'BRL')}</p></div>
          </li>)}</ol>
          {attention.data ? <p className="analytics-scope-note">Exibindo {attention.data.items.length} de {attention.data.total_attention_vehicles} veículos no critério.</p> : null}
        </AnalyticsSection>

        <AnalyticsSection title="Evolução de custos" description="Meses civis dentro do intervalo aplicado; lacunas de valor não viram zero." {...sectionState(summary)} empty={data?.quality.records === 0}>
          <div className="analytics-chart"><ResponsiveContainer><LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis width={65} />
            <Tooltip formatter={(value) => formatValue(value, 'BRL')} /><Legend />
            <Line dataKey="fuel" name="Combustível" stroke="var(--ui-info)" connectNulls={false} isAnimationActive={false} />
            <Line dataKey="maintenance" name="Manutenção" stroke="var(--ui-warning)" connectNulls={false} isAnimationActive={false} />
            <Line dataKey="fines" name="Multas" stroke="var(--ui-danger)" connectNulls={false} isAnimationActive={false} />
          </LineChart></ResponsiveContainer></div>
        </AnalyticsSection>

        <AnalyticsSection title="Distribuição de custos" {...sectionState(summary)}>
          <dl className="analytics-definition-list">{Object.entries(COSTS).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatValue(data?.current[key].value, 'BRL')}</dd></div>)}</dl>
          <p className="analytics-scope-note">Sinistros estimados, fora do total: <strong>{formatValue(data?.current.claim_estimate.value, 'BRL')}</strong></p>
          {data?.current.operational_cost.missing_or_invalid ? <p role="status">Há valores ausentes ou inválidos. Subtotal conhecido: {formatValue(data.current.operational_cost.known_value, 'BRL')}.</p> : null}
        </AnalyticsSection>

        <AnalyticsSection title="Situação da frota" description="Status cadastral atual, independente das datas. Não representa disponibilidade operacional." {...sectionState(fleet)} empty={fleet.data?.total === 0}>
          <dl className="analytics-definition-list">{Object.entries(STATUS).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatValue(fleet.data?.counts[key])}</dd></div>)}</dl>
          <p className="analytics-scope-note">{fleet.data?.total} veículos no recorte cadastral. Por secretaria, considera a lotação operadora atual.</p>
        </AnalyticsSection>

        <AnalyticsSection title="Resumo de alertas" {...sectionState(attention)}>
          <p><strong>{formatValue(attention.data?.anomaly_records)}</strong> anomalias registradas em <strong>{formatValue(attention.data?.anomaly_vehicles)}</strong> veículos.</p>
          <p className="analytics-scope-note">{attention.data?.alert_basis}</p>
          <div className="analytics-alert-links">{attention.data?.items.filter((item) => item.anomalies > 0).map((item) => <button key={item.vehicle_id} className="analytics-entity-link" onClick={() => onOpenEntity(entity(item))}>{item.plate} · {item.anomalies} registro(s)</button>)}</div>
          {attention.data?.anomaly_records === 0 ? <p>Não há flags de consumo registradas no recorte. Isso não comprova ausência de problemas.</p> : null}
        </AnalyticsSection>
      </div>

      <AnalyticsSection title="Qualidade dos dados" description="Cobertura observada nas fontes; não é um score de qualidade." {...sectionState(summary)}>
        <dl className="analytics-quality-grid">
          <div><dt>Valores ausentes/inválidos</dt><dd>{formatValue(data?.quality.operational_cost_missing_or_invalid)}</dd></div>
          <div><dt>Eventos sem condutor</dt><dd>{formatValue(data?.quality.events_without_driver)}</dd></div>
          <div><dt>Posses válidas para km</dt><dd>{formatValue(data?.mileage.valid_records)}</dd></div>
          <div><dt>Posses excluídas do km</dt><dd>{formatValue(data?.mileage.excluded_records)}</dd></div>
        </dl>
        <p className="analytics-scope-note">Km de posses encerradas, válidas e inteiramente no período. {formatValue(data?.mileage.crossing_records)} cruzam a janela; {formatValue(data?.mileage.overlapping_records)} têm sobreposição. Motivos podem se sobrepor. Litros abastecidos não comprovam consumo efetivo.</p>
      </AnalyticsSection>
    </div>
  )
}
