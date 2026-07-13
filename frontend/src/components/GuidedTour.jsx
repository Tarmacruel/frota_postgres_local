import { useEffect, useMemo, useRef, useState } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function readCompleted(storageKey) {
  try {
    return window.localStorage.getItem(storageKey) === '1'
  } catch {
    return false
  }
}

function persistCompleted(storageKey) {
  try {
    window.localStorage.setItem(storageKey, '1')
  } catch {
    // O tour continua funcional mesmo quando o navegador bloqueia armazenamento local.
  }
}

export default function GuidedTour({ steps, storageKey, replayToken = 0 }) {
  const validSteps = useMemo(() => steps.filter((step) => step?.title && step?.description), [steps])
  const [open, setOpen] = useState(() => !readCompleted(storageKey))
  const [stepIndex, setStepIndex] = useState(0)
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (!replayToken) return
    setStepIndex(0)
    setOpen(true)
  }, [replayToken])

  useEffect(() => {
    if (!open || validSteps.length === 0) return undefined
    previousFocusRef.current = document.activeElement
    window.requestAnimationFrame(() => dialogRef.current?.querySelector(FOCUSABLE)?.focus())
    return () => previousFocusRef.current?.focus?.()
  }, [open, validSteps.length])

  useEffect(() => {
    if (!open) return undefined
    const step = validSteps[stepIndex]
    const target = step?.selector ? document.querySelector(step.selector) : null
    if (target) {
      target.classList.add('guided-tour-highlight')
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      target.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
    }
    return () => target?.classList.remove('guided-tour-highlight')
  }, [open, stepIndex, validSteps])

  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        persistCompleted(storageKey)
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll(FOCUSABLE)]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, storageKey])

  if (!open || validSteps.length === 0) return null

  const current = validSteps[stepIndex]
  const isLast = stepIndex === validSteps.length - 1
  const finish = () => {
    persistCompleted(storageKey)
    setOpen(false)
  }

  return (
    <div className="guided-tour-layer">
      <div className="guided-tour-backdrop" aria-hidden="true" />
      <section
        ref={dialogRef}
        className="guided-tour-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-title"
        aria-describedby="guided-tour-description"
      >
        <div className="guided-tour-progress" aria-live="polite">
          Passo {stepIndex + 1} de {validSteps.length}
        </div>
        <h2 id="guided-tour-title">{current.title}</h2>
        <p id="guided-tour-description">{current.description}</p>
        <div className="guided-tour-actions">
          <button type="button" className="ghost-button" onClick={finish}>Pular tour</button>
          <div className="actions-inline">
            <button
              type="button"
              className="secondary-button"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
            >
              Anterior
            </button>
            <button
              type="button"
              className="app-button"
              onClick={() => (isLast ? finish() : setStepIndex((value) => value + 1))}
            >
              {isLast ? 'Concluir' : 'Próximo'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
