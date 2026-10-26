import { Link } from 'react-router-dom'
import { useState } from 'react'
import Modal from '../Modal'
import { ActionMenu, StatusChip } from '../ui'
import ContractPricesPanel from './ContractPricesPanel'
import ContractMovementBrowser from './ContractMovementBrowser'
import ContractCommitmentsBrowser from './ContractCommitmentsBrowser'
import MaintenanceOrdersPanel from './MaintenanceOrdersPanel'
import ContractInvoicesPanel from './ContractInvoicesPanel'
import ContractItemsPanel from './ContractItemsPanel'
import { ContractAmendmentReport } from './ContractAmendmentEditor'
import { formatContractMoney as brl, contractKinds, contractDate } from '../../utils/contractBalance'

export function ContractState({ contract }) {
  if (contract.divergence_open) return <StatusChip tone="danger">Divergência</StatusChip>
  if (contract.status !== 'ACTIVE') return <StatusChip tone="neutral">{({ SUSPENDED: 'Suspenso', FINISHED: 'Encerrado', CANCELLED: 'Cancelado' })[contract.status] || 'Conferir situação'}</StatusChip>
  if (!contract.control_opened) return <StatusChip tone="warning">Configurar saldo</StatusChip>
  if (contract.ready === false) return <StatusChip tone="warning">Revisar pendências</StatusChip>
  return <StatusChip tone={contract.ready ? 'success' : 'neutral'}>{contract.ready ? 'Liberado' : 'Controle iniciado'}</StatusChip>
}

export function ContractPosition({ contract, onMovements }) {
  return <section className="contract-position" aria-label="Posição atual do contrato">
    <button className="contract-position__available" onClick={() => onMovements('ledger')}><span>Disponível para novos pedidos</span><strong>{brl(contract.available_balance)}</strong><small>Posição atual · saldo menos reservas</small></button>
    <div className="contract-position__composition">
      <button onClick={() => onMovements('ledger')}><span>Saldo contratual</span><strong>{brl(contract.contractual_balance)}</strong></button>
      <button onClick={() => onMovements('reservations')}><span>Reservado</span><strong>{brl(contract.reserved_amount)}</strong></button>
      <button onClick={() => onMovements('operations')}><span>Consumido</span><strong>{brl(contract.consumed_since_opening)}</strong></button>
    </div>
  </section>
}

export function ContractMovementContent({ detail, mode, onMode, canViewMaintenance, revision, onChange }) {
  return <>
    <div className="status-pills contract-movement-tabs" aria-label="Consulta operacional">{[['ledger', 'Extrato'], ['reservations', 'Reservas abertas'], ['operations', 'Serviços realizados'], ...(canViewMaintenance ? [['maintenance', 'Pedidos de manutenção']] : [])].map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} className={`status-pill ${mode === key ? 'active' : ''}`} onClick={() => onMode(key)}>{label}</button>)}</div>
    {mode === 'ledger' ? <ContractMovementBrowser key={detail.contract.id} contract={detail.contract} providers={detail.providers} revision={revision} /> : null}
    {['reservations', 'operations'].includes(mode) ? <ContractCommitmentsBrowser key={`${detail.contract.id}:${mode}`} contract={detail.contract} providers={detail.providers} mode={mode} revision={revision} /> : null}
    {mode === 'maintenance' && canViewMaintenance ? <MaintenanceOrdersPanel contractId={detail.contract.id} hideCreate onChange={onChange} refreshKey={revision} /> : null}
  </>
}

