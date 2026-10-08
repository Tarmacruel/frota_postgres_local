import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { analyticsAPI } from '../api/analytics'
import { getApiErrorMessage } from '../utils/apiError'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/Modal'
import AdvancedFilters from '../components/analytics/AdvancedFilters'
import EfficiencyChart from '../components/analytics/EfficiencyChart'
import CostPerKmRanking from '../components/analytics/CostPerKmRanking'
import DriverRiskTable from '../components/analytics/DriverRiskTable'
import SmartInsightsList from '../components/analytics/SmartInsightsList'
import AnalyticsOverview from '../components/analytics/AnalyticsOverview'
import TrendChart from '../components/analytics/TrendChart'
import VehicleDetailsTable from '../components/analytics/VehicleDetailsTable'
import AnalyticsSubnav from '../components/analytics/AnalyticsSubnav'
import { ANALYTICS_SECTIONS } from '../components/analytics/analyticsSections'
import AnalyticsSection from '../components/analytics/AnalyticsSection'
import AnalyticsEntityDrawer from '../components/analytics/AnalyticsEntityDrawer'
import useAnalyticsDetailStack from '../components/analytics/useAnalyticsDetailStack'
import useAnalyticsV1 from '../components/analytics/useAnalyticsV1'

export default function AdminAnalyticsDashboard() {
  const { organizations, error: catalogError } = useMasterDataCatalog()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get('view')
  const view = ANALYTICS_SECTIONS.some(([key]) => key === requestedView) ? requestedView : 'overview'
  const [filters, setFilters] = useState({ period_days: 30, vehicle_type: '', organization: '' })
  const [refreshTick, setRefreshTick] = useState(0)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportConfig, setExportConfig] = useState({ format: 'xlsx', includeCharts: true, includeDetails: true })
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const detail = useAnalyticsDetailStack()
  const query = useMemo(() => ({ period_days: filters.period_days,
    vehicle_type: filters.vehicle_type || undefined, organization: filters.organization || undefined }), [filters])
  const { resources, loading, retry } = useAnalyticsV1(query, refreshTick, view !== 'overview')
  const data = (key) => resources[key]?.data || []
  const state = (key) => ({ loading: !resources[key] || resources[key].loading,
    error: resources[key]?.error, onRetry: () => retry(key) })
  const visible = (...keys) => keys.includes(view)

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
      const { data: report } = await analyticsAPI.exportReport({ ...query,
        export_format: exportConfig.format, include_charts: exportConfig.includeCharts,
        include_details: exportConfig.includeDetails })
      const url = window.URL.createObjectURL(report)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics-${filters.period_days}d.${exportConfig.format}`
      a.click()
      window.URL.revokeObjectURL(url)
      setExportModalOpen(false)
    } catch (error) { setExportError(getApiErrorMessage(error, 'Não foi possível exportar o relatório.')) }
    finally { setExporting(false) }
  }

  return (
    <div className="surface-panel operation-page management-page management-page--analytics analytics-foundation">
      <PageHeader title="Análises administrativas" description="Consulte os indicadores da frota e explore as análises por assunto." />
      <AnalyticsSubnav activeKey={view} onChange={changeView} />
      <div hidden={view !== 'overview'}><AnalyticsOverview enabled={view === 'overview'} organizations={organizations} catalogError={catalogError} onOpenEntity={detail.open} /></div>
      {view !== 'overview' ? <AdvancedFilters filters={filters} organizations={organizations} loading={loading}
        onChange={(name, value) => setFilters((current) => ({ ...current, [name]: value }))}
        onRefresh={() => setRefreshTick((value) => value + 1)} onExport={openExport} /> : null}
      {view !== 'overview' ? <p className="analytics-scope-note">Análises anteriores: mantêm filtros e cálculos próprios. A tendência considera 12 meses; o relatório existente não exporta o cockpit da Visão Geral.</p> : null}
      <div className="analytics-foundation-grid">
        {visible('fuel') ? <EfficiencyChart rows={data('efficiency')} {...state('efficiency')} /> : null}
        {visible('costs') ? <CostPerKmRanking rows={data('tco')} {...state('tco')} /> : null}
        {visible('costs') ? <TrendChart rows={data('trend')} {...state('trend')} /> : null}
        {visible('alerts') ? <SmartInsightsList insights={data('insights')} onOpenEntity={detail.open} {...state('insights')} /> : null}
        {visible('drivers') ? <DriverRiskTable rows={data('driverRisk')} onOpenEntity={detail.open} {...state('driverRisk')} /> : null}
        {visible('fuel', 'costs') ? <VehicleDetailsTable efficiencyRows={data('efficiency').slice(0, 25)} tcoRows={data('tco')}
          onOpenEntity={detail.open} loading={state('efficiency').loading || state('tco').loading}
          error={resources.efficiency?.error || resources.tco?.error}
          onRetry={() => { if (resources.efficiency?.error) retry('efficiency'); if (resources.tco?.error) retry('tco') }} /> : null}
      </div>
      {view === 'maintenance' || view === 'utilization' ? <AnalyticsSection
        title={view === 'maintenance' ? 'Manutenção' : 'Utilização'}>
        <div className="analytics-state">
          <h3>Análise específica ainda não disponível</h3>
          <p>{view === 'maintenance' ? 'Os custos de manutenção já registrados podem ser consultados na evolução de custos.' : 'Consulte os indicadores existentes na Visão Geral. Não há uma análise de utilização disponível neste painel.'}</p>
          <button type="button" className="ghost-button" onClick={() => changeView(view === 'maintenance' ? 'costs' : 'overview')}>
            {view === 'maintenance' ? 'Consultar custos' : 'Ir para Visão Geral'}
          </button>
        </div>
      </AnalyticsSection> : null}
      {view === 'reports' ? <AnalyticsSection title="Relatórios" description="Exporte a consulta nos formatos já disponíveis.">
        <p>O relatório mantém o conteúdo da exportação atual. A seção selecionada não altera seu conteúdo.</p>
        <button type="button" className="app-button" onClick={openExport}>Preparar exportação</button>
      </AnalyticsSection> : null}
      <AnalyticsEntityDrawer detail={detail.current} canGoBack={detail.canGoBack} onBack={detail.back} onClose={detail.close} />
      <Modal open={exportModalOpen} title="Exportar relatório" description="Escolha o formato e os itens do relatório gerado"
        onClose={() => setExportModalOpen(false)} canClose={!exporting}>
        <div className="form-grid analytics-export-form">
          <label>Formato
            <select value={exportConfig.format} disabled={exporting} onChange={(e) => setExportConfig((v) => ({ ...v, format: e.target.value }))}>
              <option value="xlsx">Excel (XLSX)</option><option value="pdf">PDF</option>
            </select>
          </label>
          <label className="checkbox-field"><input type="checkbox" disabled={exporting} checked={exportConfig.includeCharts}
            onChange={(e) => setExportConfig((v) => ({ ...v, includeCharts: e.target.checked }))} />Incluir gráficos</label>
          <label className="checkbox-field"><input type="checkbox" disabled={exporting} checked={exportConfig.includeDetails}
            onChange={(e) => setExportConfig((v) => ({ ...v, includeDetails: e.target.checked }))} />Incluir dados detalhados</label>
          <p className="analytics-scope-note">A exportação atual usa um conteúdo fixo: as opções de gráficos e detalhamento ainda não alteram o arquivo gerado.</p>
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
