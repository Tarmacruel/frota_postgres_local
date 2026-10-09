import { useEffect, useRef, useState } from 'react'
import api from '../../api/client'
import { analyticsV2API } from '../../api/analyticsV2'
import { getApiErrorMessage } from '../../utils/apiError'
import Modal from '../Modal'
import AnalyticsEntityLink from './AnalyticsEntityLink'
import { formatDate, formatValue } from './analyticsV2Format'

const SOURCES = {
  fuel_supply: { label: 'Abastecimento', path: 'fuel-supplies' },
  maintenance: { label: 'Manutenção', path: 'maintenance' },
  fine: { label: 'Multa', path: 'fines' },
  claim: { label: 'Sinistro (estimativa)', path: 'claims' },
}

function recordDate(value) {
  if (!value) return value
  if (String(value).length === 10) return formatDate(value)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Bahia', dateStyle: 'short', timeStyle: 'short',
  }).format(date)
}

function RecordDetail({ detail, record }) {
  const fields = detail.source === 'fuel_supply'
    ? [['Data', recordDate(record.supplied_at)], ['Hodômetro', formatValue(record.odometer_km, 'km')],
      ['Litros', formatValue(record.liters, 'L')], ['Valor registrado', formatValue(record.total_amount, 'BRL')],
      ['Combustível', record.fuel_type], ['Posto', record.fuel_station_name || record.fuel_station],
      ['Razão de intervalo registrada', formatValue(record.consumption_km_l, 'km/L')],
      ['Flag operacional de consumo', record.is_consumption_anomaly ? 'Sim' : 'Não'], ['Detalhe da flag', record.anomaly_details]]
    : detail.source === 'maintenance'
      ? [['Início', recordDate(record.start_date)], ['Fim', recordDate(record.end_date)], ['Custo registrado', formatValue(record.total_cost, 'BRL')], ['Descrição', record.service_description]]
      : detail.source === 'fine'
        ? [['Data da infração', recordDate(record.infraction_date)], ['Valor registrado', formatValue(record.amount, 'BRL')], ['Status', record.status], ['Descrição', record.description]]
        : [['Data da ocorrência', recordDate(record.data_ocorrencia)], ['Estimativa', formatValue(record.valor_estimado, 'BRL')], ['Status', record.status], ['Descrição', record.descricao]]
  return <>
    <p className="analytics-context-label">{SOURCES[detail.source]?.label} · consulta ao registro de domínio</p>
    <dl className="analytics-detail-facts">{fields.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) =>
      <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl>
    {detail.source === 'fuel_supply' && record.receipt_url ? <p><a className="analytics-entity-link" href={record.receipt_url} target="_blank" rel="noreferrer">Abrir comprovante no fluxo original</a></p> : null}
    <p className="analytics-scope-note">Consulta somente leitura. Alterações permanecem no fluxo original da área.</p>
  </>
}

