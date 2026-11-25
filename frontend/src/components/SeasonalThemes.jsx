import { useState } from 'react'
import { activeSeasonalTheme, formatSeasonalDate } from '../utils/systemBranding'

function ThemeOption({ theme, today, published, previewing, disabled, onPreview, onPublish }) {
  const [chosenEnd, setChosenEnd] = useState(null)
  const active = activeSeasonalTheme(published)
  const end = chosenEnd ?? active?.ends_on ?? theme.suggested_ends_on
  const status = active ? `Ativo até ${formatSeasonalDate(active.ends_on)}`
    : published ? `Encerrado em ${formatSeasonalDate(published.ends_on)}` : 'Inativo'

  async function publish(selection) {
    if (await onPublish(selection)) setChosenEnd(null)
  }

  function activate(event) {
    event.preventDefault()
    if (end && end >= today && end !== active?.ends_on) publish({ id: theme.id, ends_on: end })
  }

  return <form className="settings-theme" aria-label={`Tema ${theme.name}`} onSubmit={activate}>
    <div className="settings-theme__heading">
      <span className="settings-theme__emblem" data-theme-id={theme.id} aria-hidden="true"
        style={{ backgroundColor: theme.style.sidebar, color: theme.style.accent }} />
      <div className="settings-theme__name"><strong>{theme.name}</strong><span>{status}</span></div>
      <button type="button" className="secondary-button" aria-pressed={previewing}
        onClick={() => onPreview(previewing ? null : theme.id)}>Ver prévia</button>
    </div>
    <div className="settings-theme__controls">
      <label className="form-field settings-theme__date">Encerrar em
        <input className="app-input" type="date" required min={today} value={end} disabled={disabled}
          onChange={(event) => setChosenEnd(event.target.value)} />
      </label>
      {!active || end !== active.ends_on ? <button type="submit" className="app-button"
        disabled={disabled || !end || end < today}>{active ? 'Salvar término' : `Ativar ${theme.name}`}</button> : null}
      {active ? <button type="button" className="secondary-button" disabled={disabled}
        onClick={() => publish(null)}>Desativar</button> : null}
    </div>
  </form>
}

export default function SeasonalThemes({ catalog, published, previewId, disabled, onPreview, onPublish }) {
  return <section className="settings-seasonal" aria-labelledby="settings-seasonal-title">
    <header className="settings-section-heading">
      <h3 id="settings-seasonal-title">Temas temporários</h3>
      <p>O tema vale para todo o sistema até o fim da data escolhida, no horário de Brasília.</p>
    </header>
    {catalog.themes.map((theme) => <ThemeOption key={theme.id} theme={theme} today={catalog.today}
      published={published?.id === theme.id ? published : null} previewing={previewId === theme.id}
      disabled={disabled} onPreview={onPreview} onPublish={onPublish} />)}
  </section>
}
