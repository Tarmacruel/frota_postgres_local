import { useEffect, useMemo, useState } from 'react'
import { analyticsAPI } from '../api/analytics'
import { getApiErrorMessage } from '../utils/apiError'
import CategoryFilterBar from '../components/analytics/CategoryFilterBar'
import EfficiencyChart from '../components/analytics/EfficiencyChart'
import CostPerKmRanking from '../components/analytics/CostPerKmRanking'
import DriverRiskTable from '../components/analytics/DriverRiskTable'
import SmartInsightsList from '../components/analytics/SmartInsightsList'
import KPICards from '../components/analytics/KPICards'

export default function AdminAnalyticsDashboard() {
  const [filters, setFilters] = useState({ period_days: 30, vehicle_type: '', organization: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [overview, setOverview] = useState(null)
  const [efficiency, setEfficiency] = useState([])
  const [tco, setTco] = useState([])
  const [driverRisk, setDriverRisk] = useState([])
  const [insights, setInsights] = useState([])

  const query = useMemo(
    () => ({ period_days: filters.period_days, vehicle_type: filters.vehicle_type || undefined }),
    [filters.period_days, filters.vehicle_type],
  )

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        const [overviewResp, efficiencyResp, tcoResp, riskResp, insightsResp] = await Promise.all([
          analyticsAPI.overview({ period_days: filters.period_days }),
          analyticsAPI.efficiency(query),
          analyticsAPI.tco(query),
          analyticsAPI.driverRisk({ period_days: filters.period_days }),
          analyticsAPI.insights({ period_days: filters.period_days }),
        ])
        setOverview(overviewResp.data)
        setEfficiency(efficiencyResp.data)
        setTco(tcoResp.data)
        setDriverRisk(riskResp.data)
        setInsights(insightsResp.data)
      } catch (err) {
        setError(getApiErrorMessage(err, 'Não foi possível carregar o módulo de analytics.'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filters.period_days, query])

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
  }

  async function handleExport(format) {
    const { data } = await analyticsAPI.exportReport({ period_days: filters.period_days, export_format: format })
    const url = window.URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-${filters.period_days}d.${format}`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="surface-panel">
      <h2 className="section-title">Analytics Administrativo</h2>
      <p className="section-copy">Comparações por categoria de veículo, com KPIs e alertas acionáveis.</p>

      <CategoryFilterBar filters={filters} onChange={updateFilter} />

      <div className="actions-inline" style={{ marginBottom: 12 }}>
        <button className="secondary-button" type="button" onClick={() => handleExport('pdf')}>Exportar PDF</button>
        <button className="app-button" type="button" onClick={() => handleExport('xlsx')}>Exportar XLSX</button>
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
        <DriverRiskTable rows={driverRisk} />
        <SmartInsightsList insights={insights} />
      </div>
    </div>
  )
}
