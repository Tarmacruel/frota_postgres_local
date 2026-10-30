import { fireEvent, screen, within } from '@testing-library/react'

/** Exercises the same Continue actions as the user; never changes field values or bypasses validation. */
export function reviewGuidedForm(scope) {
  const form = scope || Array.from(document.querySelectorAll('form.guided-form')).at(-1)
  if (!form) return
  const query = within(form)
  for (let index = 0; index < 10; index += 1) {
    const next = query.queryByRole('button', { name: 'Continuar', exact: true })
    if (!next) return true
    const current = form.querySelector('[aria-current="step"]')?.textContent
    fireEvent.click(next)
    if (form.querySelector('[aria-current="step"]')?.textContent === current) {
      return false
    }
  }
  throw new Error('O formulário não alcançou a conferência')
}

export function openFormStage(title, scope = screen) {
  fireEvent.click(scope.getByRole('button', { name: title, exact: true }))
}
