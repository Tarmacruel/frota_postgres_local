import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { calculateTourLayout } from '../utils/guidedTourLayout'

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

function isUsableTourTarget(target) {
  if (!target?.isConnected) return false
  const view = target.ownerDocument?.defaultView
  let current = target
  while (current) {
    const styles = view?.getComputedStyle?.(current)
    if (styles?.display === 'none' || styles?.visibility === 'hidden' || styles?.visibility === 'collapse') {
      return false
    }
    current = current.parentElement
  }
  return true
}

function resolveStepTarget(step) {
  const selectors = step?.selectors || [step?.selector]
  for (const selector of selectors.filter(Boolean)) {
    try {
      const target = [...document.querySelectorAll(selector)].find(isUsableTourTarget)
      if (target) return target
    } catch {
      // Um seletor inválido não pode interromper o restante do tour.
    }
  }
  return null
}

function currentViewport() {
  const visualViewport = window.visualViewport
  return {
    left: visualViewport?.offsetLeft || 0,
    top: visualViewport?.offsetTop || 0,
    width: visualViewport?.width || window.innerWidth || document.documentElement.clientWidth,
    height: visualViewport?.height || window.innerHeight || document.documentElement.clientHeight,
  }
}

function sameLayout(first, second) {
  if (!first || !second) return first === second
  return first.placement === second.placement
    && first.arrowOffset === second.arrowOffset
    && first.dialog?.left === second.dialog?.left
    && first.dialog?.top === second.dialog?.top
    && first.dialog?.maxWidth === second.dialog?.maxWidth
    && first.dialog?.maxHeight === second.dialog?.maxHeight
    && first.spotlight?.left === second.spotlight?.left
    && first.spotlight?.top === second.spotlight?.top
    && first.spotlight?.width === second.spotlight?.width
    && first.spotlight?.height === second.spotlight?.height
}

