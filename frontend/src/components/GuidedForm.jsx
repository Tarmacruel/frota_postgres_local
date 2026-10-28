import { Children, Fragment, cloneElement, forwardRef, isValidElement, useEffect, useId, useRef, useState } from 'react'
import { AppIcon } from './AppIcon'
import { describeFormField, inspectForm, validationMessage } from '../utils/formExperience'

function flatten(children, prefix = '') {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [child]
    const key = `${prefix}/${child.key}`
    // Keep the fragment namespace: neighboring conditional fragments can each
    // contain a child keyed .0. Losing that namespace leaves stale DOM behind.
    return child.type === Fragment ? flatten(child.props.children, key) : [cloneElement(child, { key })]
  })
}

function requiredDescendant(node) {
  return isValidElement(node) && (node.props.required || Children.toArray(node.props.children).some(requiredDescendant))
}

function requiredIds(children, result = new Set()) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.props.required && child.props.id) result.add(child.props.id)
    requiredIds(child.props.children, result)
  })
  return result
}

function labelText(children) {
  return Children.toArray(children).map((child) => {
    if (!isValidElement(child)) return typeof child === 'string' || typeof child === 'number' ? child : ''
    if (['input', 'select', 'textarea', 'button'].includes(child.type)) return ''
    return labelText(child.props.children)
  }).join(' ').replace(/\s+/g, ' ').trim()
}

function labelsById(children, labels = new Map()) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.type === 'label' && child.props.htmlFor) labels.set(child.props.htmlFor, labelText(child.props.children))
    labelsById(child.props.children, labels)
  })
  return labels
}

function decorate(children, ids, labels, inheritedLabel = '') {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child
    const field = typeof child.type === 'string' && /(^|\s)form-field(\s|$)/.test(child.props.className || '')
    const fieldChildren = field ? Children.toArray(child.props.children) : []
    const fieldLabel = fieldChildren.find((node) => isValidElement(node) && node.type === 'label')
    const fieldRequired = field && fieldChildren.some((node) => node !== fieldLabel && requiredDescendant(node))
    const label = child.type === 'label' ? labelText(child.props.children) : fieldLabel ? labelText(fieldLabel.props.children) : inheritedLabel
    const attributes = {}
    const componentName = child.type?.render?.name || child.type?.name
    const inputControl = ['input', 'select', 'textarea'].includes(child.type) || ['MoneyInput', 'JustificationField'].includes(componentName)
    if (inputControl && !child.props['aria-label'] && !child.props['aria-labelledby']) {
      const accessibleLabel = labels.get(child.props.id) || inheritedLabel
      if (accessibleLabel) attributes['aria-label'] = accessibleLabel
    }
    if (['SearchableSelect', 'DriverSelect'].includes(componentName) && inheritedLabel && !child.props.ariaLabel) attributes.ariaLabel = inheritedLabel
    if (!child.props.children) return Object.keys(attributes).length ? cloneElement(child, attributes) : child
    const nested = fieldRequired ? Children.map(child.props.children, (node) => isValidElement(node) && node.type === 'label' ? cloneElement(node, { 'data-guided-required-label': true }) : node) : child.props.children
    const content = decorate(nested, ids, labels, label)
    if (child.type === 'label' && (child.props['data-guided-required-label'] || requiredDescendant(child) || ids.has(child.props.htmlFor))) {
      const parts = Children.toArray(content)
      const controlIndex = parts.findIndex(requiredDescendant)
      parts.splice(controlIndex < 0 ? parts.length : controlIndex, 0, <span key="required" className="guided-form__required" aria-hidden="true"> *</span>)
      return cloneElement(child, attributes, parts)
    }
    if (typeof child.type === 'string' && child.props.className?.split(' ').includes('alert-error')) {
      return <FormFeedback className={child.props.className} id={child.props.id}>{content}</FormFeedback>
    }
    return cloneElement(child, attributes, content)
  })
}

// Adds the same labels and feedback to controls inside an existing guided editor.
export function FormFields({ children }) {
  return decorate(children, requiredIds(children), labelsById(children))
}

export function FormFeedback({ children, className = '', id }) {
  const message = labelText(children).toLowerCase()
  const guidance = /conexão|servidor|interromp|resposta|offline/.test(message)
    ? 'O preenchimento foi mantido. Confira se o registro já aparece na listagem antes de repetir o envio. Se o erro continuar, informe a referência exibida ao suporte.'
    : /permissão|perfil|não autorizado/.test(message)
      ? 'O preenchimento foi mantido. Solicite a conferência do acesso ao responsável pelo sistema antes de tentar esta ação novamente.'
      : /saldo|vigência|preço|executante/.test(message)
        ? 'O preenchimento foi mantido. Confira a pendência na configuração do contrato e atualize a consulta deste formulário antes de tentar novamente.'
        : 'O preenchimento foi mantido. Corrija a informação indicada; se depender de outro cadastro, peça a correção ao responsável e depois retome esta ação.'
  return <div id={id} className={`guided-feedback ${className}`} role="alert" tabIndex={-1}>
    <AppIcon name="close" /><div><strong>Confira antes de continuar</strong><div className="guided-feedback__message">{children}</div><p>{guidance}</p></div>
  </div>
}

