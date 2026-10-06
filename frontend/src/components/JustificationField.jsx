import { forwardRef, useId } from 'react'
import ReasonSuggestions from './ReasonSuggestions'
import { useReasonSuggestions } from '../hooks/useReasonSuggestions'

const JustificationField = forwardRef(function JustificationField({ context, userId, label, ...props }, ref) {
  const generatedId = useId()
  const id = props.id || generatedId
  const suggestions = useReasonSuggestions(context, { userId })
  return <>
    {label && <label htmlFor={id}>{label}</label>}
    <textarea {...props} id={id} ref={ref} />
    <ReasonSuggestions key={suggestions.scope} {...suggestions} value={props.value} disabled={props.disabled}
      onChoose={(value) => {
        props.onChange({ target: { value }, currentTarget: { value } })
        document.getElementById(id)?.focus()
      }} />
  </>
})
export default JustificationField
