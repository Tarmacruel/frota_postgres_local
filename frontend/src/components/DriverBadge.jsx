export default function DriverBadge({ name, document, contact, registration }) {
  if (!name) {
    return <span className="muted">Sem condutor ativo</span>
  }

  return (
    <div className="driver-badge">
      <strong>{name}</strong>
      {registration ? <span>Matrícula: {registration}</span> : null}
      {document ? <span>{document}</span> : null}
      {contact ? <span>{contact}</span> : null}
    </div>
  )
}
