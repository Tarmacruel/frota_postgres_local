export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (!totalPages || totalPages <= 1) return null

  const pages = []
  for (let page = 1; page <= totalPages; page += 1) {
    pages.push(page)
  }

  return (
    <nav className="pagination-shell" aria-label="Paginacao">
      <button type="button" className="ghost-button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
        &lt; Anterior
      </button>
      <div className="pagination-pages">
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            className={`pagination-page${page === currentPage ? ' is-active' : ''}`}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ))}
      </div>
      <button type="button" className="ghost-button" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
        Proxima &gt;
      </button>
    </nav>
  )
}
