const labels = {
  driver_name: 'Condutor', driver_document: 'Documento', driver_contact: 'Contato',
  start_date: 'Início', end_date: 'Fim', start_odometer_km: 'Odômetro inicial', end_odometer_km: 'Odômetro final',
  observation: 'Observação', vehicle_condition_notes: 'Condições na devolução', loan_term_name: 'Anexo da entrega',
  return_term_name: 'Anexo da devolução', photo_count: 'Quantidade de fotos', return_confirmation_version: 'Versão da confirmação de devolução',
}
const display = (key, value) => value == null || value === '' ? '—' : key.endsWith('_date') ? new Date(value).toLocaleString('pt-BR') : String(value)

export default function PossessionRevisionHistory({ revisions = [] }) {
  return <details className="modal-field-span">
    <summary>Histórico de retificações ({revisions.length})</summary>
    {!revisions.length && <p>Nenhuma retificação pela tela unificada. Registros anteriores permanecem na auditoria e no histórico de confirmações.</p>}
    {revisions.map((item) => <section className="surface-panel" key={item.version}>
      <strong>Versão {item.version} · {item.actor_name}</strong>
      <p>{new Date(item.created_at).toLocaleString('pt-BR')} · {item.reason}</p>
      <dl>{Object.entries(labels).filter(([key]) => item.before[key] !== item.after[key]).map(([key, label]) => <div key={key}>
        <dt>{label}</dt><dd>{display(key, item.before[key])} → {display(key, item.after[key])}</dd>
      </div>)}</dl>
    </section>)}
  </details>
}
