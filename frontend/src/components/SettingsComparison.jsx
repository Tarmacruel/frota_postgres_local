import { settingsValue } from '../utils/settingsDraft'

export default function SettingsComparison({ rows }) {
  return <div className="settings-comparison" aria-label="Alterações antes e depois">
    {rows.map((row) => <article key={row.key}>
      <h4>{row.label}</h4><dl><div><dt>Publicado</dt><dd>{row.key === 'identity.logoPath' ? <img src={row.before} alt="Logo publicada" /> : settingsValue(row.before)}</dd></div>
        <div><dt>Após publicar</dt><dd>{row.key === 'identity.logoPath' ? <img src={row.after} alt="Nova logo" /> : settingsValue(row.after)}</dd></div></dl>
      {row.warning ? <p className="settings-change-warning">{row.warning}</p> : null}
    </article>)}
  </div>
}

export function SettingsConflictChoices({ conflicts, choices, onChoose, describe = (entry) => entry.key }) {
  return <div className="settings-conflicts">{conflicts.map((conflict) => <fieldset key={conflict.key}>
    <legend>{describe(conflict)}</legend>
    <label><input type="radio" name={conflict.key} checked={choices[conflict.key] === 'remote'} onChange={() => onChoose(conflict.key, 'remote')} />
      <span><strong>Usar versão atual</strong><small>{settingsValue(conflict.remote)}</small></span></label>
    <label><input type="radio" name={conflict.key} checked={choices[conflict.key] === 'local'} onChange={() => onChoose(conflict.key, 'local')} />
      <span><strong>Manter meu preenchimento</strong><small>{settingsValue(conflict.local)}</small></span></label>
  </fieldset>)}</div>
}
