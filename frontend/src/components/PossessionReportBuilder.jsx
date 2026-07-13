import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { possessionAPI } from '../api/possession'
import { getApiErrorMessage } from '../utils/apiError'
import { getHttpStatus } from '../utils/httpError'
import DriverSelect from './DriverSelect'
import Modal from './Modal'

const EMPTY_FILTERS = {
  date_from: '',
  date_to: '',
  temporal_field: 'POSSESSION_START',
  vehicle_id: '',
  driver_id: '',
  possession_status: '',
  trip_status: '',
  has_return: '',
  has_return_confirmation: '',
  search: '',
}
const EMPTY_VEHICLES = []
const EMPTY_INITIAL_FILTERS = {}

function presetColumns(modeMetadata, preset) {
  return modeMetadata?.presets?.find((item) => item.key === preset)?.column_keys || []
}

function safeFilename(response, fallback) {
  const disposition = response?.headers?.['content-disposition'] || ''
  const match = disposition.match(/filename="?([^";]+)"?/i)
  return match?.[1] || fallback
}

function normalizeFilters(filters, mode) {
  const result = {}
  Object.entries(filters).forEach(([key, value]) => {
    if (value === '' || value === null || value === undefined) return
    if (key === 'date_from' || key === 'date_to') {
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) result[key] = date.toISOString()
      return
    }
    if (key === 'has_return' || key === 'has_return_confirmation') {
      result[key] = value === 'true'
      return
    }
    if (key === 'trip_status' && mode !== 'TRIP') return
    result[key] = value
  })
  if (mode === 'POSSESSION') result.temporal_field = 'POSSESSION_START'
  return result
}

