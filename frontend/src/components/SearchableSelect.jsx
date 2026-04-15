import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const panelRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [openUpward, setOpenUpward] = useState(false)
  const [panelStyle, setPanelStyle] = useState(null)

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
      setOpenUpward(false)
      setPanelStyle(null)
      return undefined
    }

    const measureAndPositionPanel = () => {
      const triggerRect = rootRef.current?.getBoundingClientRect()
      if (!triggerRect) return

      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
      const spaceBelow = viewportHeight - triggerRect.bottom
      const spaceAbove = triggerRect.top
      const estimatedPanelHeight = Math.min(420, Math.max(220, viewportHeight * 0.42))
      const shouldOpenUpward = spaceBelow < estimatedPanelHeight && spaceAbove > spaceBelow
      const shellGap = 8
      const edgeInset = 10
      const maxWidth = Math.max(220, viewportWidth - edgeInset * 2)
      const width = Math.min(triggerRect.width, maxWidth)
      const left = Math.min(Math.max(triggerRect.left, edgeInset), viewportWidth - width - edgeInset)

      setOpenUpward(shouldOpenUpward)
      setPanelStyle({
        position: 'fixed',
        left: `${left}px`,
        width: `${width}px`,
        zIndex: 5005,
        top: shouldOpenUpward ? 'auto' : `${Math.min(viewportHeight - edgeInset, triggerRect.bottom + shellGap)}px`,
        bottom: shouldOpenUpward ? `${Math.max(edgeInset, viewportHeight - triggerRect.top + shellGap)}px` : 'auto',
      })
    }

    measureAndPositionPanel()
    window.setTimeout(() => inputRef.current?.focus(), 30)

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) {
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
    window.addEventListener('resize', measureAndPositionPanel)
    window.addEventListener('scroll', measureAndPositionPanel, true)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', measureAndPositionPanel)
      window.removeEventListener('scroll', measureAndPositionPanel, true)
    }
  }, [open])

  function handleSelect(nextValue) {
    onChange?.(nextValue)
    setOpen(false)
    setQuery('')
  }

  function handleWheel(event) {
    event.stopPropagation()
  }

  return (
    <div ref={rootRef} className={`searchable-select${open ? ' is-open' : ''}${openUpward ? ' opens-upward' : ''}${disabled ? ' is-disabled' : ''}`}>
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

      {open && panelStyle && typeof document !== 'undefined'
        ? createPortal(
            <div ref={panelRef} className="searchable-select-panel" style={panelStyle}>
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

              <div className="searchable-select-options" onWheel={handleWheel}>
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
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
