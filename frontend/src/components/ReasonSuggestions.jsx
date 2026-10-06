import { useId, useState } from 'react'
import { reasonKey } from '../utils/reasonSuggestions'

export default function ReasonSuggestions({ presets = [], history = [], forget, value, onChoose, disabled = false, unavailable = false }) {
  const headingId = useId()
  const [expanded, setExpanded] = useState(false)
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(null)
  const [forgetting, setForgetting] = useState(false)
  function apply(text) {
    onChoose(text)
    setPending(null)
    setNotice('Sugestão inserida. Revise o texto da justificativa antes de salvar.')
  }
  function choose(text) {
    if (disabled) return
    if (value?.trim() && value !== text) setPending(text)
    else apply(text)
  }
  return <section className="reason-suggestions" aria-labelledby={headingId}>
    <div className="reason-suggestions__heading">
      <strong id={headingId}>Sugestões de justificativa</strong>
      <button type="button" className="reason-suggestions__link" disabled={disabled || !presets.length} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Ocultar modelos' : 'Ver modelos'}</button>
    </div>
    <small>{unavailable ? 'Sugestões indisponíveis. Você pode digitar a justificativa normalmente.' : 'Escolha um texto e revise antes de salvar.'}</small>
    {expanded && <div className="reason-suggestions__presets">
      {presets.map((item) => <button key={item.id} type="button" className="reason-suggestions__preset" disabled={disabled} title={item.text} aria-pressed={reasonKey(value) === reasonKey(item.text)} onClick={() => choose(item.text)}>{item.label}</button>)}
    </div>}
    {history.length > 0 && <div className="reason-suggestions__history">
      <small>Mais usadas por você</small>
      {history.slice(0, 3).map((item) => <div key={item.id} className="reason-suggestions__history-row">
        <button type="button" className="reason-suggestions__text" disabled={disabled} aria-pressed={reasonKey(value) === reasonKey(item.text)} onClick={() => choose(item.text)}>{item.text}</button>
        <button type="button" className="reason-suggestions__link" disabled={disabled || forgetting} aria-label={`Esquecer sugestão: ${item.text}`} onClick={async () => {
          setForgetting(true)
          const removed = await forget(item.id)
          setForgetting(false)
          setNotice(removed ? 'Sugestão esquecida. A auditoria foi preservada.' : 'Não foi possível esquecer a sugestão. Tente novamente.')
        }}>Esquecer</button>
      </div>)}
    </div>}
    {pending !== null && <div className="reason-suggestions__confirmation" role="group" aria-label="Confirmar substituição da justificativa">
      <p>Substituir o texto que você já preencheu por esta sugestão?</p>
      <p>{pending}</p>
      <button type="button" className="mini-button" disabled={disabled} onClick={() => apply(pending)}>Substituir texto</button>
      <button type="button" className="ghost-button" disabled={disabled} onClick={() => setPending(null)}>Manter meu texto</button>
    </div>}
    <span aria-live="polite">{notice}</span>
  </section>
}
