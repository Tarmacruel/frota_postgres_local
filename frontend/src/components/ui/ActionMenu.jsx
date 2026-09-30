import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '../AppIcon'

export default function ActionMenu({ items = [], label = 'Mais ações', className = '' }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const startAtEnd = useRef(false)
  const menuId = useId()
  const triggerId = useId()
  const visibleItems = items.filter((item) => item && !item.hidden)
  const available = visibleItems.some((item) => !item.disabled)
  const expanded = open && available

  function close(restoreFocus = false) {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useLayoutEffect(() => {
    if (!expanded) return undefined
    const panel = panelRef.current
    function placePanel() {
      const anchor = triggerRef.current.getBoundingClientRect()
      const { width, height } = panel.getBoundingClientRect()
      const inset = 8
      const below = anchor.bottom + inset
      const top = below + height <= window.innerHeight - inset ? below : anchor.top - height - inset
      setPosition({
        left: Math.max(inset, Math.min(anchor.right - width, window.innerWidth - width - inset)),
        top: Math.max(inset, Math.min(top, window.innerHeight - height - inset)),
      })
    }
    placePanel()
    const choices = panel.querySelectorAll('[role="menuitem"]:not(:disabled)')
    choices[startAtEnd.current ? choices.length - 1 : 0]?.focus()
    window.addEventListener('resize', placePanel)
    window.addEventListener('scroll', placePanel, true)
    return () => {
      window.removeEventListener('resize', placePanel)
      window.removeEventListener('scroll', placePanel, true)
    }
  }, [expanded])

  useEffect(() => {
    if (!expanded) return undefined
    function dismissOutside(event) {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
    }
  }, [expanded])

  function onMenuKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'Tab') {
      // The panel is portalled outside table overflow; resume the tab order at
      // its trigger, respecting the containing dialog's focus boundary.
      event.stopPropagation()
      const dialog = triggerRef.current.closest('[role="dialog"]')
      const scope = dialog || document
      const stops = Array.from(scope.querySelectorAll('button, a[href], input, select, textarea, [tabindex]'))
        .filter((node) => node.tabIndex >= 0 && !node.disabled && !node.closest('[hidden], [inert]')
          && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden')
      const index = stops.indexOf(triggerRef.current) + (event.shiftKey ? -1 : 1)
      const target = dialog ? stops[(index + stops.length) % stops.length] : stops[index]
      close(true)
      if (target) { event.preventDefault(); target.focus() }
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      const choices = Array.from(panelRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)'))
      const current = choices.indexOf(document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length
      choices[next]?.focus()
    }
  }

  if (!visibleItems.length) return null

  return (
    <div ref={rootRef} className={`ui-action-menu ${className}`.trim()}>
      <button ref={triggerRef} id={triggerId} type="button" className="ui-icon-button"
        aria-label={label} title={label} aria-haspopup="menu" aria-expanded={expanded}
        aria-controls={expanded ? menuId : undefined} disabled={!available}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            startAtEnd.current = event.key === 'ArrowUp'
            setOpen(true)
          }
        }}
        onClick={() => { startAtEnd.current = false; setOpen(!expanded) }}>
        <span className="ui-action-menu__dots" aria-hidden="true">•••</span>
      </button>
      {expanded && createPortal(
        <div ref={panelRef} id={menuId} className="ui-action-menu__panel" role="menu"
          aria-labelledby={triggerId} style={position} onKeyDown={onMenuKeyDown}>
          {visibleItems.map((item) => (
            <button key={item.key || item.label} type="button" role="menuitem" tabIndex={-1}
              className="ui-action-menu__item" data-tone={item.tone || 'default'} disabled={item.disabled}
              onClick={() => { close(true); item.onClick?.() }}>
              {item.icon ? <AppIcon name={item.icon} className="app-icon" /> : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>, document.body,
      )}
    </div>
  )
}
