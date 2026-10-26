import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput'

const MoneyInput = forwardRef(function MoneyInput({ value = '', onChange, onBlur, onFocus, precision = 2,
  allowNegative = false, min, max, step: _step, type: _type, name, id, ...props }, ref) {
  const [display, setDisplay] = useState(() => formatMoneyInput(value, { precision }))
  const inputRef = useRef(null)
  const emitted = useRef(value)
  const current = useRef(value)
  const focused = useRef(false)
  const pendingCaret = useRef(null)
  useLayoutEffect(() => {
    if (pendingCaret.current !== null && inputRef.current === document.activeElement) {
      let remaining = pendingCaret.current, position = 0
      while (position < display.length && remaining > 0) {
        if (/[\d,-]/.test(display[position])) remaining--
        position++
      }
      inputRef.current.setSelectionRange(position, position)
    }
    pendingCaret.current = null
  }, [display])
  useEffect(() => {
    if (String(value ?? '') !== String(emitted.current ?? '')) {
      current.current = value
      emitted.current = value
      setDisplay(formatMoneyInput(value, { precision, editing: focused.current }))
      inputRef.current?.setCustomValidity('')
    }
  }, [value, precision])
  function change(event) {
    const raw = event.target.value
    const cursor = event.target.selectionStart ?? raw.length
    pendingCaret.current = (raw.slice(0, cursor).match(/[\d,-]/g) || []).length
    const keyboardEdit = /^(insertText|delete)/.test(event.nativeEvent?.inputType || '')
    const decimalKey = event.nativeEvent?.inputType === 'insertText' && event.nativeEvent?.data === '.' && !display.includes(',')
    const text = decimalKey ? raw.slice(0, cursor-1).replace(/\./g, '') + ',' + raw.slice(cursor).replace(/\./g, '')
      : keyboardEdit && display.includes('.') && !raw.includes(',') ? raw.replace(/\./g, '') : raw
    const parsed = parseMoneyInput(text, { precision, allowNegative })
    if (parsed.valid && parsed.value.includes('.') && !raw.includes(',') && raw.slice(0, cursor).includes('.')) pendingCaret.current++
    const numeric = Number(parsed.value)
    const inRange = parsed.value === '' || ((min === undefined || numeric >= Number(min)) && (max === undefined || numeric <= Number(max)))
    const message = !parsed.valid ? `Informe um valor em reais com até ${precision} casas decimais, como 1.234,56.`
      : !inRange ? 'Informe um valor dentro do limite permitido.' : ''
    event.target.setCustomValidity(message)
    emitted.current = parsed.value
    current.current = parsed.value
    setDisplay(parsed.valid ? formatMoneyInput(parsed.value, { precision, editing: true }) : raw)
    onChange?.({ ...event, target: { name, id, value: parsed.value }, currentTarget: { name, id, value: parsed.value } })
  }
  return <input {...props} id={id} name={name} ref={(element) => {
    inputRef.current = element
    if (typeof ref === 'function') ref(element)
    else if (ref) ref.current = element
  }} type="text" inputMode="decimal" value={display} onChange={change}
    onFocus={(event) => { focused.current = true; setDisplay(formatMoneyInput(current.current, { precision, editing: true })); onFocus?.(event) }}
    onBlur={(event) => { focused.current = false; if (event.target.validity.valid) setDisplay(formatMoneyInput(current.current, { precision })); onBlur?.(event) }} />
})

export default MoneyInput
