import { useEffect, useState } from 'react'
import api from '../api/client'
import { useSystemSettings } from '../hooks/useSystemSettings'

export function CustomFormFields({ module, recordId = null }) {
  const { values } = useSystemSettings()
  const definitions = values.forms?.[module]?.custom?.filter((field) => field.active !== false) || []
  const [entries, setEntries] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(Boolean(recordId))
  useEffect(() => {
    let active = true
    setEntries({})
    setError('')
    if (!recordId || !definitions.length) { setLoading(false); return () => { active = false } }
    setLoading(true)
    api.get(`/system-settings/form-values/${module}/${recordId}`).then(({ data }) => { if (active) setEntries(data.values || {}) })
      .catch(() => { if (active) setError('Não foi possível carregar os campos adicionais. Feche e reabra o formulário para preservar os dados já salvos.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [module, recordId, definitions.length])
  if (!definitions.length) return null
  return <section className="configured-fields" data-custom-fields-module={module}>
    <h4>Informações adicionais</h4>
    {loading ? <p role="status">Carregando informações…</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="configured-fields__grid">
      {definitions.map((field) => <label key={field.key} className="form-field"><span>{field.label}{field.required ? <span className="guided-form__required"> *</span> : null}</span>
        {field.type === 'boolean' ? <select className="app-select" data-custom-key={field.key} data-custom-type={field.type}
          required={field.required} disabled={loading || Boolean(error)} value={entries[field.key] === undefined ? '' : String(entries[field.key])}
          onChange={(event) => setEntries({ ...entries, [field.key]: event.target.value === '' ? undefined : event.target.value === 'true' })}>
          <option value="">Selecione</option><option value="true">Sim</option><option value="false">Não</option>
        </select> : <input className="app-input" data-custom-key={field.key} data-custom-type={field.type}
          type={field.type} step={field.type === 'number' ? 'any' : undefined} maxLength={field.type === 'text' ? 2000 : undefined}
          required={field.required} disabled={loading || Boolean(error)} value={entries[field.key] ?? ''}
          onChange={(event) => setEntries({ ...entries, [field.key]: event.target.value })} />}
      </label>)}
    </div>
    {loading || error ? <input type="text" required value="" readOnly tabIndex={-1} className="configured-fields__guard" aria-label="Carregue os campos adicionais antes de salvar" /> : null}
  </section>
}
