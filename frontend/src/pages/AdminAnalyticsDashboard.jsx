import { useEffect, useMemo, useState } from 'react'
import { analyticsAPI } from '../api/analytics'
import { getApiErrorMessage } from '../utils/apiError'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import Modal from '../components/Modal'
import AdvancedFilters from '../components/analytics/AdvancedFilters'
import EfficiencyChart from '../components/analytics/EfficiencyChart'
import CostPerKmRanking from '../components/analytics/CostPerKmRanking'
import DriverRiskTable from '../components/analytics/DriverRiskTable'
import SmartInsightsList from '../components/analytics/SmartInsightsList'
import KPICards from '../components/analytics/KPICards'
import TrendChart from '../components/analytics/TrendChart'
import VehicleDetailsTable from '../components/analytics/VehicleDetailsTable'

export default function AdminAnalyticsDashboard() {
  const { organizations } = useMasterDataCatalog()
  const [filters, setFilters] = useState({ period_days: 30, vehicle_type: '', organization: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const [overview, setOverview] = useState(null)
  const [efficiency, setEfficiency] = useState([])
  const [tco, setTco] = useState([])
  const [driverRisk, setDriverRisk] = useState([])
  const [insights, setInsights] = useState([])
  const [trend, setTrend] = useState([])
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportConfig, setExportConfig] = useState({ format: 'xlsx', includeCharts: true, includeDetails: true })

  const query = useMemo(
    () => ({ period_days: filters.period_days, vehicle_type: filters.vehicle_type || undefined }),
    [filters.period_days, filters.vehicle_type],
  )

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        const [overviewResp, efficiencyResp, tcoResp, riskResp, insightsResp, trendResp] = await Promise.all([
          analyticsAPI.overview({ period_days: filters.period_days }),
          analyticsAPI.efficiency(query),
          analyticsAPI.tco(query),
          analyticsAPI.driverRisk({ period_days: filters.period_days }),
          analyticsAPI.insights({ period_days: filters.period_days }),
          analyticsAPI.costTrend({ months: 12, vehicle_type: filters.vehicle_type || undefined }),
        ])
        setOverview(overviewResp.data)
        setEfficiency(efficiencyResp.data)
        setTco(tcoResp.data)
        setDriverRisk(riskResp.data)
        setInsights(insightsResp.data)
        setTrend(trendResp.data)
      } catch (err) {
        setError(getApiErrorMessage(err, 'Não foi possível carregar o módulo de analytics.'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filters.period_days, query, refreshTick])

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
  }

  async function handleExport() {
    const { data } = await analyticsAPI.exportReport({
      period_days: filters.period_days,
      export_format: exportConfig.format,
      include_charts: exportConfig.includeCharts,
      include_details: exportConfig.includeDetails,
    })
    const url = window.URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-${filters.period_days}d.${exportConfig.format}`
    a.click()
    window.URL.revokeObjectURL(url)
    setExportModalOpen(false)
  }

  return (
    <div className="surface-panel">
      <h2 className="section-title">Analytics Administrativo</h2>
      <p className="section-copy">Comparações por categoria de veículo, com KPIs e alertas acionáveis.</p>

      <AdvancedFilters
        filters={filters}
        organizations={organizations}
        onChange={updateFilter}
        onRefresh={() => setRefreshTick((value) => value + 1)}
      />

      <div className="actions-inline" style={{ marginBottom: 12 }}>
        <button className="secondary-button" type="button" onClick={() => setExportModalOpen(true)}>Exportar relatório</button>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div style={{ margin: '16px 0' }}>
        <KPICards overview={overview} loading={loading} />
      </div>

      <div className="dashboard-grid">
        <EfficiencyChart rows={efficiency} />
        <CostPerKmRanking rows={tco} />
      </div>

      <div className="dashboard-grid" style={{ marginTop: 16 }}>
        <TrendChart rows={trend} />
        <SmartInsightsList insights={insights} />
      </div>

      <div className="dashboard-grid" style={{ marginTop: 16 }}>
        <DriverRiskTable rows={driverRisk} />
        <VehicleDetailsTable efficiencyRows={efficiency.slice(0, 25)} tcoRows={tco} />
      </div>

      <Modal
        open={exportModalOpen}
        title="Exportar relatório"
        description="Escolha o formato e os itens do relatório gerado"
        onClose={() => setExportModalOpen(false)}
      >
        <div className="form-grid" style={{ gap: 12 }}>
          <label>
            Formato
            <select value={exportConfig.format} onChange={(e) => setExportConfig((v) => ({ ...v, format: e.target.value }))}>
              <option value="xlsx">Excel (XLSX)</option>
              <option value="pdf">PDF</option>
            </select>
          </label>

          <label className="checkbox-field">
            <input type="checkbox" checked={exportConfig.includeCharts} onChange={(e) => setExportConfig((v) => ({ ...v, includeCharts: e.target.checked }))} />
            Incluir gráficos
          </label>

          <label className="checkbox-field">
            <input type="checkbox" checked={exportConfig.includeDetails} onChange={(e) => setExportConfig((v) => ({ ...v, includeDetails: e.target.checked }))} />
            Incluir dados detalhados
          </label>

          <div className="actions-inline">
            <button type="button" className="ghost-button" onClick={() => setExportModalOpen(false)}>Cancelar</button>
            <button type="button" className="app-button" onClick={handleExport}>Exportar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