function EntityContent({ detail, result, onOpen, onLoadMore, moreLoading, moreError }) {
  const t = result.totals
  return <>
    <p className="analytics-context-label">{detail.entityType === 'driver' ? 'Condutor' : 'Veículo'} · {result.subtitle || 'registros do período'}</p>
    <p className="analytics-scope-note">{formatDate(result.period.date_from)} a {formatDate(result.period.date_to)} · {result.methodology}</p>
    <dl className="analytics-detail-facts">
      <div><dt>Custo operacional registrado</dt><dd>{formatValue(t.operational_cost.value, 'BRL')}</dd></div>
      <div><dt>Combustível</dt><dd>{formatValue(t.fuel.value, 'BRL')}</dd></div>
      <div><dt>Manutenção</dt><dd>{formatValue(t.maintenance.value, 'BRL')}</dd></div>
      <div><dt>Multas</dt><dd>{formatValue(t.fines.value, 'BRL')}</dd></div>
      <div><dt>Sinistros estimados, fora do total</dt><dd>{formatValue(t.claim_estimate.value, 'BRL')}</dd></div>
      {result.risk_score !== null ? <div><dt>Pontuação de risco</dt><dd>{result.risk_score}</dd></div> : null}
    </dl>
    <h4>Registros do período</h4>
    <p className="analytics-scope-note">{result.total_events
      ? `Exibindo ${result.events.length} de ${result.total_events} registro(s) acessíveis. Selecione um para consultar o detalhe original.`
      : 'Não há registros de origem acessíveis neste recorte. O indicador anterior pode usar uma janela ou fontes diferentes.'}</p>
    <ol className="analytics-detail-timeline">{result.events.map((event) => <li key={`${event.source}-${event.id}`}>
      <button type="button" className="analytics-entity-link" onClick={() => onOpen({ entityType: 'record', entityId: event.id,
        source: event.source, title: `${SOURCES[event.source]?.label} · ${formatDate(event.date)}`,
        filters: detail.filters, origin: detail.origin, periodNote: detail.periodNote })}>
        <strong>{SOURCES[event.source]?.label}</strong> · {formatDate(event.date)} · {event.amount === null ? 'Valor indisponível' : formatValue(event.amount, 'BRL')}
        {event.anomaly ? ' · anomalia registrada' : ''}
      </button>
      <div className="analytics-detail-related">
        {detail.entityType === 'driver' ? <AnalyticsEntityLink entityType="vehicle" entityId={event.vehicle_id} entityName={event.plate}
          onOpen={(item) => onOpen({ ...item, filters: detail.filters })}>{event.plate}</AnalyticsEntityLink> : null}
        {detail.entityType === 'vehicle' && event.driver_id ? <AnalyticsEntityLink entityType="driver" entityId={event.driver_id} entityName={event.driver_name || 'Condutor'}
          onOpen={(item) => onOpen({ ...item, filters: detail.filters })}>{event.driver_name || 'Condutor'}</AnalyticsEntityLink> : null}
        {event.status ? <span>{event.status}</span> : null}
      </div>
    </li>)}</ol>
    {result.events.length < result.total_events ? <button type="button" className="ghost-button" disabled={moreLoading} onClick={onLoadMore}>
      {moreLoading ? 'Carregando…' : 'Carregar mais registros'}
    </button> : null}
    {moreError ? <p role="alert">{moreError}</p> : null}
  </>
}

function CostEventsContent({ detail, result, onOpen, onLoadMore, moreLoading, moreError }) {
  return <>
    <p className="analytics-scope-note">{formatDate(detail.filters.date_from)} a {formatDate(detail.filters.date_to)} · {result.total_events} registro(s) de origem acessível(is). Os totais podem conter registros cuja leitura individual depende de outra permissão.</p>
    <ol className="analytics-detail-timeline">{result.events.map((event) => <li key={`${event.source}-${event.id}`}>
      <button type="button" className="analytics-entity-link" onClick={() => onOpen({ entityType: 'record', entityId: event.id,
        source: event.source, title: `${SOURCES[event.source]?.label} · ${formatDate(event.date)}`,
        filters: detail.filters, origin: detail.origin })}>
        <strong>{SOURCES[event.source]?.label}</strong> · {formatDate(event.date)} · {event.amount === null ? 'Valor indisponível' : formatValue(event.amount, 'BRL')}
      </button>
      <div className="analytics-detail-related"><AnalyticsEntityLink entityType="vehicle" entityId={event.vehicle_id} entityName={event.plate}
        onOpen={(item) => onOpen({ ...item, filters: detail.filters, origin: detail.origin })}>{event.plate}</AnalyticsEntityLink>
        {event.status ? <span>{event.status}</span> : null}</div>
    </li>)}</ol>
    {result.events.length < result.total_events ? <button type="button" className="ghost-button" disabled={moreLoading} onClick={onLoadMore}>
      {moreLoading ? 'Carregando…' : 'Carregar mais registros'}</button> : null}
    {moreError ? <p role="alert">{moreError}</p> : null}
  </>
}

