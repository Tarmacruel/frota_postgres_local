const DEFAULT_TONE = 'neutral'

export default function StatusChip({ children, tone = DEFAULT_TONE, title, className = '' }) {
  return (
    <span className={`ui-status-chip ${className}`.trim()} data-tone={tone} title={title}>
      {children}
    </span>
  )
}
