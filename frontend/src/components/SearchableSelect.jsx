import { useEffect, useMemo, useRef, useState } from 'react'
import { AppIcon } from './AppIcon'

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione',
  searchPlaceholder = 'Buscar opcao',
  emptyLabel = 'Nenhuma opcao encontrada.',
  disabled = false,
  allowClear = false,
  clearLabel = 'Limpar selecao',
}) {
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value)) || null,
    [options, value],
  )

  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return options
    return options.filter((option) => {
      const haystack = [option.label, option.description, option.keywords]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [options, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return undefined
    }

    window.setTimeout(() => inputRef.current?.focus(), 30)

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function handleSelect(nextValue) {
    onChange?.(nextValue)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className={`searchable-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}>
      <button
        type="button"
        className="searchable-select-trigger"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
      >
        <span className={`searchable-select-value${selectedOption ? '' : ' is-placeholder'}`}>
          {selectedOption?.label || placeholder}
        </span>
        <AppIcon name={open ? 'chevron-up' : 'chevron-down'} className="app-icon" />
      </button>

      {open ? (
        <div className="searchable-select-panel">
          <div className="searchable-select-input-shell">
            <AppIcon name="search" className="app-icon" />
            <input
              ref={inputRef}
              type="search"
              className="searchable-select-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>

          {allowClear && value ? (
            <button type="button" className="searchable-select-clear" onClick={() => handleSelect('')}>
              {clearLabel}
            </button>
          ) : null}

          <div className="searchable-select-options">
            {filteredOptions.length === 0 ? (
              <div className="searchable-select-empty">{emptyLabel}</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  className={`searchable-select-option${String(option.value) === String(value) ? ' is-selected' : ''}`}
                  onClick={() => handleSelect(option.value)}
                >
                  <strong>{option.label}</strong>
                  {option.description ? <span>{option.description}</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