export default function ContractInspector({ open, detail, row, loading, error, tab, onTab, onClose, onShow, onPayments, onMovements, movementMode, onMovementMode, manage, canCreateOrder, canViewMaintenance, orderPath, onOrder, onProviderToggle, revision, returnFocusRef, onRefresh, quantityEnabled = false }) {
  const c = detail?.contract
  const [report, setReport] = useState(null)
  const providers = detail?.providers || []
  const eligible = Boolean(row?.ready && c?.control_opened && !c.divergence_open)
  const tabs = [['summary', 'Resumo'], ['movements', 'Movimentações'], ['invoices', 'Faturas'], ['settings', 'Configuração']]
  const settings = c ? [
    { label: 'Cadastro e vigência', value: `${contractDate(c.valid_from)} a ${contractDate(c.valid_until)}`, action: 'Conferir cadastro', run: () => onShow('edit') },
    { label: 'Rede executante', value: `${providers.filter((p) => p.active).length} posto(s) / oficina(s) ativos`, action: 'Vincular prestador', run: () => onShow('provider') },
    ...(c.control_opened ? [{ label: 'Limite e vigência', value: 'Alterações registradas por aditivo', action: 'Registrar aditivo', run: () => onShow('amend') }] : []),
    ...(c.control_opened && c.available_balance !== null && Number(c.available_balance) <= 0 ? [{ label: 'Saldo disponível', value: 'Recomposição necessária para novos pedidos', action: 'Ajustar saldo', run: () => onShow('adjust') }] : []),
    ...(!c.control_opened ? [{ label: 'Abertura de saldo', value: 'Confirmação do gestor pendente', action: 'Conferir saldo inicial', run: () => onShow('opening') }] : []),
  ] : []
  return <Modal open={open} title={c ? `Contrato ${c.number}` : 'Acompanhamento do contrato'} onClose={onClose} returnFocusRef={returnFocusRef} className="contract-inspector" backdropClassName="contract-inspector-backdrop">
    {loading ? <p role="status">Carregando contrato…</p> : error ? <div className="alert alert-error" role="alert">{error}<button className="ghost-button" onClick={onRefresh}>Tentar novamente</button></div> : c ? <>
      <div className="contract-inspector__identity"><div><span>{contractKinds[c.kind]}</span><p>{c.supplier_name}</p></div><ContractState contract={{ ...c, ...row }} /></div>
      <div className="contract-inspector__actions">
        {canCreateOrder ? eligible ? <Link className="app-button" to={orderPath} onClick={onOrder}>Novo pedido de {c.kind === 'FUEL' ? 'abastecimento' : 'manutenção'}</Link> : <button className="app-button" disabled title="Confira as pendências e a elegibilidade do contrato.">Novo pedido</button> : null}
        <button className="secondary-button" onClick={() => onMovements('ledger')}>Extrato</button>
        <ActionMenu label="Mais ações do contrato" items={[
          manage && { label: 'Editar cadastro', onClick: () => onShow('edit') },
          manage && { label: 'Registrar aditivo', onClick: () => onShow('amend') },
          manage && c.control_opened && { label: 'Ajustar saldo', onClick: () => onShow('adjust') },
          manage && c.divergence_open && { label: 'Regularizar divergência', onClick: () => onShow('resolve') },
          { label: 'Histórico e projeções', onClick: () => onPayments({ financial_view: 'contractManagement' }) },
        ]} />
      </div>
      <nav className="contract-inspector__tabs" aria-label="Detalhes do contrato">{tabs.map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => onTab(key)}>{label}</button>)}</nav>
      {tab === 'summary' ? <>
        <ContractPosition contract={c} onMovements={onMovements} />
        {c.control_opened ? <p className="muted">Controle iniciado em {contractDate(c.opening_date)} · abertura conferida {brl(c.opening_balance)}.</p> : <p className="contract-pending-note">Configure este contrato para liberar pedidos. O saldo inicial depende de conferência do gestor.</p>}
        {c.divergence_open ? <div className="alert alert-error"><strong>Pedidos bloqueados por divergência.</strong><p>{c.divergence_note}</p>{manage ? <div className="actions-inline"><button className="secondary-button" onClick={() => onShow('adjust')}>Ajustar saldo</button><button className="secondary-button" onClick={() => onShow('resolve')}>Regularizar divergência</button></div> : null}</div> : null}
        {!eligible ? <section className="contract-detail__section"><div className="contract-order-panel__heading"><h4>Pendências e configuração</h4><button className="ghost-button" onClick={() => onTab('settings')}>Abrir configuração</button></div>
          {row?.eligibility_errors?.length ? <ul className="contract-pending-list">{row.eligibility_errors.map((message) => <li key={message}>{message}</li>)}</ul> : null}
          <div className="contract-setup-list">{settings.map((step) => <div key={step.label}><span><strong>{step.label}</strong><small>{step.value}</small></span>{manage ? <button className="ghost-button" onClick={step.run}>{step.action}</button> : null}</div>)}
            {c.kind === 'FUEL' ? <div><span><strong>Preços dos combustíveis</strong><small>Conferir preços e vigências por posto</small></span><button className="ghost-button" onClick={() => onTab('settings')}>Conferir preços</button></div> : null}</div>
        </section> : <p className="contract-ready-note">Contrato liberado. O saldo e o preço serão conferidos novamente ao emitir o pedido.</p>}
      </> : null}
      {tab === 'movements' ? <><p className="muted">Os filtros alteram os lançamentos consultados. O saldo representa a posição atual.</p><ContractMovementContent detail={detail} mode={movementMode} onMode={onMovementMode} canViewMaintenance={canViewMaintenance} revision={revision} onChange={onRefresh} /></> : null}
      {tab === 'invoices' ? <ContractInvoicesPanel key={c.id} contract={c} revision={revision} onOpen={(id) => onPayments({ focus_process: id })} onBrowse={(indicator) => onPayments({ indicator })} /> : null}
      {tab === 'settings' ? <>
        {quantityEnabled ? <ContractItemsPanel contract={c} providers={providers} legacyPrices={detail.prices} manage={manage} revision={revision} onChange={onRefresh} /> : null}
        <section className="contract-detail__section"><h4>Cadastro e controle</h4><div className="contract-setup-list">{settings.map((step) => <div key={step.label}><span><strong>{step.label}</strong><small>{step.value}</small></span>{manage ? <button className="ghost-button" onClick={step.run}>{step.action}</button> : null}</div>)}</div></section>
        <section className="contract-detail__section"><div className="contract-order-panel__heading"><h4>Rede executante</h4>{manage ? <button className="secondary-button" onClick={() => onShow('provider')}>Vincular prestador</button> : null}</div>
          {providers.map((provider) => <div className="contract-provider-row" key={provider.id}><span><strong>{provider.station_name || provider.name}</strong><small>{provider.station_name ? provider.name : ''} · {provider.active ? 'Ativo' : 'Inativo'}</small></span>{manage ? <button className="ghost-button" onClick={() => onProviderToggle(provider)}>{provider.active ? 'Desativar vínculo' : 'Reativar vínculo'}</button> : null}</div>)}
          {!providers.length ? <p className="muted">Nenhum posto ou oficina vinculado.</p> : null}
        </section>
        {c.kind === 'FUEL' ? <ContractPricesPanel prices={detail.prices} providers={providers} manage={manage} onCreate={() => onShow('price')} onEdit={(price) => onShow('priceEdit', { price })} onDelete={(price) => onShow('priceDelete', { price })} /> : null}
        <section className="contract-detail__section"><div className="contract-order-panel__heading"><h4>Aditivos e dados do contrato</h4>{manage ? <button className="secondary-button" onClick={() => onShow('amend')}>Registrar aditivo</button> : null}</div><p>{c.object_description || c.contract_type || 'Objeto conforme cadastro contratual.'}</p>{c.notes ? <p>{c.notes}</p> : null}{c.amendments?.map((a) => <p key={a.id}><strong>Aditivo {a.number || 'sem número'}</strong> · {brl(a.value_delta)} · {a.valid_until ? `Vigência até ${contractDate(a.valid_until)}` : 'Sem alteração de vigência'}<br />{a.notes}{a.snapshot ? <button className="ghost-button" onClick={() => setReport(a)}>Ver demonstrativo</button> : null}</p>)}</section>
      </> : null}
      {report ? <Modal open title={`Alteração ${report.number}`} onClose={() => setReport(null)} className="contract-amendment-editor"><ContractAmendmentReport record={report} onClose={() => setReport(null)} /></Modal> : null}
    </> : null}
  </Modal>
}
