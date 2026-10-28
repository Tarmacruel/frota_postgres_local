import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { analyticsAPI } from '../api/analytics'
import { getApiBlobErrorMessage } from '../utils/apiError'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/Modal'
import AdvancedFilters from '../components/analytics/AdvancedFilters'
import EfficiencyChart from '../components/analytics/EfficiencyChart'
import CostPerKmRanking from '../components/analytics/CostPerKmRanking'
import SmartInsightsList from '../components/analytics/SmartInsightsList'
import AnalyticsOverview from '../components/analytics/AnalyticsOverview'
import AnalyticsCosts from '../components/analytics/AnalyticsCosts'
import AnalyticsFuel from '../components/analytics/AnalyticsFuel'
import AnalyticsMaintenance from '../components/analytics/AnalyticsMaintenance'
import AnalyticsUtilization from '../components/analytics/AnalyticsUtilization'
import AnalyticsDrivers from '../components/analytics/AnalyticsDrivers'
import AnalyticsReports from '../components/analytics/AnalyticsReports'
import AnalyticsAlerts from '../components/analytics/AnalyticsAlerts'
import AnalyticsAlertDetail from '../components/analytics/AnalyticsAlertDetail'
import TrendChart from '../components/analytics/TrendChart'
import VehicleDetailsTable from '../components/analytics/VehicleDetailsTable'
import AnalyticsSubnav from '../components/analytics/AnalyticsSubnav'
import { ANALYTICS_SECTIONS } from '../components/analytics/analyticsSections'
import AnalyticsEntityDrawer from '../components/analytics/AnalyticsEntityDrawer'
import useAnalyticsDetailStack from '../components/analytics/useAnalyticsDetailStack'
import useAnalyticsV1 from '../components/analytics/useAnalyticsV1'
import { closedPeriod } from '../components/analytics/analyticsV2Format'

const LEGACY_SOURCES = { fuel: ['efficiency', 'tco'], alerts: ['insights'], costs: ['efficiency', 'tco', 'trend'] }
const NO_LEGACY_SOURCES = []

