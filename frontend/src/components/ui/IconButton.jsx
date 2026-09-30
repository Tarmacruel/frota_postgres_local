import { AppIcon } from '../AppIcon'

export default function IconButton({ icon, label, tone = 'default', className = '', ...buttonProps }) {
  if (typeof label !== 'string' || !label.trim()) throw new Error('IconButton requer a prop label para acessibilidade.')
  return (
    <button
      type="button"
      {...buttonProps}
      className={`ui-icon-button ${className}`.trim()}
      data-tone={tone}
      aria-label={label}
      title={label}
    >
      <AppIcon name={icon} className="app-icon" />
    </button>
  )
}
