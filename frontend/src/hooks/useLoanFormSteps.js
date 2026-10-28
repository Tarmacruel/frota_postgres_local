import { useEffect, useRef, useState } from 'react'

export default function useLoanFormSteps(validation) {
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState({})
  const [focusField, setFocusField] = useState(null)
  const [visited, setVisited] = useState([0])
  const formRef = useRef(null)
  useEffect(() => {
    if (!focusField) return
    const section = [...(formRef.current?.querySelectorAll('[data-loan-field]') || [])].find((node) => node.dataset.loanField === focusField)
    section?.querySelector('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),summary')?.focus()
    section?.scrollIntoView?.({ block: 'nearest' })
    setFocusField(null)
  }, [focusField, step])
  function show(next) { setStep(next); setVisited((current) => current.includes(next) ? current : [...current, next]) }
  function validate(through = validation.length) {
    const sections = [...(formRef.current?.querySelectorAll('.loan-editor__step') || [])]
    const groups = validation.slice(0, through).map((items, index) => {
      const native = [...(sections[index]?.querySelectorAll('input,textarea,select') || [])].filter((node) => !node.matches(':disabled') && node.validity && !node.validity.valid)
        .map((node) => {
          const field = node.closest('[data-loan-field]')?.dataset.loanField
          const state = node.validity
          const hint = state.valueMissing ? 'Preencha este campo antes de continuar.' : state.rangeUnderflow ? `O valor mínimo permitido é ${node.min}.`
            : state.rangeOverflow ? `O valor máximo permitido é ${node.max}.` : state.stepMismatch ? 'Use a precisão indicada no campo; nos odômetros, informe até uma casa decimal.'
              : state.tooLong ? `Use no máximo ${node.maxLength} caracteres.` : state.tooShort ? `Informe pelo menos ${node.minLength} caracteres.` : 'Confira o formato do valor informado.'
          return [field, hint]
        }).filter(([field]) => field && !items.some(([key]) => key === field))
      return [...items, ...native]
    })
    const issues = groups.flat()
    setErrors(Object.fromEntries(issues))
    if (!issues.length) return true
    const first = issues[0][0]
    show(groups.findIndex((items) => items.some(([field]) => field === first)))
    setFocusField(first)
    return false
  }
  function go(next) { if (next <= step || validate(next)) { show(next); return true } return false }
  return { step, errors, formRef, visited, show, go, validate, clear: (field) => setErrors((current) => ({ ...current, [field]: undefined })) }
}