export default function AdminAnalyticsDashboard() {
  const { organizations, error: catalogError } = useMasterDataCatalog({ organizationsOnly: true })
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get('view')
  const view = ANALYTICS_SECTIONS.some(([key]) => key === requestedView) ? requestedView : 'overview'
  const [filters, setFilters] = useState({ period_days: 30, vehicle_type: '', organization: '' })
  const [refreshTick, setRefreshTick] = useState(0)
  const [legacyCostsOpen, setLegacyCostsOpen] = useState(false)
  const [legacyAlertsOpen, setLegacyAlertsOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportConfig, setExportConfig] = useState({ format: 'xlsx' })
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const detail = useAnalyticsDetailStack()
  const alertQueueFocus = useRef(null)
  const query = useMemo(() => ({ period_days: filters.period_days,
    vehicle_type: filters.vehicle_type || undefined, organization: filters.organization || undefined }), [filters])
  const { resources, loading, retry } = useAnalyticsV1(query, refreshTick,
    Boolean(LEGACY_SOURCES[view]) && (view !== 'costs' || legacyCostsOpen) && (view !== 'alerts' || legacyAlertsOpen), LEGACY_SOURCES[view] || NO_LEGACY_SOURCES)
  const data = (key) => resources[key]?.data || []
  const state = (key) => ({ loading: !resources[key] || resources[key].loading,
    error: resources[key]?.error, onRetry: () => retry(key) })
  const visible = (...keys) => keys.includes(view)
  const openLegacy = (item) => detail.open({ ...item, filters: { ...closedPeriod(filters.period_days),
    vehicle_type: item.entityType === 'driver' ? undefined : filters.vehicle_type || undefined,
    organization: filters.organization || undefined },
    periodNote: item.entityType === 'driver'
      ? 'Detalhe em dias civis encerrados. O ranking anterior usa sua janela própria e não aplica o filtro de tipo de veículo a condutores.'
      : 'Detalhe em dias civis encerrados. O indicador anterior usa sua janela própria.' })

  function changeView(key) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (key === 'overview') next.delete('view')
      else next.set('view', key)
      return next
    })
  }

  function openExport() { setExportError(''); setExportModalOpen(true) }
  async function handleExport() {
    setExporting(true)
    setExportError('')
    try {
      const { data: report } = await analyticsAPI.exportReport({ ...query, export_format: exportConfig.format })
      const url = window.URL.createObjectURL(report)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics-${filters.period_days}d.${exportConfig.format}`
      a.click()
      window.URL.revokeObjectURL(url)
      setExportModalOpen(false)
    } catch (error) { setExportError(await getApiBlobErrorMessage(error, 'Não foi possível exportar o relatório.')) }
    finally { setExporting(false) }
  }

  return (
    <div className="surface-panel operation-page management-page management-page--analytics analytics-foundation">
      <PageHeader title="Análises administrativas" />
      <AnalyticsSubnav activeKey={view} onChange={changeView} />
      <AnalyticsOverview enabled={view === 'overview'} organizations={organizations} catalogError={catalogError} onOpenEntity={detail.open} />
      <AnalyticsCosts enabled={view === 'costs'} organizations={organizations} catalogError={catalogError} onOpenEntity={detail.open} />
      <AnalyticsFuel enabled={view === 'fuel'} organizations={organizations} catalogError={catalogError} onOpenEntity={detail.open} />
      <AnalyticsMaintenance enabled={view === 'maintenance'} organizations={organizations} catalogError={catalogError} onOpenEntity={detail.open} />
      <AnalyticsUtilization enabled={view === 'utilization'} organizations={organizations} catalogError={catalogError} onOpenEntity={detail.open} />
      <AnalyticsDrivers enabled={view === 'drivers'} organizations={organizations} catalogError={catalogError} onOpenEntity={detail.open} />
      <AnalyticsReports enabled={view === 'reports'} organizations={organizations} catalogError={catalogError} />
      <AnalyticsAlerts enabled={view === 'alerts'} organizations={organizations} onOpenEntity={detail.open} returnFocusRef={alertQueueFocus} />
      {view === 'alerts' ? <details className="analytics-costs-legacy" open={legacyAlertsOpen} onToggle={(event) => setLegacyAlertsOpen(event.currentTarget.open)}>
        <summary>Consultar insights anteriores (V1)</summary>
        <p className="analytics-scope-note">Insights calculados, sem estado ou atendimento persistido. Usam janela/fórmulas anteriores e não são os casos da fila.</p>
        <AdvancedFilters filters={filters} organizations={organizations} loading={loading}
          onChange={(name, value) => setFilters((current) => ({ ...current, [name]: value }))}
          onRefresh={() => setRefreshTick((value) => value + 1)} onExport={openExport} />
        <SmartInsightsList insights={data('insights')} onOpenEntity={openLegacy} {...state('insights')} />
      </details> : null}
      {view === 'costs' ? <details className="analytics-costs-legacy" open={legacyCostsOpen} onToggle={(event) => setLegacyCostsOpen(event.currentTarget.open)}>
        <summary>Consultar análises anteriores de custos</summary>
        <p className="analytics-scope-note">Comparação com referência configurada por categoria e tendência anterior de 12 meses. Estes indicadores usam filtros e cálculos próprios da V1; não representam TCO completo nem pesquisa de mercado.</p>
        <AdvancedFilters filters={filters} organizations={organizations} loading={loading}
          onChange={(name, value) => setFilters((current) => ({ ...current, [name]: value }))}
          onRefresh={() => setRefreshTick((value) => value + 1)} onExport={openExport} />
        <div className="analytics-foundation-grid">
          <CostPerKmRanking rows={data('tco')} onOpenEntity={openLegacy} {...state('tco')} />
          <TrendChart rows={data('trend')} {...state('trend')} />
          <VehicleDetailsTable efficiencyRows={data('efficiency').slice(0, 25)} tcoRows={data('tco')}
            onOpenEntity={openLegacy} loading={state('efficiency').loading || state('tco').loading}
            error={resources.efficiency?.error || resources.tco?.error}
            onRetry={() => { if (resources.efficiency?.error) retry('efficiency'); if (resources.tco?.error) retry('tco') }} />
        </div>
      </details> : null}
      {view === 'fuel' ? <AdvancedFilters filters={filters} organizations={organizations} loading={loading}
        onChange={(name, value) => setFilters((current) => ({ ...current, [name]: value }))}
        onRefresh={() => setRefreshTick((value) => value + 1)} onExport={openExport} /> : null}
      {view === 'fuel' ? <p className="analytics-scope-note">Análises anteriores: mantêm filtros e cálculos próprios. A comparação por tipo abaixo usa sua janela e fórmula V1 próprias; abastecimentos registrados não comprovam consumo efetivo. A exportação anterior contém insights V1; use Relatórios para as visões V2.</p> : null}
      <div className="analytics-foundation-grid">
        {visible('fuel') ? <EfficiencyChart rows={data('efficiency')} onOpenEntity={openLegacy} {...state('efficiency')} /> : null}
        {visible('fuel') ? <VehicleDetailsTable efficiencyRows={data('efficiency').slice(0, 25)} tcoRows={data('tco')}
          onOpenEntity={openLegacy} loading={state('efficiency').loading || state('tco').loading}
          error={resources.efficiency?.error || resources.tco?.error}
          onRetry={() => { if (resources.efficiency?.error) retry('efficiency'); if (resources.tco?.error) retry('tco') }} /> : null}
      </div>
      <AnalyticsEntityDrawer detail={detail.current} canGoBack={detail.canGoBack} onOpen={detail.open} onBack={detail.back} onClose={detail.close} returnFocusRef={alertQueueFocus}>
        {detail.current?.entityType === 'alert' ? <AnalyticsAlertDetail key={detail.current.entityId} detail={detail.current} onOpen={detail.open} /> : undefined}
      </AnalyticsEntityDrawer>
      <Modal open={exportModalOpen} title="Exportar insights anteriores" description="Escolha o formato do relatório V1"
        onClose={() => setExportModalOpen(false)} canClose={!exporting}>
        <div className="form-grid analytics-export-form">
          <label>Formato
            <select value={exportConfig.format} disabled={exporting} onChange={(e) => setExportConfig((v) => ({ ...v, format: e.target.value }))}>
              <option value="xlsx">Excel (XLSX)</option><option value="pdf">PDF</option>
            </select>
          </label>
          <p className="analytics-scope-note">Este arquivo contém apenas insights V1 do período e filtros anteriores. Para métricas V2, use a seção Relatórios.</p>
          {exportError ? <p role="alert">{exportError}</p> : null}
          <div className="actions-inline">
            <button type="button" className="ghost-button" disabled={exporting} onClick={() => setExportModalOpen(false)}>Cancelar</button>
            <button type="button" className="app-button" disabled={exporting} onClick={handleExport}>{exporting ? 'Exportando…' : 'Exportar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
