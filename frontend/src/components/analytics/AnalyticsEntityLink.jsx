export default function AnalyticsEntityLink({ children, entityType, entityId, entityName, origin, onOpen }) {
  if (!entityId || !onOpen) return <span>{children}</span>
  return (
    <button type="button" className="analytics-entity-link" onClick={() => onOpen({ entityType, entityId, title: entityName, origin })}>
      {children}<span aria-hidden="true"> ↗</span>
    </button>
  )
}
