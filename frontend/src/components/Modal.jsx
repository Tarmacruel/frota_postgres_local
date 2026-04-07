import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function Modal({ open, title, description, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-shell"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h3 className="section-title">{title}</h3>
            {description ? <p className="section-copy">{description}</p> : null}
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>Fechar</button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
