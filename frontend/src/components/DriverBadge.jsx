export default function DriverBadge({ name, document, contact }) {
  if (!name) {
    return <span className="muted">Sem condutor ativo</span>
  }

  return (
    <div className="driver-badge">
      <strong>{name}</strong>
      {document ? <span>{document}</span> : null}
      {contact ? <span>{contact}</span> : null}
    </div>
  )
}