export function FormSection({ title, description, children, requirement: _requirement, ...props }) {
  const id = useId()
  return <section {...props} className={`guided-section ${props.className || ''}`} aria-labelledby={id}>
    <header className="guided-section__heading"><h4 id={id} tabIndex={-1}>{title}</h4>{description ? <p>{description}</p> : null}</header>{children}
  </section>
}

/** Keeps the original submit handler and mounted controls, including files and preview tokens. */
const GuidedForm = forwardRef(function GuidedForm({ children, onSubmit, className = '', title = 'Preenchimento', busy = false, initialStep = 0, formError = '', blockedMessage = '', requirements = [], onChangeCapture, onInputCapture, ...props }, forwardedRef) {
  const localRef = useRef(null)
  const bodyRef = useRef(null)
  const [step, setStep] = useState(initialStep)
  const [attempted, setAttempted] = useState(false)
  const [issues, setIssues] = useState([])
  const [progress, setProgress] = useState({ filled: 0, total: 0, sections: [] })
  const id = useId()
  const nodes = flatten(children)
  const sections = nodes.filter((node) => isValidElement(node) && node.type === FormSection)
  const lastStep = Math.max(0, sections.length - 1)
  const activeStep = Math.min(step, lastStep)
  const final = activeStep === lastStep
  const checks = [...requirements, ...sections.flatMap((section, index) => section.props.requirement ? [{ ...section.props.requirement, label: section.props.title, step: index }] : [])]

  function inspect() {
    const result = inspectForm(localRef.current)
    result.total += checks.length
    result.filled += checks.filter((check) => check.valid).length
    checks.forEach((check) => {
      if (result.sections[check.step]) result.sections[check.step].complete = Boolean(check.valid) && !result.issues.some((issue) => issue.control.closest(`[data-guided-step="${check.step}"]`))
      if (check.valid) return
      const section = localRef.current?.querySelector(`[data-guided-step="${check.step ?? activeStep}"]`)
      const control = section?.querySelector('input:not([disabled]):not([hidden]),select:not([disabled]),button:not([disabled]),h4') || localRef.current?.querySelector('input:not([disabled]):not([hidden]),button:not([disabled])')
      if (control) result.issues.push({ control, label: check.label, message: check.message, step: check.step })
    })
    return result
  }

  function scan() {
    if (busy) return
    const result = inspect()
    const next = { filled: result.filled, total: result.total, sections: result.sections }
    setProgress((old) => JSON.stringify(old) === JSON.stringify(next) ? old : next)
    if (attempted) setIssues((old) => {
      const remaining = old.filter((issue) => result.issues.some((current) => current.control === issue.control))
      return remaining.length === old.length ? old : remaining
    })
  }
  // Controlled selectors, conditional fields and catalog responses may change without a native input event.
  useEffect(scan)

  function goTo(index) {
    setStep(index)
    requestAnimationFrame(() => {
      bodyRef.current?.scrollTo?.({ top: 0, behavior: 'auto' })
      localRef.current?.querySelector(`[data-guided-step="${index}"] h4`)?.focus({ preventScroll: true })
    })
  }

  function focusIssue(issue) {
    const section = issue.control.closest('[data-guided-step]')
    if (section) setStep(Number(section.dataset.guidedStep))
    requestAnimationFrame(() => {
      let details = issue.control.closest('details')
      while (details) { details.open = true; details = details.parentElement?.closest('details') }
      const region = issue.control.closest('[data-guided-step]') || localRef.current
      const target = issue.control.disabled ? region?.querySelector('input:not([disabled]):not([hidden]),select:not([disabled]),button:not([disabled])') : issue.control
      target?.focus()
      target?.scrollIntoView?.({ block: 'center', behavior: 'auto' })
    })
  }

  function validate(all = false) {
    const result = inspect()
    const errors = result.issues.filter((issue) => all || !sections.length || Number(issue.step ?? issue.control.closest('[data-guided-step]')?.dataset.guidedStep ?? activeStep) === activeStep)
    setAttempted(true)
    setIssues(errors)
    if (errors.length) { focusIssue(errors[0]); return false }
    return true
  }

  function submit(event) {
    event.preventDefault()
    if (busy) return
    if (!final) { if (validate()) goTo(activeStep + 1); return }
    if (validate(true)) onSubmit?.(event)
  }

  const actions = []
  const content = nodes.filter((node) => {
    if (!isValidElement(node) || typeof node.type !== 'string') return true
    const actionClass = /(^|\s)(modal-actions|actions-inline|contract-editor-footer)(\s|$)/.test(node.props.className || '')
    const descendants = flatten(node.props.children)
    const onlyActions = descendants.every((child) => !isValidElement(child) || child.type === 'button')
    const primaryAction = descendants.some((child) => isValidElement(child) && child.type === 'button' && (child.props.type !== 'button' || /(^|\s)app-button(\s|$)/.test(child.props.className || '')))
    if (actionClass && onlyActions && primaryAction) { actions.push(node); return false }
    return true
  })
  let sectionIndex = -1
  const ids = requiredIds(children)
  const labels = labelsById(children)
  function scheduleScan() {
    // A select dispatches input before change. Updating during input capture would
    // restore its old controlled value before the parent's onChange can read it.
    queueMicrotask(() => { if (localRef.current) scan() })
  }
  return <form {...props} ref={(node) => { localRef.current = node; if (typeof forwardedRef === 'function') forwardedRef(node); else if (forwardedRef) forwardedRef.current = node }} className="guided-form" data-attempted={attempted} data-final={final} onSubmit={submit} noValidate onChangeCapture={(event) => { onChangeCapture?.(event); scheduleScan() }} onInputCapture={(event) => { onInputCapture?.(event); scheduleScan() }}>
    <header className="guided-form__progress">
      <div className="guided-form__caption"><span>{title}</span><strong aria-live="polite">{progress.total ? `${progress.filled} de ${progress.total} obrigatórios preenchidos` : 'Revise os dados antes de confirmar'}</strong></div>
      {progress.total ? <div className="guided-form__bar" role="progressbar" aria-label="Preenchimento dos campos obrigatórios" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.filled}><span style={{ width: `${progress.filled / progress.total * 100}%` }} /></div> : null}
      {sections.length > 1 ? <nav aria-label="Etapas do formulário"><ol>{sections.map((section, index) => <li key={section.props.title} aria-current={activeStep === index ? 'step' : undefined}><button type="button" disabled={busy} onClick={() => { if (index <= activeStep || validate()) goTo(index) }}><span aria-hidden="true">{progress.sections[index]?.complete ? <AppIcon name="check" /> : index + 1}</span>{section.props.title}</button></li>)}</ol></nav> : null}
    </header>
    <div className={`guided-form__body ${className}`} ref={bodyRef}>
      {formError ? <FormFeedback>{formError}</FormFeedback> : null}
      {issues.length ? <div className="guided-feedback guided-form__errors" role="alert" id={`${id}-errors`}><AppIcon name="close" /><div><strong>Revise {issues.length === 1 ? 'o campo indicado' : 'os campos indicados'}</strong><p>Selecione uma pendência para ir ao campo. Seus dados continuam preenchidos.</p><ul>{issues.map((issue, index) => <li key={index}><button type="button" onClick={() => focusIssue(issue)}><strong>{issue.label || describeFormField(issue.control)}</strong>{': '}<span>{issue.message || validationMessage(issue.control)}</span></button></li>)}</ul></div></div> : null}
      {blockedMessage && !busy ? <p className="guided-form__blocker" role="note">{blockedMessage}</p> : null}
      {content.map((node) => {
        if (isValidElement(node) && node.type === FormSection) { sectionIndex += 1; return cloneElement(node, { 'data-guided-step': sectionIndex, hidden: sectionIndex !== activeStep, children: decorate(node.props.children, ids, labels) }) }
        // Return a keyed element, not a nested array indexed by its current position.
        // Inserting an API error must never remount controls or clear a file input.
        return decorate(node, ids, labels)?.[0] ?? node
      })}
    </div>
    <footer className="guided-form__footer"><span aria-live="polite">{busy ? 'Aguarde a conclusão. Seu preenchimento está preservado.' : sections.length > 1 ? `Etapa ${activeStep + 1} de ${sections.length}` : progress.total ? '* Campo obrigatório' : 'Confira antes de confirmar'}</span><div className="guided-form__actions">
      {final && progress.filled < progress.total && !busy ? <button type="button" className="ghost-button" onClick={() => validate(true)}>Rever obrigatórios</button> : null}
      {activeStep > 0 ? <button type="button" className="ghost-button" disabled={busy} onClick={() => goTo(activeStep - 1)}>Voltar etapa</button> : null}
      {actions}
      {!final ? <button type="button" className="app-button" disabled={busy} onClick={() => { if (validate()) goTo(activeStep + 1) }}>Continuar</button> : null}
    </div></footer>
  </form>
})
export default GuidedForm