export default function GuidedTour({ steps = [], storageKey, replayToken = 0 }) {
  const validSteps = useMemo(() => steps.filter((step) => step?.title && step?.description), [steps])
  const [open, setOpen] = useState(() => !readCompleted(storageKey))
  const [stepIndex, setStepIndex] = useState(0)
  const [layout, setLayout] = useState(null)
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const focusedStepRef = useRef(null)
  const hasSteps = validSteps.length > 0
  const activeStepIndex = Math.min(stepIndex, Math.max(0, validSteps.length - 1))

  useEffect(() => {
    if (!replayToken) return
    setStepIndex(0)
    setOpen(true)
  }, [replayToken])

  useEffect(() => {
    if (stepIndex < validSteps.length) return
    setStepIndex(Math.max(0, validSteps.length - 1))
  }, [stepIndex, validSteps.length])

  useEffect(() => {
    if (!open || !hasSteps) return undefined
    previousFocusRef.current = document.activeElement
    const tourLayer = dialogRef.current?.closest('.guided-tour-layer')
    const backgroundLayers = tourLayer
      ? [...document.body.children].filter((element) => element !== tourLayer)
      : []
    const previousStates = backgroundLayers.map((element) => ({
      element,
      inertAttribute: element.getAttribute('inert'),
      inertValue: element.inert,
    }))
    backgroundLayers.forEach((element) => {
      element.setAttribute('inert', '')
      element.inert = true
    })

    return () => {
      focusedStepRef.current = null
      previousStates.forEach(({ element, inertAttribute, inertValue }) => {
        element.inert = inertValue || false
        if (inertAttribute === null) element.removeAttribute('inert')
        else element.setAttribute('inert', inertAttribute)
      })
      window.requestAnimationFrame(() => previousFocusRef.current?.focus?.())
    }
  }, [open, hasSteps])

  useEffect(() => {
    if (!open || validSteps.length === 0) {
      setLayout(null)
      return undefined
    }

    const step = validSteps[activeStepIndex]
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let frameId = null
    let cancelled = false
    let settleTimer = null
    let target = null
    let resizeObserver = null
    const naturalDialogSize = { width: 0, height: 0 }

    function syncTarget({ scroll = false } = {}) {
      const nextTarget = resolveStepTarget(step)
      if (nextTarget === target) return target
      target?.classList.remove('guided-tour-highlight')
      if (target) resizeObserver?.unobserve(target)
      target = nextTarget
      target?.classList.add('guided-tour-highlight')
      if (target) resizeObserver?.observe(target)
      if (scroll) {
        const viewport = currentViewport()
        target?.scrollIntoView?.({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: viewport.height < 700 ? 'start' : 'center',
          inline: 'nearest',
        })
      }
      return target
    }

    function measure() {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        if (cancelled) return
        const activeTarget = syncTarget({ scroll: true })
        const dialogElement = dialogRef.current
        const dialogBounds = dialogElement?.getBoundingClientRect?.() || null
        if (dialogBounds) {
          naturalDialogSize.width = Math.max(naturalDialogSize.width, dialogBounds.width)
          naturalDialogSize.height = Math.max(
            naturalDialogSize.height,
            dialogBounds.height,
            dialogElement.scrollHeight,
          )
        }
        const nextLayout = calculateTourLayout({
          targetRect: activeTarget?.getBoundingClientRect?.() || null,
          dialogRect: dialogBounds
            ? {
                width: naturalDialogSize.width,
                height: naturalDialogSize.height,
              }
            : null,
          viewport: currentViewport(),
          preferredPlacement: step?.placement,
        })
        setLayout((current) => (sameLayout(current, nextLayout) ? current : nextLayout))
      })
    }

    resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measure)
    syncTarget({ scroll: true })
    setLayout(null)
    measure()
    settleTimer = window.setTimeout(measure, reduceMotion ? 0 : 320)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    window.addEventListener('scroll', measure, true)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)

    if (dialogRef.current) resizeObserver?.observe(dialogRef.current)

    const mutationRoot = document.getElementById('root') || document.body
    const mutationObserver = typeof MutationObserver === 'undefined' || !mutationRoot
      ? null
      : new MutationObserver(measure)
    mutationObserver?.observe(mutationRoot, { childList: true, subtree: true })

    return () => {
      cancelled = true
      target?.classList.remove('guided-tour-highlight')
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      window.removeEventListener('scroll', measure, true)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
    }
  }, [activeStepIndex, open, validSteps])

  useEffect(() => {
    if (!open || !layout || !hasSteps) return undefined
    const focusKey = `${replayToken}:${activeStepIndex}`
    if (focusedStepRef.current === focusKey) return undefined
    const frameId = window.requestAnimationFrame(() => {
      const primaryAction = dialogRef.current?.querySelector('.app-button:not([disabled])')
      if (!primaryAction) return
      try {
        primaryAction.focus({ preventScroll: true })
      } catch {
        primaryAction.focus()
      }
      focusedStepRef.current = focusKey
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [activeStepIndex, hasSteps, layout, open, replayToken])

  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        persistCompleted(storageKey)
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll(FOCUSABLE)]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
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

  if (!open || validSteps.length === 0 || typeof document === 'undefined') return null

  const current = validSteps[activeStepIndex]
  const isLast = activeStepIndex === validSteps.length - 1
  const finish = () => {
    persistCompleted(storageKey)
    setOpen(false)
  }
  const dialogStyle = layout
    ? {
        left: `${layout.dialog.left}px`,
        top: `${layout.dialog.top}px`,
        maxWidth: layout.dialog.maxWidth ? `${layout.dialog.maxWidth}px` : undefined,
        maxHeight: layout.dialog.maxHeight ? `${layout.dialog.maxHeight}px` : undefined,
        '--guided-tour-arrow-offset': layout.arrowOffset ? `${layout.arrowOffset}px` : undefined,
      }
    : undefined

  return createPortal(
    <div className="guided-tour-layer" data-testid="guided-tour-layer">
      {layout?.spotlight ? (
        <div
          className="guided-tour-spotlight"
          style={{
            left: `${layout.spotlight.left}px`,
            top: `${layout.spotlight.top}px`,
            width: `${layout.spotlight.width}px`,
            height: `${layout.spotlight.height}px`,
          }}
          aria-hidden="true"
        />
      ) : <div className="guided-tour-backdrop" aria-hidden="true" />}
      <section
        ref={dialogRef}
        className={`guided-tour-dialog${layout ? ' is-positioned' : ' is-measuring'}`}
        style={dialogStyle}
        data-placement={layout?.placement || 'center'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-title"
        aria-describedby="guided-tour-description"
      >
        <div className="guided-tour-copy" tabIndex="0" aria-label="Conteúdo do passo atual">
          <div className="guided-tour-progress" aria-live="polite" aria-atomic="true">
            Passo {activeStepIndex + 1} de {validSteps.length}
          </div>
          <h2 id="guided-tour-title">{current.title}</h2>
          <p id="guided-tour-description">{current.description}</p>
        </div>
        <div className="guided-tour-actions">
          <button type="button" className="ghost-button" onClick={finish}>Pular tour</button>
          <div className="actions-inline">
            <button
              type="button"
              className="secondary-button"
              disabled={activeStepIndex === 0}
              onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
            >
              Anterior
            </button>
            <button
              type="button"
              className="app-button"
              onClick={() => (isLast ? finish() : setStepIndex((value) => value + 1))}
            >
              {isLast ? 'Encerrar tour' : 'Próximo'}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}
