export function describeFormField(control) {
  const explicit = control.getAttribute('aria-label')
  const label = control.labels?.[0] || control.closest('label') || control.closest('.form-field, .loan-field, [data-form-field]')?.querySelector('label')
  return (explicit || label?.textContent || control.getAttribute('placeholder') || 'Campo').replace(/\s*\*\s*$/, '').trim()
}

export function validationMessage(control) {
  const validity = control.validity
  if (control.dataset.formRequired === 'true' || validity?.valueMissing || (control.required && !String(control.value || '').trim())) return control.dataset.requiredMessage || (control.type === 'checkbox' ? 'confirme esta informação para continuar.' : control.tagName === 'SELECT' || control.tagName === 'BUTTON' ? 'selecione uma opção.' : 'preencha esta informação.')
  if (validity?.typeMismatch) return control.type === 'email' ? 'informe um e-mail válido.' : 'confira o formato informado.'
  if (validity?.patternMismatch) return control.dataset.patternMessage || 'confira o formato indicado para este campo.'
  if (validity?.rangeUnderflow) return `informe um valor igual ou maior que ${control.min}.`
  if (validity?.rangeOverflow) return `informe um valor igual ou menor que ${control.max}.`
  if (validity?.tooShort || (control.value && control.minLength > 0 && control.value.length < control.minLength)) return `use pelo menos ${control.minLength} caracteres.`
  if (validity?.tooLong) return `use no máximo ${control.maxLength} caracteres.`
  if (validity?.stepMismatch) return 'confira as casas decimais e o intervalo permitido.'
  if (validity?.badInput) return control.type.includes('date') ? 'informe uma data e hora válidas.' : 'informe um número válido.'
  return control.validationMessage || 'confira esta informação.'
}

export function inspectForm(form) {
  if (!form) return { filled: 0, total: 0, issues: [], sections: [] }
  const controls = Array.from(form.querySelectorAll('input,select,textarea,button[data-form-required="true"]')).filter((control) => {
    if (control.disabled || control.readOnly || control.type === 'hidden' || control.closest('fieldset[disabled]')) return false
    return control.willValidate || control.dataset.formRequired === 'true'
  })
  const required = controls.filter((control) => control.required || control.dataset.formRequired === 'true')
  const isValid = (control) => {
    if (control.dataset.formRequired === 'true') return Boolean(control.dataset.formValue)
    if (control.type === 'file') return !control.validity.customError && (!control.required || control.files?.length > 0)
    if (control.required && control.type !== 'checkbox' && !String(control.value || '').trim()) return false
    if (control.value && control.minLength > 0 && control.value.length < control.minLength) return false
    return control.validity.valid
  }
  const issues = controls.filter((control) => !isValid(control)).map((control) => ({ control }))
  return { filled: required.filter(isValid).length, total: required.length, issues, sections: Array.from(form.querySelectorAll('[data-guided-step]')).map((section) => {
    const fields = controls.filter((control) => section.contains(control))
    return { complete: fields.some((control) => control.required || control.dataset.formRequired === 'true') && fields.every(isValid) }
  }) }
}
