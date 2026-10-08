export default function AnalyticsEntityLink({ children, entityType, entityId, entityName, onOpen }) {
  if (!entityId || !onOpen) return <span>{children}</span>
  return (
    <button type="button" className="analytics-entity-link" onClick={() => onOpen({ entityType, entityId, title: entityName })}>
      {children}<span aria-hidden="true"> ↗</span>
    </button>
  )
}