export default function PossessionReportBuilder({ vehicles = EMPTY_VEHICLES, initialFilters = EMPTY_INITIAL_FILTERS }) {
  const titleId = useId()
  const firstControlRef = useRef(null)
  const [metadata, setMetadata] = useState(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('POSSESSION')
  const [preset, setPreset] = useState('SUMMARY')
  const [columnKeys, setColumnKeys] = useState([])
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, ...initialFilters })
  const [orientation, setOrientation] = useState('LANDSCAPE')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    let active = true
    async function loadConfiguration() {
      try {
        setLoading(true)
        const [metadataResponse, preferenceResponse] = await Promise.all([
          possessionAPI.getReportMetadata(),
          possessionAPI.getReportPreference(),
        ])
        if (!active) return
        const nextMetadata = metadataResponse.data
        const preference = preferenceResponse.data
        const nextMode = nextMetadata.modes.some((item) => item.key === preference.mode)
          ? preference.mode
          : nextMetadata.default_mode
        const modeMetadata = nextMetadata.modes.find((item) => item.key === nextMode)
        const nextPreset = modeMetadata.presets.some((item) => item.key === preference.preset)
          ? preference.preset
          : nextMetadata.default_preset
        const allowedKeys = new Set(modeMetadata.columns.map((column) => column.key))
        const preferredKeys = (preference.column_keys || []).filter((key) => allowedKeys.has(key))
        const nextKeys = preferredKeys.length ? preferredKeys : presetColumns(modeMetadata, nextPreset)
        setMetadata(nextMetadata)
        setMode(nextMode)
        setPreset(nextPreset)
        setColumnKeys(nextKeys)
        if (preference.sanitized) setAnnouncement('A preferência incompatível foi restaurada para uma configuração autorizada.')
      } catch (requestError) {
        if (active) setError(getApiErrorMessage(requestError, 'Não foi possível carregar as opções de relatório.'))
      } finally {
        if (active) setLoading(false)
      }
    }
    loadConfiguration()
    return () => { active = false }
  }, [])

  useEffect(() => {
    setFilters((current) => ({ ...current, ...initialFilters }))
  }, [initialFilters])

  const modeMetadata = useMemo(
    () => metadata?.modes?.find((item) => item.key === mode) || null,
    [metadata, mode],
  )
  const columnsByKey = useMemo(
    () => new Map((modeMetadata?.columns || []).map((column) => [column.key, column])),
    [modeMetadata],
  )
  const selectedColumns = columnKeys.map((key) => columnsByKey.get(key)).filter(Boolean)
  const restrictedCount = selectedColumns.filter((column) => (
    column.contains_personal_data || column.classification !== 'ADMINISTRATIVE'
  )).length

  function changeMode(nextMode) {
    const nextModeMetadata = metadata.modes.find((item) => item.key === nextMode)
    const summary = nextModeMetadata.presets.find((item) => item.key === 'SUMMARY')
    setMode(nextMode)
    setPreset('SUMMARY')
    setColumnKeys(summary?.column_keys || [])
    setFilters((current) => ({
      ...current,
      temporal_field: nextMode === 'TRIP' ? current.temporal_field : 'POSSESSION_START',
      trip_status: nextMode === 'TRIP' ? current.trip_status : '',
    }))
    setAnnouncement(`Modo alterado para ${nextModeMetadata.title}; preset Resumido restaurado.`)
  }

  function changePreset(nextPreset) {
    setPreset(nextPreset)
    if (nextPreset !== 'CUSTOM') setColumnKeys(presetColumns(modeMetadata, nextPreset))
    setAnnouncement(`Preset ${modeMetadata.presets.find((item) => item.key === nextPreset)?.title || nextPreset} selecionado.`)
  }

  function toggleColumn(key) {
    setPreset('CUSTOM')
    setColumnKeys((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ))
  }

  function moveColumn(key, direction) {
    setPreset('CUSTOM')
    setColumnKeys((current) => {
      const index = current.indexOf(key)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    const column = columnsByKey.get(key)
    setAnnouncement(`${column?.title || 'Coluna'} movida ${direction < 0 ? 'para cima' : 'para baixo'}.`)
  }

  function selectAllColumns() {
    setPreset('CUSTOM')
    setColumnKeys(modeMetadata.columns.map((column) => column.key))
    setAnnouncement('Todas as colunas autorizadas foram selecionadas. Revise os avisos de dados restritos.')
  }

  function restoreDefault() {
    setMode(metadata.default_mode)
    setPreset(metadata.default_preset)
    const defaultMode = metadata.modes.find((item) => item.key === metadata.default_mode)
    setColumnKeys(presetColumns(defaultMode, metadata.default_preset))
    setFilters({ ...EMPTY_FILTERS, ...initialFilters })
    setOrientation('LANDSCAPE')
    setError('')
    setAnnouncement('Configuração Resumida restaurada.')
  }

  function requestPayload() {
    return {
      mode,
      preset,
      ...(preset === 'CUSTOM' ? { column_keys: columnKeys } : {}),
      filters: normalizeFilters(filters, mode),
      orientation,
    }
  }

  function validateSelection() {
    if (!columnKeys.length) {
      setError('Selecione ao menos uma coluna para gerar o relatório.')
      return false
    }
    return true
  }

  async function previewPdf() {
    if (busy || !validateSelection()) return
    const previewWindow = window.open('about:blank', '_blank')
    if (previewWindow) previewWindow.opener = null
    try {
      setBusy('pdf')
      setError('')
      const response = await possessionAPI.previewReportPdf(requestPayload())
      const objectUrl = URL.createObjectURL(response.data)
      if (previewWindow) previewWindow.location.replace(objectUrl)
      else window.location.assign(objectUrl)
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
      setAnnouncement('Pré-visualização PDF gerada pelo servidor e aberta em nova guia.')
    } catch (requestError) {
      previewWindow?.close()
      handleRequestError(requestError, 'Não foi possível gerar a pré-visualização PDF.')
    } finally {
      setBusy('')
    }
  }

  async function exportXlsx() {
    if (busy || !validateSelection()) return
    try {
      setBusy('xlsx')
      setError('')
      const response = await possessionAPI.exportReportXlsx(requestPayload())
      const objectUrl = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = safeFilename(response, `relatorio-${mode === 'TRIP' ? 'rotas' : 'posses'}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      setAnnouncement('Exportação XLSX segura iniciada.')
    } catch (requestError) {
      handleRequestError(requestError, 'Não foi possível exportar o relatório XLSX.')
    } finally {
      setBusy('')
    }
  }

  async function savePreference() {
    if (busy || !validateSelection()) return
    try {
      setBusy('preference')
      setError('')
      const response = await possessionAPI.updateReportPreference({ mode, preset, column_keys: columnKeys })
      setColumnKeys(response.data.column_keys)
      setAnnouncement('Preferência salva sem filtros nem dados pessoais.')
    } catch (requestError) {
      handleRequestError(requestError, 'Não foi possível salvar a preferência.')
    } finally {
      setBusy('')
    }
  }

  function handleRequestError(requestError, fallback) {
    const httpStatus = getHttpStatus(requestError)
    if (httpStatus === 401) setError('Sua sessão expirou. Entre novamente para continuar.')
    else if (httpStatus === 403) setError('Seu perfil não autoriza esta coluna, preset ou tipo de exportação.')
    else if (httpStatus === 409) setError('A configuração mudou. Recarregue as opções antes de tentar novamente.')
    else if (httpStatus === 422) setError('Revise o período, os filtros e a quantidade de colunas selecionadas.')
    else setError(getApiErrorMessage(requestError, fallback))
  }

  const actionDisabled = loading || Boolean(busy) || !metadata

  return (
    <div className="possession-report-actions" aria-labelledby={titleId}>
      <span id={titleId} className="sr-status">Relatórios configuráveis de posses e rotas</span>
      <button className="secondary-button" type="button" onClick={previewPdf} disabled={actionDisabled}>
        {busy === 'pdf' ? 'Gerando PDF...' : 'Pré-visualizar PDF'}
      </button>
      {metadata?.can_export_xlsx ? (
        <button className="ghost-button" type="button" onClick={exportXlsx} disabled={actionDisabled}>
          {busy === 'xlsx' ? 'Exportando...' : 'Exportar XLSX'}
        </button>
      ) : null}
      <button className="ghost-button" type="button" onClick={() => setOpen(true)} disabled={loading || !metadata}>
        Mais opções
      </button>
      <span className="sr-status" role="status" aria-live="polite">{open ? '' : announcement}</span>

      <Modal
        open={open}
        title="Configurar relatório"
        description="Os campos disponíveis e os limites vêm do servidor conforme seu perfil."
        onClose={() => !busy && setOpen(false)}
        canClose={!busy}
        initialFocusRef={firstControlRef}
      >
        <form className="report-builder" onSubmit={(event) => event.preventDefault()}>
          <div className="report-builder-summary">
            <p><strong>{modeMetadata?.title}</strong> · {selectedColumns.length} coluna(s)</p>
            <p>PDF até {metadata?.limits?.pdf_rows} registros; XLSX até {metadata?.limits?.xlsx_rows}.</p>
          </div>

          {error ? <div className="error-banner" role="alert">{error}</div> : null}
          <div className="report-builder-live" role="status" aria-live="polite">{announcement}</div>

          <div className="report-builder-grid">
            <label>
              Modo
              <select ref={firstControlRef} className="app-input" value={mode} onChange={(event) => changeMode(event.target.value)} disabled={Boolean(busy)}>
                {metadata?.modes?.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
              </select>
            </label>
            <label>
              Preset
              <select className="app-input" value={preset} onChange={(event) => changePreset(event.target.value)} disabled={Boolean(busy)}>
                {modeMetadata?.presets?.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
              </select>
            </label>
            <label>
              Orientação do PDF
              <select className="app-input" value={orientation} onChange={(event) => setOrientation(event.target.value)} disabled={Boolean(busy)}>
                <option value="LANDSCAPE">Paisagem</option>
                <option value="PORTRAIT">Retrato</option>
              </select>
            </label>
          </div>

          <fieldset className="report-filter-section">
            <legend>Filtros processados no servidor</legend>
            <div className="report-builder-grid">
              <label>
                Critério temporal
                <select className="app-input" value={filters.temporal_field} onChange={(event) => setFilters({ ...filters, temporal_field: event.target.value })}>
                  <option value="POSSESSION_START">Início da posse</option>
                  {mode === 'TRIP' ? <option value="TRIP_DEPARTURE">Saída da rota</option> : null}
                </select>
              </label>
              <label>
                Data inicial
                <input className="app-input" type="datetime-local" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} />
              </label>
              <label>
                Data final
                <input className="app-input" type="datetime-local" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} />
              </label>
              <label>
                Veículo
                <select className="app-input" value={filters.vehicle_id} onChange={(event) => setFilters({ ...filters, vehicle_id: event.target.value })}>
                  <option value="">Todos os veículos</option>
                  {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.brand} {vehicle.model}</option>)}
                </select>
              </label>
              <div className="report-driver-filter">
                <span>Condutor</span>
                <DriverSelect
                  value={filters.driver_id}
                  onChange={(driver) => setFilters({ ...filters, driver_id: driver?.id || '' })}
                  placeholder="Todos os condutores"
                  ariaLabel="Filtrar relatório por condutor"
                />
              </div>
              <label>
                Status da posse
                <select className="app-input" value={filters.possession_status} onChange={(event) => setFilters({ ...filters, possession_status: event.target.value })}>
                  <option value="">Todos</option>
                  <option value="ACTIVE">Ativa</option>
                  <option value="CLOSED">Encerrada</option>
                </select>
              </label>
              {mode === 'TRIP' ? (
                <label>
                  Status da rota
                  <select className="app-input" value={filters.trip_status} onChange={(event) => setFilters({ ...filters, trip_status: event.target.value })}>
                    <option value="">Todos</option>
                    <option value="EM_ANDAMENTO">Em andamento</option>
                    <option value="ENCERRADA">Encerrada</option>
                    <option value="CANCELADA">Cancelada</option>
                  </select>
                </label>
              ) : null}
              <label>
                Retorno registrado
                <select className="app-input" value={filters.has_return} onChange={(event) => setFilters({ ...filters, has_return: event.target.value })}>
                  <option value="">Todos</option>
                  <option value="true">Com retorno</option>
                  <option value="false">Sem retorno</option>
                </select>
              </label>
              <label>
                Confirmação de devolução
                <select className="app-input" value={filters.has_return_confirmation} onChange={(event) => setFilters({ ...filters, has_return_confirmation: event.target.value })}>
                  <option value="">Todas</option>
                  <option value="true">Com confirmação</option>
                  <option value="false">Sem confirmação</option>
                </select>
              </label>
              <label className="report-search-field">
                Busca limitada
                <input
                  className="app-input"
                  type="search"
                  maxLength={100}
                  value={filters.search}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                  placeholder={metadata?.can_export_xlsx ? 'Placa, condutor, finalidade ou destino' : 'Placa ou número da posse'}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="report-column-section">
            <legend>Colunas e ordem</legend>
            <div className="report-column-toolbar">
              <button type="button" className="mini-button" onClick={selectAllColumns}>Selecionar todas as autorizadas</button>
              <button type="button" className="mini-button" onClick={() => { setPreset('CUSTOM'); setColumnKeys([]) }}>Desmarcar todas</button>
            </div>
            {restrictedCount ? (
              <p className="report-data-warning" role="note">
                A seleção contém {restrictedCount} coluna(s) pessoal(is), operacional(is) sensível(is) ou técnica(s). Use somente para a finalidade administrativa autorizada.
              </p>
            ) : (
              <p className="report-data-note">O preset padrão não contém documento, contato, coordenadas ou metadados técnicos.</p>
            )}
            <ol className="report-column-list">
              {modeMetadata?.columns?.map((column) => {
                const selectedIndex = columnKeys.indexOf(column.key)
                const selected = selectedIndex >= 0
                return (
                  <li key={column.key} className={selected ? 'selected' : ''} onKeyDown={(event) => {
                    if (!selected || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
                    event.preventDefault()
                    moveColumn(column.key, event.key === 'ArrowUp' ? -1 : 1)
                  }}>
                    <label>
                      <input type="checkbox" checked={selected} onChange={() => toggleColumn(column.key)} />
                      <span>
                        <strong>{column.title}</strong>
                        <small>{column.category} · {column.classification}</small>
                      </span>
                    </label>
                    {selected ? (
                      <div className="report-column-order">
                        <span aria-hidden="true">{selectedIndex + 1}</span>
                        <button type="button" className="mini-button" aria-label={`Mover ${column.title} para cima`} disabled={selectedIndex === 0} onClick={() => moveColumn(column.key, -1)}>↑</button>
                        <button type="button" className="mini-button" aria-label={`Mover ${column.title} para baixo`} disabled={selectedIndex === columnKeys.length - 1} onClick={() => moveColumn(column.key, 1)}>↓</button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ol>
            <p className="report-keyboard-help">Teclado: com foco em uma coluna selecionada, use Alt + ↑/↓ para alterar a ordem.</p>
          </fieldset>

          <div className="report-builder-footer">
            <button type="button" className="ghost-button" onClick={restoreDefault} disabled={Boolean(busy)}>Restaurar padrão</button>
            <button type="button" className="secondary-button" onClick={savePreference} disabled={Boolean(busy) || !columnKeys.length}>
              {busy === 'preference' ? 'Salvando...' : 'Salvar preferência'}
            </button>
            <button type="button" className="secondary-button" onClick={previewPdf} disabled={Boolean(busy) || !columnKeys.length}>
              {busy === 'pdf' ? 'Gerando PDF...' : 'Pré-visualizar PDF'}
            </button>
            {metadata?.can_export_xlsx ? (
              <button type="button" className="app-button" onClick={exportXlsx} disabled={Boolean(busy) || !columnKeys.length}>
                {busy === 'xlsx' ? 'Exportando...' : 'Exportar XLSX'}
              </button>
            ) : null}
          </div>
        </form>
      </Modal>
    </div>
  )
}
