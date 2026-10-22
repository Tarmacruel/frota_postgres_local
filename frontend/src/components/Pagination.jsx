export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (!totalPages || totalPages <= 1) return null

  const visibleCount = Math.min(5, totalPages)
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - visibleCount + 1))
  const pages = Array.from({ length: visibleCount }, (_, index) => start + index)
  const showFirst = start > 1
  const showLast = pages.at(-1) < totalPages

  return (
    <nav className="pagination-shell" aria-label="Paginação">
      <button type="button" className="ghost-button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
        &lt; Anterior
      </button>
      <div className="pagination-pages">
        {showFirst ? <button type="button" className="pagination-page" onClick={() => onPageChange(1)} aria-label="Página 1">1</button> : null}
        {start > 2 ? <span className="pagination-ellipsis" aria-hidden="true">…</span> : null}
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            className={`pagination-page${page === currentPage ? ' is-active' : ''}`}
            onClick={() => onPageChange(page)}
            aria-label={`Página ${page}`}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </button>
        ))}
        {pages.at(-1) < totalPages - 1 ? <span className="pagination-ellipsis" aria-hidden="true">…</span> : null}
        {showLast ? <button type="button" className="pagination-page" onClick={() => onPageChange(totalPages)} aria-label={`Página ${totalPages}`}>{totalPages}</button> : null}
      </div>
      <span className="pagination-mobile-position" aria-hidden="true">{currentPage} de {totalPages}</span>
      <button type="button" className="ghost-button" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
        Próxima &gt;
      </button>
    </nav>
  )
}
