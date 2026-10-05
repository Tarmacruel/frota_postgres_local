import { useEffect, useRef } from 'react'

const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'

// Keyboard boundary for existing custom drawers, including a nested modal.
export function useDialogFocus(open, onClose) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    const stops = () => Array.from(dialog.querySelectorAll(focusableSelector))
      .filter((element) => !element.closest('[hidden], [inert]')
        && getComputedStyle(element).visibility !== 'hidden'
        && getComputedStyle(element).display !== 'none')

    function handleKeyDown(event) {
      if (Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) !== dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current?.()
      } else if (event.key === 'Tab') {
        const choices = stops()
        const first = choices[0] || dialog
        const last = choices.at(-1) || dialog
        if (!dialog.contains(document.activeElement) || document.activeElement === dialog
          || (event.shiftKey && document.activeElement === first)) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => (stops()[0] || dialog).focus())
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) previousFocus.focus()
    }
  }, [open])

  return dialogRef
}
