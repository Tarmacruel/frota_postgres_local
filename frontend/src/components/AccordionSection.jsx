export default function AccordionSection({ title, subtitle, open = false, children }) {
  return (
    <details className="accordion-section" open={open}>
      <summary className="accordion-summary">
        <span>
          <strong>{title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </span>
      </summary>
      <div className="accordion-panel">{children}</div>
    </details>
  )
}
