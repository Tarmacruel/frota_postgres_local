import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fuelSupplyAlertReason } from '../utils/fuelSupplyDetails'

function summaryPosition(rect) {
  const width = Math.min(320, window.innerWidth - 24)
  return {
    width,
    left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
    ...(rect.top > 220 ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
  }
}

export default function FuelSupplyAlertBadge({ record, onOpen }) {
  const tooltipId = useId()
  const buttonRef = useRef(null)
  const closeTimer = useRef(null)
  const [position, setPosition] = useState(null)

  function cancelClose() { window.clearTimeout(closeTimer.current) }

  function showSummary() {
    cancelClose()
    const rect = buttonRef.current.getBoundingClientRect()
    setPosition(summaryPosition(rect))
  }

  function scheduleClose() {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setPosition(null), 150)
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!position) return undefined
    function dismiss(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      // Scrolling inside a long explanation should not dismiss it.
      if (event.type === 'scroll' && event.target?.id === tooltipId) return
      window.clearTimeout(closeTimer.current)
      if (event.type !== 'keydown') {
        const rect = buttonRef.current.getBoundingClientRect()
        if (rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth) {
          setPosition(summaryPosition(rect))
          return
        }
      }
      setPosition(null)
    }
    window.addEventListener('keydown', dismiss)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('keydown', dismiss)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [position, tooltipId])

  return <>
    <button type="button" ref={buttonRef} className="ui-status-chip fuel-alert-trigger" data-tone="warning"
      aria-label={`Ver motivo do alerta de ${record.vehicle_plate || 'veículo não informado'}`}
      aria-haspopup="dialog" aria-describedby={position ? tooltipId : undefined}
      onMouseEnter={showSummary} onMouseLeave={scheduleClose} onFocus={showSummary} onBlur={scheduleClose}
      onClick={() => { cancelClose(); setPosition(null); onOpen(record) }}>
      Alerta
    </button>
    {position && createPortal(<div id={tooltipId} role="tooltip" className="fuel-alert-tooltip" style={position}
      onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      <strong>Motivo do alerta</strong>
      <p>{fuelSupplyAlertReason(record)}</p>
      <span>Clique em Alerta para ver o resumo completo.</span>
    </div>, document.body)}
  </>
}
