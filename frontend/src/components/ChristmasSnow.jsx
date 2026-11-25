import './ChristmasSnow.css'

export default function ChristmasSnow({ className = '', compact = false, preview = false }) {
  return (
    <div
      className={['christmas-snow', compact && 'christmas-snow--compact', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      data-christmas-snow-preview={preview || undefined}
    />
  )
}
