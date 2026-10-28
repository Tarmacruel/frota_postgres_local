import { cloneElement, useEffect, useId, useRef } from 'react'
import Modal from './Modal'
import { AppIcon } from './AppIcon'

export function LoanFormLayout({ title, steps, step, complete, onStep, onSubmit, busy, onClose, children, footer, formRef }) {
  const contentRef = useRef(null)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    contentRef.current?.scrollTo?.({ top: 0, behavior: 'auto' })
    contentRef.current?.querySelector('section:not([hidden]) h4')?.focus({ preventScroll: true })
  }, [step])
  const count = complete.filter(Boolean).length
  return <Modal open title={title} onClose={onClose} canClose={!busy} className="loan-editor" backdropClassName="loan-editor-backdrop">
    <form ref={formRef} className="loan-editor__form" onSubmit={onSubmit} noValidate>
      <header className="loan-editor__progress">
        <div className="loan-editor__progress-caption"><span>Preenchimento</span><strong aria-live="polite">{count} de {steps.length} etapas preenchidas</strong></div>
        <div className="loan-editor__bar" role="progressbar" aria-label="Preenchimento do formulário" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={count}>
          {steps.map((label, index) => <span key={label} data-complete={Boolean(complete[index])} />)}
        </div>
        <nav aria-label="Etapas do formulário"><ol>{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-complete={Boolean(complete[index])}>
          <button type="button" disabled={busy} onClick={() => onStep(index)} aria-label={`Etapa ${index + 1}: ${label}`}><span aria-hidden="true">{complete[index] ? <AppIcon name="check" /> : index + 1}</span>{label}</button>
        </li>)}</ol></nav>
      </header>
      <div className="loan-editor__content" ref={contentRef}>{children}</div>
      <footer className="loan-editor__footer">{footer}</footer>
    </form>
  </Modal>
}

export function LoanFormStep({ title, description, hidden, children }) {
  const id = useId()
  return <section className="loan-editor__step" hidden={hidden} aria-labelledby={id}>
    <header><h4 id={id} tabIndex={-1}>{title}</h4>{description ? <p>{description}</p> : null}</header>{children}
  </section>
}

export function LoanField({ name, label, hint, error, wide, children }) {
  const hintId = useId()
  return <div className={`loan-field ${wide ? 'loan-editor__wide' : ''}`} data-loan-field={name} data-invalid={Boolean(error)}>
    <label htmlFor={`${hintId}-input`}><LoanFieldLabel label={label} required={children.props.required} /></label>{cloneElement(children, { id: `${hintId}-input`, 'aria-label': children.props['aria-label'] || label, 'aria-invalid': Boolean(error), 'aria-describedby': error || hint ? hintId : undefined })}{error ? <small id={hintId} className="loan-editor__field-error">{error}</small> : hint ? <small id={hintId}>{hint}</small> : null}
  </div>
}

export function LoanFieldLabel({ label, required }) {
  return <>{label}{required ? <span className="loan-editor__required" aria-hidden="true"> *</span> : null}</>
}

export function LoanReview({ rows }) {
  return <dl className="loan-editor__review">{rows.map(([label, value]) => <div key={label} data-long={String(value || '').length > 100}><dt>{label}</dt><dd>{value || 'Não informado'}</dd></div>)}</dl>
}
