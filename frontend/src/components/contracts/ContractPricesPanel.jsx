import { useState } from 'react'
import ResponsiveRecord from '../ui/ResponsiveRecord'
import StatusChip from '../ui/StatusChip'

const states = {
  CURRENT: ['Vigente', 'success'], SCHEDULED: ['Agendado', 'info'], EXPIRED: ['Encerrado', 'neutral'],
  REPLACED: ['Substituído', 'neutral'], DELETED: ['Excluído', 'danger'],
}
const money = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 6 })
function stateOf(price) {
  if (price.deleted_at || price.status === 'DELETED') return 'DELETED'
  const start = new Date(price.valid_from).getTime()
  const end = price.valid_until ? new Date(price.valid_until).getTime() : null
  if (end !== null && end <= start) return 'REPLACED'
  if (end !== null && end <= Date.now()) return 'EXPIRED'
  return start > Date.now() ? 'SCHEDULED' : 'CURRENT'
}

export default function ContractPricesPanel({ prices = [], providers = [], manage, onCreate, onEdit, onDelete }) {
  const [history, setHistory] = useState(false)
  const rows = prices.filter((price) => history || ['CURRENT', 'SCHEDULED'].includes(stateOf(price)))
  return <section className="contract-detail__section" aria-label="Preços por posto e combustível">
    <div className="contract-order-panel__heading"><h4>Preços por posto e combustível</h4>
      {manage ? <button className="secondary-button" disabled={!providers.some((p) => p.active && p.fuel_station_id)} onClick={onCreate}>Novo preço</button> : null}
    </div>
    <label className="checkbox-line"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />Mostrar histórico de preços</label>
    <div className="table-wrap"><table className="data-table contract-table operation-table"><thead><tr><th>Posto / combustível</th><th>Preço por litro</th><th>Vigência</th><th>Situação</th>{manage ? <th>Ações</th> : null}</tr></thead>
      <tbody>{rows.map((price) => {
        const state = stateOf(price)
        const [label, tone] = states[state]
        const identity = `${price.fuel_type} no posto ${price.station_name || price.provider_name}`
        return <ResponsiveRecord key={price.id} label={identity} identityLabel="Posto / combustível" statusLabel="Situação" summaryLabels={['Preço por litro', 'Vigência']}>
          <td data-label="Posto / combustível">{price.station_name || price.provider_name}<small>{price.fuel_type}</small></td>
          <td data-label="Preço por litro">{money(price.unit_price)}</td>
          <td data-label="Vigência">{new Date(price.valid_from).toLocaleString('pt-BR')}<small>{price.valid_until ? `Até ${new Date(price.valid_until).toLocaleString('pt-BR')}` : 'Sem encerramento programado'}</small></td>
          <td data-label="Situação"><StatusChip tone={tone}>{label}</StatusChip>{price.deleted_at ? <small>Excluído em {new Date(price.deleted_at).toLocaleString('pt-BR')}</small> : null}</td>
          {manage ? <td data-label="Ações"><div className="operation-row-actions">
            {['CURRENT', 'SCHEDULED'].includes(state) ? <button className="mini-button" aria-label={`Editar preço de ${identity}`} onClick={() => onEdit(price)}>Editar</button> : null}
            {state !== 'DELETED' ? <button className="mini-button danger" aria-label={`Excluir preço de ${identity}`} onClick={() => onDelete(price)}>Excluir</button> : null}
          </div></td> : null}
        </ResponsiveRecord>
      })}{!rows.length ? <tr><td colSpan={manage ? 5 : 4} className="contract-empty">{history ? 'Nenhum preço cadastrado.' : 'Nenhum preço vigente ou agendado. Cadastre um preço para novos pedidos ou consulte o histórico.'}</td></tr> : null}</tbody>
    </table></div>
  </section>
}
