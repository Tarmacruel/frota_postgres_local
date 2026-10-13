import { useState } from 'react'
import { analyticsV2API } from '../../api/analyticsV2'
import { getApiBlobErrorMessage } from '../../utils/apiError'
import AnalyticsSection from './AnalyticsSection'
import { closedPeriod } from './analyticsV2Format'

const PROFILES = [
  ['executive', 'Visão geral'], ['costs', 'Custos'], ['fuel', 'Combustível'],
  ['maintenance', 'Manutenção'], ['utilization', 'Utilização'], ['drivers', 'Condutores'],
]
const TYPES = ['SEDAN', 'HATCH', 'PICAPE', 'SUV', 'PERUA_SW', 'VAN', 'MICRO_ONIBUS', 'ONIBUS', 'CAMINHAO', 'MOTOCICLETA', 'MAQUINA']

export default function AnalyticsReports({ enabled = true, organizations = [], catalogError }) {
  const [filters, setFilters] = useState(() => ({ ...closedPeriod(), organization: '', vehicle_type: '' }))
  const [profile, setProfile] = useState('executive')
  const [format, setFormat] = useState('xlsx')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const maxDate = closedPeriod(1).date_to

  function change(name, value) { setFilters((current) => ({ ...current, [name]: value })) }

  async function download(event) {
    event.preventDefault()
    const days = (Date.parse(filters.date_to) - Date.parse(filters.date_from)) / 86400000 + 1
    if (!Number.isFinite(days) || days < 1 || days > 366 || filters.date_to > maxDate || filters.date_from < '1901-01-01') {
      setError('Selecione de 1 a 366 dias encerrados, com início anterior ou igual ao fim.')
      return
    }
    setError(''); setBusy(true)
    try {
      const params = { date_from: filters.date_from, date_to: filters.date_to,
        organization: filters.organization || undefined, vehicle_type: filters.vehicle_type || undefined,
        profile, export_format: format }
      const { data } = await analyticsV2API.exportReport(params)
      const url = window.URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = `analytics-v2-${profile}-${filters.date_from}-${filters.date_to}.${format}`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (failure) {
      setError(await getApiBlobErrorMessage(failure, 'Não foi possível gerar o relatório.'))
    }
    finally { setBusy(false) }
  }

  if (!enabled) return null
  return <AnalyticsSection title="Relatórios" description="Exporte os indicadores aprovados usando os filtros de relatório abaixo.">
    <form className="analytics-cockpit-filters analytics-reports-form" onSubmit={download} aria-label="Filtros do relatório">
      <label>Perfil
        <select value={profile} disabled={busy} onChange={(event) => setProfile(event.target.value)}>
          {PROFILES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>De<input type="date" value={filters.date_from} min="1901-01-01" max={maxDate} required disabled={busy}
        onChange={(event) => change('date_from', event.target.value)} /></label>
      <label>Até<input type="date" value={filters.date_to} min="1901-01-01" max={maxDate} required disabled={busy}
        onChange={(event) => change('date_to', event.target.value)} /></label>
      <label>Tipo de veículo
        <select value={filters.vehicle_type} disabled={busy} onChange={(event) => change('vehicle_type', event.target.value)}>
          <option value="">Todos os tipos</option>
          {TYPES.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
        </select>
      </label>
      <label>Secretaria
        <select value={filters.organization} disabled={busy} onChange={(event) => change('organization', event.target.value)}>
          <option value="">Todas no meu escopo</option>
          {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label>Formato
        <select value={format} disabled={busy} onChange={(event) => setFormat(event.target.value)}>
          <option value="xlsx">Excel (XLSX)</option><option value="pdf">PDF</option>
        </select>
      </label>
      <button type="submit" className="app-button" disabled={busy}>{busy ? 'Exportando…' : 'Exportar relatório'}</button>
    </form>
    <p className="analytics-scope-note">O arquivo identifica período, filtros, fontes e limitações. Sinistros estimados ficam separados do custo operacional registrado. Não contém gráficos.</p>
    {catalogError ? <p className="analytics-scope-note">Não foi possível carregar a lista de secretarias; o recorte autorizado continua disponível.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </AnalyticsSection>
}