function MileageEventsContent({ detail, result, onOpen, onLoadMore, moreLoading, moreError }) {
  return <>
    <p className="analytics-scope-note">{formatDate(detail.filters.date_from)} a {formatDate(detail.filters.date_to)} · {result.total_events} posse(s) válida(s) · {formatValue(result.total_distance_km, 'km')}. Apenas posses encerradas inteiramente no período, com leituras válidas e sem sobreposição.</p>
    <ol className="analytics-detail-timeline">{result.events.map((event) => <li key={event.id}>
      <strong>Posse nº {event.public_number}</strong> · {recordDate(event.start_date)} a {recordDate(event.end_date)} · {formatValue(event.distance_km, 'km')}
      <div className="analytics-detail-related">
        <AnalyticsEntityLink entityType="vehicle" entityId={event.vehicle_id} entityName={event.plate}
          onOpen={(item) => onOpen({ ...item, filters: detail.filters, origin: detail.origin })}>{event.plate}</AnalyticsEntityLink>
        <span>Hodômetro: {formatValue(event.start_odometer_km, 'km')} → {formatValue(event.end_odometer_km, 'km')}</span>
      </div>
    </li>)}</ol>
    {result.events.length < result.total_events ? <button type="button" className="ghost-button" disabled={moreLoading} onClick={onLoadMore}>
      {moreLoading ? 'Carregando…' : 'Carregar mais registros'}</button> : null}
    {moreError ? <p role="alert">{moreError}</p> : null}
  </>
}

function MaintenanceEventsContent({ detail, result, onOpen, onLoadMore, moreLoading, moreError }) {
  return <>
    <p className="analytics-scope-note">{formatDate(detail.filters.date_from)} a {formatDate(detail.filters.date_to)} · {result.total_events} intervenção(ões) no recorte. Início no período; situação aberta conforme cadastro atual.</p>
    <ol className="analytics-detail-timeline">{result.events.map((event) => <li key={event.id}>
      <button type="button" className="analytics-entity-link" onClick={() => onOpen({ entityType: 'record', entityId: event.id,
        source: 'maintenance', title: `Manutenção · ${recordDate(event.start_date)}`,
        filters: detail.filters, origin: detail.origin })}>
        <strong>Manutenção</strong> · {recordDate(event.start_date)} · {event.cost === null ? 'Custo indisponível' : formatValue(event.cost, 'BRL')}
      </button>
      <div className="analytics-detail-related">
        <AnalyticsEntityLink entityType="vehicle" entityId={event.vehicle_id} entityName={event.plate}
          onOpen={(item) => onOpen({ ...item, filters: detail.filters, origin: detail.origin })}>{event.plate}</AnalyticsEntityLink>
        <span>{event.end_date ? `Encerrada em ${recordDate(event.end_date)}` : 'Aberta'}</span>
        {event.duration_hours !== null ? <span>Duração: {formatValue(event.duration_hours, 'h')}</span> : null}
      </div>
    </li>)}</ol>
    {result.events.length < result.total_events ? <button type="button" className="ghost-button" disabled={moreLoading} onClick={onLoadMore}>
      {moreLoading ? 'Carregando…' : 'Carregar mais registros'}</button> : null}
    {moreError ? <p role="alert">{moreError}</p> : null}
  </>
}

function UtilizationEventsContent({ detail, result, onOpen, onLoadMore, moreLoading, moreError }) {
  return <>
    <p className="analytics-scope-note">{detail.utilizationMode === 'history' ? `Posses observáveis até ${formatDate(detail.filters.date_to)}`
      : `${formatDate(detail.filters.date_from)} a ${formatDate(detail.filters.date_to)}`} · {result.total_events} registro(s) de posse acessível(is). Início/fim de posse não mede deslocamento contínuo.</p>
    <ol className="analytics-detail-timeline">{result.events.map((event) => <li key={event.id}>
      <button type="button" className="analytics-entity-link" onClick={() => onOpen({ entityType: 'possession-record', entityId: event.id,
        title: `Posse nº ${event.public_number}`, record: event, filters: detail.filters, origin: detail.origin })}>
        <strong>Posse nº {event.public_number}</strong> · {recordDate(event.start_date)} {event.end_date ? `a ${recordDate(event.end_date)}` : '· sem fim registrado'}
        {event.distance_km !== null ? ` · ${formatValue(event.distance_km, 'km')} medidos` : ''}
      </button>
      <div className="analytics-detail-related">
        <AnalyticsEntityLink entityType="vehicle" entityId={event.vehicle_id} entityName={event.plate}
          onOpen={(item) => onOpen({ ...item, filters: detail.filters, origin: detail.origin })}>{event.plate}</AnalyticsEntityLink>
        {event.duration_hours !== null ? <span>Duração válida: {formatValue(event.duration_hours, 'h')}</span> : null}
        <span>{event.start_in_period ? 'Iniciada no recorte' : 'Início anterior ao recorte'}</span>
        {event.end_in_period ? <span>Encerrada no recorte</span> : null}
      </div>
    </li>)}</ol>
    {result.events.length < result.total_events ? <button type="button" className="ghost-button" disabled={moreLoading} onClick={onLoadMore}>
      {moreLoading ? 'Carregando…' : 'Carregar mais registros'}</button> : null}
    {moreError ? <p role="alert">{moreError}</p> : null}
  </>
}

