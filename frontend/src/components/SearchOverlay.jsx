import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { searchAPI } from '../api/search'
import { getApiErrorMessage } from '../utils/apiError'
import { groupSearchResults, SEARCH_TYPE_LABELS } from '../utils/search'
import { AppIcon } from './AppIcon'

export default function SearchOverlay({ open, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)

  const groupedResults = useMemo(() => groupSearchResults(results), [results])
  const flatResults = useMemo(() => results, [results])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setError('')
      setActiveIndex(0)
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => inputRef.current?.focus(), 40)

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return undefined

    const normalized = query.trim()
    if (!normalized) {
      setResults([])
      setError('')
      setLoading(false)
      setActiveIndex(0)
      return undefined
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setLoading(true)
        setError('')
        const { data } = await searchAPI.query({ q: normalized, limit: 12 })
        setResults(data)
        setActiveIndex(0)
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel executar a busca global.'))
      } finally {
        setLoading(false)
      }
    }, 220)

    return () => window.clearTimeout(timeoutId)
  }, [open, query])

  if (!open) return null

  function handleSelect(result) {
    onSelect(result)
    onClose()
  }

  function handleInputKeyDown(event) {
    if (!flatResults.length) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % flatResults.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + flatResults.length) % flatResults.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      handleSelect(flatResults[activeIndex])
    }
  }

  return createPortal(
    <div className="search-overlay-backdrop" role="presentation" onClick={onClose}>
      <section
        className="search-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="search-overlay-header">
          <div className="search-overlay-input">
            <AppIcon name="search" className="app-icon" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Buscar veiculo, condutor, secretaria ou manutencao"
            />
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar busca">
            <AppIcon name="close" className="app-icon" />
          </button>
        </header>

        <div className="search-overlay-body">
          {!query.trim() ? (
            <div className="search-empty-state">
              <strong>Busca global da operacao</strong>
              <span>Encontre veiculos, condutores e manutencoes sem navegar manualmente entre telas.</span>
            </div>
          ) : null}

          {loading ? <div className="search-empty-state">Buscando resultados...</div> : null}
          {error ? <div className="alert alert-error">{error}</div> : null}

          {!loading && query.trim() && !error && flatResults.length === 0 ? (
            <div className="search-empty-state">
              <strong>Nenhum resultado encontrado</strong>
              <span>Tente buscar por placa, nome do condutor, secretaria ou descricao de servico.</span>
            </div>
          ) : null}

          {!loading && !error && flatResults.length > 0 ? (
            <div className="search-result-groups">
              {Object.entries(groupedResults).map(([group, items]) => (
                <section key={group} className="search-result-group">
                  <header className="search-result-group-title">{SEARCH_TYPE_LABELS[group] || group}</header>
                  <div className="search-result-list">
                    {items.map((result) => {
                      const resultIndex = flatResults.findIndex((item) => item.type === result.type && item.id === result.id)
                      return (
                        <button
                          key={`${result.type}-${result.id}`}
                          type="button"
                          className={`search-result-item${resultIndex === activeIndex ? ' active' : ''}`}
                          onMouseEnter={() => setActiveIndex(resultIndex)}
                          onClick={() => handleSelect(result)}
                        >
                          <div className="search-result-main">
                            <strong>{result.title}</strong>
                            <span>{result.subtitle}</span>
                          </div>
                          <div className="search-result-meta">
                            <span className="search-result-status">{String(result.status).replaceAll('_', ' ')}</span>
                            <span>{Object.values(result.context || {}).filter(Boolean).slice(0, 1)[0] || SEARCH_TYPE_LABELS[result.type]}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  )
}
