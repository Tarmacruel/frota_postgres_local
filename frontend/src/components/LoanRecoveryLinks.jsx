export default function LoanRecoveryLinks({ target, vehicleId, canView = () => false }) {
  const operations = ['operations', 'period', 'delivery'].includes(target)
  const links = [
    operations && canView('possession') && [`/posses?vehicle_id=${vehicleId}`, 'Consultar posses e rotas'],
    operations && canView('fuel_supply_orders') && [`/abastecimentos?view=open&vehicle_id=${vehicleId}`, 'Consultar ordens abertas'],
    target === 'delivery' && canView('fuel_supplies') && [`/abastecimentos?view=history&vehicle_id=${vehicleId}`, 'Consultar histórico de abastecimentos'],
    ['period', 'refresh'].includes(target) && canView('vehicle_loans') && ['/emprestimos', 'Consultar empréstimos'],
    target === 'destination' && canView('vehicles') && ['/vehicles', 'Conferir cadastro do veículo'],
  ].filter(Boolean)
  if (!links.length) return null
  return <div className="loan-recovery"><div className="actions-inline">{links.map(([href, label]) => <a className="ghost-button" key={href} href={href} target="_blank" rel="noreferrer">{label}<span className="sr-only"> (abre em outra guia)</span></a>)}</div><small>Abre em outra guia para manter este preenchimento. As rotas estão no menu da posse correspondente.</small></div>
}