function PossessionRecordContent({ record }) {
  const facts = [['Início', recordDate(record.start_date)], ['Fim', record.end_date ? recordDate(record.end_date) : 'Sem fim registrado'],
    ['Hodômetro inicial', formatValue(record.start_odometer_km, 'km')],
    ['Hodômetro final', formatValue(record.end_odometer_km, 'km')],
    ['Km válido neste recorte', formatValue(record.distance_km, 'km')],
    ['Duração válida neste recorte', formatValue(record.duration_hours, 'h')]]
  return <>
    <p className="analytics-context-label">Posse nº {record.public_number} · registro de origem consultado na análise</p>
    <dl className="analytics-detail-facts">{facts.map(([label, value]) =>
      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="analytics-scope-note">Leitura somente de dados já registrados. Km e duração só entram nas métricas quando atendem às regras do período.</p>
  </>
}

export default function AnalyticsEntityDrawer({ detail, canGoBack, onOpen, onBack, onClose, children }) {
  const contentRef = useRef(null)
  const [resource, setResource] = useState({ data: null, loading: false, error: '' })
  const [retry, setRetry] = useState(0)
  const [moreLoading, setMoreLoading] = useState(false)
  const [moreError, setMoreError] = useState('')
  const key = detail ? `${detail.entityType}/${detail.source || ''}/${detail.costSource || ''}/${detail.organizationBucket || ''}/${detail.stationKey || ''}/${detail.maintenanceSubset || ''}/${detail.utilizationMode || ''}/${detail.measuredOnly || false}/${detail.entityId}/${JSON.stringify(detail.filters)}` : ''
  useEffect(() => { if (detail) contentRef.current?.focus() }, [detail])
  useEffect(() => {
    if (!detail?.filters || children) return undefined
    const controller = new AbortController()
    let active = true
    setResource({ data: null, loading: true, error: '', key })
    setMoreError('')
    const request = detail.entityType === 'possession-record'
      ? Promise.resolve({ data: detail.record })
      : detail.entityType === 'utilization-events'
      ? analyticsV2API.utilizationEvents({ ...detail.filters, mode: detail.utilizationMode }, controller.signal)
      : detail.entityType === 'maintenance-events'
      ? analyticsV2API.maintenanceEvents({ ...detail.filters, subset: detail.maintenanceSubset }, controller.signal)
      : detail.entityType === 'mileage-events'
      ? analyticsV2API.mileageEvents(detail.filters, controller.signal)
      : detail.entityType === 'fuel-events'
      ? analyticsV2API.fuelEvents({ ...detail.filters, station: detail.stationKey }, controller.signal)
      : detail.entityType === 'costs'
      ? analyticsV2API.costEvents({ ...detail.filters, source: detail.costSource,
        organization_bucket: detail.organizationBucket, measured_only: detail.measuredOnly || undefined }, controller.signal)
      : detail.entityType === 'record'
      ? api.get(`/${SOURCES[detail.source]?.path}/${detail.entityId}`, { signal: controller.signal })
      : analyticsV2API.entity(detail.entityType, detail.entityId, detail.filters, controller.signal)
    request.then(({ data }) => { if (active) setResource({ data, loading: false, error: '', key }) })
      .catch((error) => { if (active) setResource({ data: null, loading: false, error: getApiErrorMessage(error, 'Não foi possível consultar o detalhe.'), key }) })
    return () => { active = false; controller.abort() }
  }, [detail, key, retry, children])
  const current = resource.key === key ? resource : { data: null, loading: Boolean(detail), error: '' }
  async function loadMore() {
    if (moreLoading || !current.data || !detail) return
    setMoreLoading(true); setMoreError('')
    try {
      const { data } = detail.entityType === 'utilization-events'
        ? await analyticsV2API.utilizationEvents({ ...detail.filters, mode: detail.utilizationMode,
          offset: current.data.events.length })
        : detail.entityType === 'maintenance-events'
        ? await analyticsV2API.maintenanceEvents({ ...detail.filters, subset: detail.maintenanceSubset,
          offset: current.data.events.length })
        : detail.entityType === 'mileage-events'
        ? await analyticsV2API.mileageEvents({ ...detail.filters, offset: current.data.events.length })
        : detail.entityType === 'fuel-events'
        ? await analyticsV2API.fuelEvents({ ...detail.filters, station: detail.stationKey,
          offset: current.data.events.length })
        : detail.entityType === 'costs'
        ? await analyticsV2API.costEvents({ ...detail.filters, source: detail.costSource,
          organization_bucket: detail.organizationBucket, measured_only: detail.measuredOnly || undefined,
          offset: current.data.events.length })
        : await analyticsV2API.entity(detail.entityType, detail.entityId,
          { ...detail.filters, offset: current.data.events.length })
      setResource((existing) => existing.key === key ? { ...existing,
        data: { ...existing.data, events: [...existing.data.events, ...data.events] } } : existing)
    } catch (error) { setMoreError(getApiErrorMessage(error, 'Não foi possível carregar mais registros.')) }
    finally { setMoreLoading(false) }
  }
  return (
    <Modal open={Boolean(detail)} title={(detail?.entityType !== 'record' && current.data?.title) || detail?.title || 'Detalhamento analítico'}
      description="Contexto da seleção" onClose={onClose} onEscape={canGoBack ? onBack : onClose}
      className="analytics-drawer" backdropClassName="analytics-drawer-backdrop" initialFocusRef={contentRef}>
      <div className="analytics-drawer__content" ref={contentRef} tabIndex={-1}>
        {canGoBack ? <button type="button" className="ghost-button" onClick={onBack}>← Voltar</button> : null}
        {detail?.periodNote ? <p className="analytics-scope-note">{detail.periodNote}</p> : null}
        {detail?.origin ? <section className="analytics-detail-origin" aria-label="Como foi calculado?">
          <h4>Como foi calculado?</h4><strong>{detail.origin.label}</strong>
          {detail.origin.formula ? <p>{detail.origin.formula}</p> : null}
          {detail.origin.limitations?.map((text) => <p key={text}>{text}</p>)}
        </section> : null}
        {children || (current.loading ? <p role="status">Carregando detalhamento…</p>
          : current.error ? <div role="alert"><p>{current.error}</p><button type="button" className="ghost-button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></div>
            : current.data ? (detail.entityType === 'record' ? <RecordDetail detail={detail} record={current.data} />
              : detail.entityType === 'possession-record' ? <PossessionRecordContent record={current.data} />
              : detail.entityType === 'utilization-events' ? <UtilizationEventsContent detail={detail} result={current.data} onOpen={onOpen} onLoadMore={loadMore}
                moreLoading={moreLoading} moreError={moreError} />
              : detail.entityType === 'maintenance-events' ? <MaintenanceEventsContent detail={detail} result={current.data} onOpen={onOpen} onLoadMore={loadMore}
                moreLoading={moreLoading} moreError={moreError} />
              : detail.entityType === 'mileage-events' ? <MileageEventsContent detail={detail} result={current.data} onOpen={onOpen} onLoadMore={loadMore}
                moreLoading={moreLoading} moreError={moreError} />
              : detail.entityType === 'costs' || detail.entityType === 'fuel-events' ? <CostEventsContent detail={detail} result={current.data} onOpen={onOpen} onLoadMore={loadMore}
                moreLoading={moreLoading} moreError={moreError} />
              : <EntityContent detail={detail} result={current.data} onOpen={onOpen} onLoadMore={loadMore}
                moreLoading={moreLoading} moreError={moreError} />)
              : <p>Selecione uma entidade para consultar os registros do período.</p>)}
      </div>
    </Modal>
  )
}
