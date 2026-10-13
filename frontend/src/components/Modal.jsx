import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

const focusableSelectors = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
]
const focusableSelector = focusableSelectors.join(',')
const modalBodyFocusableSelector = focusableSelectors.map((selector) => `.modal-body ${selector}`).join(',')

export default function Modal({ open, title, description, onClose, children, canClose = true, initialFocusRef, returnFocusRef, onEscape, className = '', backdropClassName = '' }) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const onEscapeRef = useRef(onEscape)

  useEffect(() => {
    onCloseRef.current = onClose
    onEscapeRef.current = onEscape
  }, [onClose, onEscape])

  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement
    const fallbackFocus = returnFocusRef?.current
    const dialog = dialogRef.current

    function focusInitialElement() {
      const requested = initialFocusRef?.current
      const firstFocusable = dialog?.querySelector(modalBodyFocusableSelector)
        || dialog?.querySelector(focusableSelector)
      const target = requested || firstFocusable || dialog
      target?.focus()
    }

    function handleKeyDown(event) {
      // Only the top dialog handles keyboard navigation when a modal opens another.
      const dialogs = document.querySelectorAll('.modal-shell[role="dialog"]')
      if (dialogs[dialogs.length - 1] !== dialog) return
      if (event.key === 'Escape' && canClose) {
        event.preventDefault()
        if (onEscapeRef.current) onEscapeRef.current()
        else onCloseRef.current?.()
        return
      }

      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll(focusableSelector))
        .filter((element) => {
          if (element.hasAttribute('disabled') || element.closest('[hidden], [aria-hidden="true"]')) return false
          if (typeof element.checkVisibility === 'function' && !element.checkVisibility()) return false
          let closed = element.closest('details:not([open])')
          while (closed) {
            if (!closed.querySelector('summary')?.contains(element)) return false
            closed = closed.parentElement?.closest('details:not([open])')
          }
          return true
        })
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable.at(-1)
      if (!focusable.includes(document.activeElement)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    const scheduleFocus = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0))
    const cancelFocus = window.cancelAnimationFrame || window.clearTimeout
    const focusFrame = scheduleFocus(focusInitialElement)

    return () => {
      document.body.style.overflow = previousOverflow
      cancelFocus(focusFrame)
      window.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) previousFocus.focus()
      else if (fallbackFocus && document.contains(fallbackFocus)) fallbackFocus.focus()
    }
  }, [open, canClose, initialFocusRef, returnFocusRef])

  if (!open) return null

  return createPortal(
    <div className={`modal-backdrop ${backdropClassName}`.trim()} role="presentation" onMouseDown={(event) => {
      if (canClose && event.target === event.currentTarget) onCloseRef.current?.()
    }}>
      <section
        ref={dialogRef}
        className={`modal-shell ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="modal-header">
          <div>
            <div className="modal-title-row">
              <h3 id={titleId} className="section-title">{title}</h3>
              {description ? (
                <span className="modal-description-tip" tabIndex={0} title={description} aria-label={description}>
                  i
                </span>
              ) : null}
            </div>
            {description ? <p id={descriptionId} className="section-copy">{description}</p> : null}
          </div>
          {canClose ? <button type="button" className="ghost-button" onClick={() => onCloseRef.current?.()}>Fechar</button> : null}
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
