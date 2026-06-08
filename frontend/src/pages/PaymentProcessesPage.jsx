import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { paymentContractsAPI, paymentProcessesAPI, paymentSuppliersAPI } from '../api/paymentProcesses'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { previewRowsToPdf } from '../utils/exportData'

const PAGE_SIZE = 25

const stageOptions = [
  { value: '', label: 'Todas' },
  { value: 'ASSEMBLY', label: 'Montagem' },
  { value: 'REVIEW', label: 'Conferência' },
  { value: 'COMMITMENT', label: 'Empenho' },
  { value: 'LIQUIDATION', label: 'Liquidação' },
  { value: 'PAYMENT', label: 'Pagamento' },
  { value: 'PAID', label: 'Pago' },
  { value: 'ARCHIVED', label: 'Arquivado' },
  { value: 'RETURNED', label: 'Devolvido' },
  { value: 'CANCELLED', label: 'Cancelado' },
]

const quickStageOptions = stageOptions.filter((option) => [
  'ASSEMBLY',
  'REVIEW',
  'COMMITMENT',
  'LIQUIDATION',
  'PAYMENT',
  'PAID',
  'RETURNED',
  'CANCELLED',
].includes(option.value))

const kindOptions = [
  { value: '', label: 'Todos' },
  { value: 'FUEL', label: 'Combustíveis' },
  { value: 'MAINTENANCE', label: 'Manutenção' },
]

const checklistStatusOptions = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'DONE', label: 'Concluído' },
  { value: 'WAIVED', label: 'Dispensado' },
]

const referenceLabels = {
  FUEL_SUPPLY: 'Abastecimento',
  FUEL_SUPPLY_ORDER: 'Ordem',
  MAINTENANCE: 'Manutenção',
  VEHICLE: 'Veículo',
  SERVICE_ORDER: 'OS',
  INVOICE: 'NF/Fatura',
  OTHER: 'Outro',
}

const emptyProcessForm = {
  process_number: '',
  kind: 'FUEL',
  stage: 'ASSEMBLY',
  supplier_id: '',
  contract_id: '',
  organization_id: '',
  unit_name: '',
  invoice_number: '',
  billing_number: '',
  issue_date: '',
  competence_month: '',
  due_date: '',
  amount: '',
  commitment_number: '',
  commitment_date: '',
  liquidation_number: '',
  liquidation_date: '',
  payment_order_number: '',
  payment_order_date: '',
  paid_at: '',
  stage_owner: '',
  location: '',
  notes: '',
}

const emptyContractForm = {
  supplier_id: '',
  number: '',
  kind: 'FUEL',
  contract_type: '',
  object_description: '',
  valid_from: '',
  valid_until: '',
  value_initial: '',
  value_updated: '',
  imported_balance: '',
  status: 'ACTIVE',
  notes: '',
}

const emptySupplierForm = {
  name: '',
  cnpj: '',
  active: true,
  notes: '',
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function downloadUrl(url) {
  window.location.assign(url)
}

function formatCurrency(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return currencyFormatter.format(number)
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return `${number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date)
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function toDateInput(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function toMonthInput(value) {
  if (!value) return ''
  return String(value).slice(0, 7)
}

function toApiMonth(value) {
  return value ? `${value}-01` : ''
}

function formatMonthLabel(value) {
  if (!value) return '-'
  const monthValue = String(value).slice(0, 7)
  const [year, month] = monthValue.split('-')
  if (!year || !month) return formatDate(value)
  return `${month}/${year}`
}

function decimalOrNull(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(String(value).replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  )
}

function stageLabel(stage) {
  return stageOptions.find((option) => option.value === stage)?.label || stage || '-'
}

function kindLabel(kind) {
  if (kind === 'MAINTENANCE') return 'Manutenção'
  return 'Combustível'
}

function statusTone(value) {
  if (['PAID', 'ARCHIVED', 'DONE', 'ACTIVE'].includes(value)) return 'ATIVO'
  if (['CANCELLED', 'RETURNED', 'PENDING', 'SUSPENDED'].includes(value)) return 'INATIVO'
  return 'MANUTENCAO'
}

export default function PaymentProcessesPage() {
  const { canEdit, canDeleteModule, user } = useAuth()
  const canManage = canEdit('payment_processes')
  const canDeleteProcesses = canDeleteModule('payment_processes')
  const [activeView, setActiveView] = useState('processes')
  const [detailTab, setDetailTab] = useState('summary')
  const [records, setRecords] = useState([])
  const [selectedProcess, setSelectedProcess] = useState(null)
  const [selectedContract, setSelectedContract] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [contracts, setContracts] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE })
  const [filters, setFilters] = useState({ kind: '', stage: '', supplier_id: '', contract_id: '', competence_month: '', due_from: '', due_to: '', search: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [reporting, setReporting] = useState(false)
  const [processModalOpen, setProcessModalOpen] = useState(false)
  const [processForm, setProcessForm] = useState(emptyProcessForm)
  const [editingProcessId, setEditingProcessId] = useState('')
  const [savingProcess, setSavingProcess] = useState(false)
  const [deleteProcessModalOpen, setDeleteProcessModalOpen] = useState(false)
  const [deleteProcessTarget, setDeleteProcessTarget] = useState(null)
  const [deleteProcessReason, setDeleteProcessReason] = useState('')
  const [deletingProcess, setDeletingProcess] = useState(false)
  const [stageComment, setStageComment] = useState('')
  const [checklistDraft, setChecklistDraft] = useState([])
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm)
  const [editingSupplierId, setEditingSupplierId] = useState('')
  const [contractForm, setContractForm] = useState(emptyContractForm)
  const [editingContractId, setEditingContractId] = useState('')
  const [contractDrawerOpen, setContractDrawerOpen] = useState(false)
  const [amendmentForm, setAmendmentForm] = useState({ amendment_type: '', number: '', signed_at: '', value_delta: '', valid_until: '', notes: '' })

  const queryParams = useMemo(() => ({
    page: pagination.page,
    limit: PAGE_SIZE,
    kind: filters.kind || undefined,
    stage: filters.stage || undefined,
    supplier_id: filters.supplier_id || undefined,
    contract_id: filters.contract_id || undefined,
    competence_month: toApiMonth(filters.competence_month) || undefined,
    due_from: filters.due_from || undefined,
    due_to: filters.due_to || undefined,
    search: filters.search || undefined,
  }), [filters, pagination.page])

  const reportColumns = useMemo(() => [
    { header: 'Processo', value: (row) => row.process_number || '-' },
    { header: 'Etapa', value: (row) => row.stage_label || stageLabel(row.stage) },
    { header: 'Fornecedor', value: (row) => row.supplier_name || '-' },
    { header: 'Contrato', value: (row) => row.contract_number || '-' },
    { header: 'NF/Fatura', value: (row) => `${row.invoice_number || '-'} / ${row.billing_number || '-'}` },
    { header: 'Competência', value: (row) => formatDate(row.competence_month) },
    { header: 'Vencimento', value: (row) => formatDate(row.due_date) },
    { header: 'Valor', value: (row) => formatCurrency(row.amount), align: 'right', width: 68 },
    { header: 'Alertas', value: (row) => String(row.alerts?.length || 0), align: 'center', width: 42 },
  ], [])

  const reportMetrics = useMemo(() => [
    { label: 'Processos', value: dashboard?.total_processes ?? pagination.total },
    { label: 'Em aberto', value: dashboard?.open_processes ?? 0 },
    { label: 'Vencidos', value: dashboard?.overdue_processes ?? 0 },
    { label: 'Alertas', value: dashboard?.alerts_count ?? 0 },
    { label: 'Pendente', value: formatCurrency(dashboard?.pending_amount) },
    { label: 'Pago', value: formatCurrency(dashboard?.paid_amount) },
  ], [dashboard, pagination.total])

  const reportFilters = useMemo(() => {
    const supplier = suppliers.find((item) => item.id === filters.supplier_id)
    const contract = contracts.find((item) => item.id === filters.contract_id)

    return [
      filters.kind ? { label: 'Tipo', value: kindOptions.find((option) => option.value === filters.kind)?.label || filters.kind } : null,
      filters.stage ? { label: 'Etapa', value: stageLabel(filters.stage) } : null,
      filters.supplier_id ? { label: 'Fornecedor', value: supplier?.name || filters.supplier_id } : null,
      filters.contract_id ? { label: 'Contrato', value: contract?.number || filters.contract_id } : null,
      filters.competence_month ? { label: 'Competência', value: formatMonthLabel(filters.competence_month) } : null,
      filters.due_from ? { label: 'Vencimento inicial', value: formatDate(filters.due_from) } : null,
      filters.due_to ? { label: 'Vencimento final', value: formatDate(filters.due_to) } : null,
      filters.search ? { label: 'Busca', value: filters.search } : null,
    ].filter(Boolean)
  }, [contracts, filters, suppliers])

  useEffect(() => {
    loadCatalogs()
    loadDashboard()
  }, [])

  useEffect(() => {
    loadRecords(pagination.page)
  }, [queryParams])

  useEffect(() => {
    setChecklistDraft((selectedProcess?.checklist || []).map((item) => ({ ...item })))
  }, [selectedProcess?.id])

  async function loadCatalogs() {
    try {
      const [supplierResponse, contractResponse] = await Promise.all([
        paymentSuppliersAPI.list({ active_only: false }),
        paymentContractsAPI.list(),
      ])
      setSuppliers(supplierResponse.data || [])
      setContracts(contractResponse.data || [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar fornecedores e contratos.'))
    }
  }

  async function loadDashboard() {
    try {
      const { data } = await paymentProcessesAPI.dashboard()
      setDashboard(data)
    } catch {
      setDashboard(null)
    }
  }

  async function loadRecords(page = 1) {
    setLoading(true)
    setError('')
    try {
      const { data } = await paymentProcessesAPI.list({ ...queryParams, page })
      const nextRecords = data.data || []
      setRecords(nextRecords)
      setPagination(data.pagination || { page, pages: 1, total: 0, limit: PAGE_SIZE })
      if (selectedProcess && !nextRecords.some((record) => record.id === selectedProcess.id)) {
        setSelectedProcess(null)
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar os processos de pagamento.'))
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  async function refreshAll({ keepSelected = true } = {}) {
    await Promise.all([loadCatalogs(), loadDashboard(), loadRecords(pagination.page)])
    if (keepSelected && selectedProcess?.id) {
      await openProcess(selectedProcess.id)
    }
    if (keepSelected && selectedContract?.id) {
      try {
        const { data } = await paymentContractsAPI.getById(selectedContract.id)
        setSelectedContract(data)
      } catch {
        setSelectedContract(null)
      }
    }
  }

  function updateFilter(next) {
    setPagination((current) => ({ ...current, page: 1 }))
    setFilters((current) => ({ ...current, ...next }))
  }

  function resetFilters() {
    setPagination((current) => ({ ...current, page: 1 }))
    setFilters({ kind: '', stage: '', supplier_id: '', contract_id: '', competence_month: '', due_from: '', due_to: '', search: '' })
  }

  async function openProcess(processId) {
    try {
      const { data } = await paymentProcessesAPI.getById(processId)
      setSelectedProcess(data)
      setDetailTab('summary')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível abrir o processo.'))
    }
  }

  async function handleImport(event) {
    event.preventDefault()
    if (!uploadFile) {
      setError('Selecione uma planilha XLSX para importar.')
      return
    }

    setUploading(true)
    setError('')
    setFeedback('')
    setImportResult(null)
    try {
      const { data } = await paymentProcessesAPI.import(uploadFile)
      setImportResult(data)
      setFeedback(`Importação concluída: ${data.created} criado(s), ${data.updated} atualizado(s), ${data.skipped} ignorado(s), ${data.errors} erro(s).`)
      setUploadFile(null)
      await refreshAll({ keepSelected: false })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível importar a planilha.'))
    } finally {
      setUploading(false)
    }
  }

  function exportCurrent() {
    downloadUrl(paymentProcessesAPI.exportUrl(queryParams))
  }

  async function previewPdfReport() {
    setReporting(true)
    setError('')
    setFeedback('')
    try {
      const rows = await paymentProcessesAPI.listAllForReport(queryParams)
      await previewRowsToPdf({
        title: 'Processos de pagamento',
        fileName: 'processos-pagamento.pdf',
        subtitle: 'Relatório dos processos filtrados no workflow financeiro de manutenção e combustíveis.',
        columns: reportColumns,
        rows,
        filters: reportFilters,
        summaryMetrics: reportMetrics,
        referenceLabel: `Total filtrado para o relatório: ${rows.length} processo(s).`,
        responsibleSector: 'Secretaria Municipal de Administração | Departamento de Gestão da Frota',
        generatedBy: user?.name || user?.email || 'Usuário autenticado',
        orientation: 'landscape',
      })
      setFeedback(rows.length ? 'Pré-visualização do PDF aberta em nova guia.' : 'Relatório PDF gerado sem registros para os filtros atuais.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível gerar o relatório PDF.'))
    } finally {
      setReporting(false)
    }
  }

  function openCreateProcess() {
    setProcessForm(emptyProcessForm)
    setEditingProcessId('')
    setProcessModalOpen(true)
  }

  function openCreateContract() {
    setContractForm(emptyContractForm)
    setEditingContractId('')
    setContractDrawerOpen(true)
  }

  function closeContractDrawer() {
    setContractDrawerOpen(false)
    setEditingContractId('')
    setContractForm(emptyContractForm)
  }

  function openEditProcess(record) {
    setEditingProcessId(record.id)
    setProcessForm({
      process_number: record.process_number || '',
      kind: record.kind || 'FUEL',
      stage: record.stage || 'ASSEMBLY',
      supplier_id: record.supplier_id || '',
      contract_id: record.contract_id || '',
      organization_id: record.organization_id || '',
      unit_name: record.unit_name || '',
      invoice_number: record.invoice_number || '',
      billing_number: record.billing_number || '',
      issue_date: toDateInput(record.issue_date),
      competence_month: toMonthInput(record.competence_month),
      due_date: toDateInput(record.due_date),
      amount: record.amount ?? '',
      commitment_number: record.commitment_number || '',
      commitment_date: toDateInput(record.commitment_date),
      liquidation_number: record.liquidation_number || '',
      liquidation_date: toDateInput(record.liquidation_date),
      payment_order_number: record.payment_order_number || '',
      payment_order_date: toDateInput(record.payment_order_date),
      paid_at: toDateInput(record.paid_at),
      stage_owner: record.stage_owner || '',
      location: record.location || '',
      notes: record.notes || '',
    })
    setProcessModalOpen(true)
  }

  async function saveProcess(event) {
    event.preventDefault()
    setSavingProcess(true)
    setError('')
    const { stage: _stage, ...processPayload } = processForm
    const payload = cleanPayload({
      ...processPayload,
      stage: editingProcessId ? undefined : 'ASSEMBLY',
      competence_month: toApiMonth(processForm.competence_month),
      amount: decimalOrNull(processForm.amount),
      organization_id: processForm.organization_id || null,
      supplier_id: processForm.supplier_id || null,
      contract_id: processForm.contract_id || null,
    })
    try {
      let savedProcess = null
      if (editingProcessId) {
        const { data } = await paymentProcessesAPI.update(editingProcessId, payload)
        savedProcess = data
      } else {
        const { data } = await paymentProcessesAPI.create(payload)
        savedProcess = data
      }
      setProcessModalOpen(false)
      setEditingProcessId('')
      setFeedback('Processo salvo.')
      await refreshAll({ keepSelected: false })
      setSelectedProcess(savedProcess)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar o processo.'))
    } finally {
      setSavingProcess(false)
    }
  }

  async function advanceStage(nextStage) {
    if (!selectedProcess || !nextStage) return
    try {
      const { data } = await paymentProcessesAPI.updateStage(selectedProcess.id, { stage: nextStage, comment: stageComment || null })
      setSelectedProcess(data)
      setStageComment('')
      setFeedback('Etapa atualizada.')
      await refreshAll()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível atualizar a etapa.'))
    }
  }

  function updateChecklistDraft(index, patch) {
    setChecklistDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))
  }

  async function saveChecklist() {
    if (!selectedProcess) return
    try {
      const items = checklistDraft.map((item) => ({
        stage: item.stage,
        item_label: item.item_label,
        status: item.status,
        notes: item.notes || null,
      }))
      const { data } = await paymentProcessesAPI.updateChecklist(selectedProcess.id, { items })
      setSelectedProcess(data)
      setFeedback('Checklist atualizado.')
      await refreshAll()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível atualizar o checklist.'))
    }
  }

  function openDeleteProcess(record) {
    setDeleteProcessTarget(record)
    setDeleteProcessReason('')
    setError('')
    setFeedback('')
    setDeleteProcessModalOpen(true)
  }

  function closeDeleteProcessModal() {
    if (deletingProcess) return
    setDeleteProcessModalOpen(false)
    setDeleteProcessTarget(null)
    setDeleteProcessReason('')
  }

  async function confirmDeleteProcess(event) {
    event.preventDefault()
    if (!deleteProcessTarget) return

    const reason = deleteProcessReason.trim()
    if (reason.length < 8) {
      setError('Informe uma justificativa de exclusão com pelo menos 8 caracteres.')
      return
    }

    setDeletingProcess(true)
    setError('')
    setFeedback('')
    try {
      await paymentProcessesAPI.remove(deleteProcessTarget.id, { reason })
      setSelectedProcess(null)
      setDeleteProcessModalOpen(false)
      setDeleteProcessTarget(null)
      setDeleteProcessReason('')
      setFeedback('Processo excluído com justificativa registrada na auditoria.')
      await refreshAll({ keepSelected: false })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível excluir o processo.'))
    } finally {
      setDeletingProcess(false)
    }
  }

  async function saveSupplier(event) {
    event.preventDefault()
    const payload = cleanPayload(supplierForm)
    try {
      if (editingSupplierId) {
        await paymentSuppliersAPI.update(editingSupplierId, payload)
        setFeedback('Fornecedor atualizado.')
      } else {
        await paymentSuppliersAPI.create(payload)
        setFeedback('Fornecedor criado.')
      }
      setSupplierForm(emptySupplierForm)
      setEditingSupplierId('')
      await refreshAll()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar o fornecedor.'))
    }
  }

  async function disableSupplier(id) {
    try {
      await paymentSuppliersAPI.remove(id)
      setFeedback('Fornecedor inativado.')
      await refreshAll()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível inativar o fornecedor.'))
    }
  }

  async function saveContract(event) {
    event.preventDefault()
    const payload = cleanPayload({
      ...contractForm,
      supplier_id: contractForm.supplier_id || null,
      value_initial: decimalOrNull(contractForm.value_initial),
      value_updated: decimalOrNull(contractForm.value_updated),
      imported_balance: decimalOrNull(contractForm.imported_balance),
    })
    try {
      if (editingContractId) {
        const { data } = await paymentContractsAPI.update(editingContractId, payload)
        setSelectedContract(data)
        setFeedback('Contrato atualizado.')
      } else {
        const { data } = await paymentContractsAPI.create(payload)
        setSelectedContract(data)
        setFeedback('Contrato criado.')
      }
      setContractForm(emptyContractForm)
      setEditingContractId('')
      setContractDrawerOpen(false)
      await refreshAll()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar o contrato.'))
    }
  }

  async function cancelContract(id) {
    try {
      await paymentContractsAPI.remove(id)
      setFeedback('Contrato cancelado.')
      await refreshAll()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível cancelar o contrato.'))
    }
  }

  async function createAmendment(event) {
    event.preventDefault()
    if (!selectedContract) return
    const payload = cleanPayload({
      ...amendmentForm,
      value_delta: decimalOrNull(amendmentForm.value_delta),
    })
    try {
      const { data } = await paymentContractsAPI.createAmendment(selectedContract.id, payload)
      setSelectedContract(data)
      setAmendmentForm({ amendment_type: '', number: '', signed_at: '', value_delta: '', valid_until: '', notes: '' })
      setFeedback('Aditivo registrado.')
      await refreshAll()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível registrar o aditivo.'))
    }
  }

  function editSupplier(supplier) {
    setEditingSupplierId(supplier.id)
    setSupplierForm({
      name: supplier.name || '',
      cnpj: supplier.cnpj || '',
      active: Boolean(supplier.active),
      notes: supplier.notes || '',
    })
  }

  function editContract(contract) {
    setEditingContractId(contract.id)
    setContractForm({
      supplier_id: contract.supplier_id || '',
      number: contract.number || '',
      kind: contract.kind || 'FUEL',
      contract_type: contract.contract_type || '',
      object_description: contract.object_description || '',
      valid_from: toDateInput(contract.valid_from),
      valid_until: toDateInput(contract.valid_until),
      value_initial: contract.value_initial ?? '',
      value_updated: contract.value_updated ?? '',
      imported_balance: contract.imported_balance ?? '',
      status: contract.status || 'ACTIVE',
      notes: contract.notes || '',
    })
    setContractDrawerOpen(true)
  }

  const visibleContracts = filters.supplier_id ? contracts.filter((contract) => contract.supplier_id === filters.supplier_id) : contracts
  const closeProcessDetail = useCallback(() => setSelectedProcess(null), [])

  return (
    <div className="page-shell payment-process-page payment-workflow-page">
      <section className="panel-heading payment-workflow-heading">
        <div>
          <h1 className="section-title">Processos de pagamento</h1>
          <p className="section-copy">Workflow financeiro de combustíveis e manutenção por fatura, contrato, etapa e pendência.</p>
        </div>
        <div className="payment-process-actions">
          {canManage ? <button className="app-button" type="button" onClick={openCreateProcess}>Novo processo</button> : null}
          <button type="button" className="secondary-button" onClick={previewPdfReport} disabled={reporting}>{reporting ? 'Gerando PDF...' : 'Relatório PDF'}</button>
          <button type="button" className="secondary-button" onClick={exportCurrent}>Exportar XLSX</button>
        </div>
      </section>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {feedback ? <div className="alert alert-success">{feedback}</div> : null}

      <section className="payment-workflow-tabs" aria-label="Modos do módulo">
        {[
          { value: 'processes', label: 'Processos' },
          { value: 'imports', label: 'Importacao' },
          { value: 'contractManagement', label: 'Gestão do contrato' },
          { value: 'contracts', label: 'Contratos' },
          { value: 'suppliers', label: 'Fornecedores' },
        ].map((tab) => (
          <button key={tab.value} type="button" className={`status-pill ${activeView === tab.value ? 'active' : ''}`} onClick={() => setActiveView(tab.value)}>
            {tab.label}
          </button>
        ))}
      </section>

      {activeView === 'processes' ? (
        <>
          <section className="metrics-grid payment-workflow-metrics">
            <Metric label="Processos" value={dashboard?.total_processes ?? pagination.total} />
            <Metric label="Em aberto" value={dashboard?.open_processes ?? 0} />
            <Metric label="Vencidos" value={dashboard?.overdue_processes ?? 0} />
            <Metric label="Alertas" value={dashboard?.alerts_count ?? 0} />
            <Metric label="Pendente" value={formatCurrency(dashboard?.pending_amount)} />
            <Metric label="Pago" value={formatCurrency(dashboard?.paid_amount)} />
          </section>

          <section className="toolbar-card payment-process-panel payment-filter-panel">
            <div className="payment-process-filter-stack payment-workflow-filter-grid">
              <Field label="Tipo">
                <select className="app-select" value={filters.kind} onChange={(event) => updateFilter({ kind: event.target.value })}>
                  {kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Etapa">
                <select className="app-select" value={filters.stage} onChange={(event) => updateFilter({ stage: event.target.value })}>
                  {stageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Fornecedor">
                <select className="app-select" value={filters.supplier_id} onChange={(event) => updateFilter({ supplier_id: event.target.value, contract_id: '' })}>
                  <option value="">Todos</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </Field>
              <Field label="Contrato">
                <select className="app-select" value={filters.contract_id} onChange={(event) => updateFilter({ contract_id: event.target.value })}>
                  <option value="">Todos</option>
                  {visibleContracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.number}</option>)}
                </select>
              </Field>
              <Field label="Competência">
                <input className="app-input" type="month" value={filters.competence_month} onChange={(event) => updateFilter({ competence_month: event.target.value })} />
              </Field>
              <Field label="Busca">
                <input className="app-input" type="search" value={filters.search} onChange={(event) => updateFilter({ search: event.target.value })} placeholder="Processo, NF, fornecedor..." />
              </Field>
              <div className="payment-process-actions payment-workflow-filter-actions">
                <button type="button" className="ghost-button" onClick={resetFilters}>Limpar</button>
              </div>
            </div>
          </section>

          <section className="payment-workspace payment-workspace-processes">
            <div className="toolbar-card payment-process-panel payment-process-list-panel">
              <div className="payment-section-head">
                <h2 className="section-title">Fila de processos</h2>
                <span className="muted">{pagination.total} registro(s)</span>
              </div>
              <div className="table-wrap table-wrap-wide">
                <table className="data-table payment-process-table payment-workflow-table">
                  <thead>
                    <tr>
                      <th>Processo</th>
                      <th>Etapa</th>
                      <th>Fornecedor / contrato</th>
                      <th>NF / fatura</th>
                      <th>Competência</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Alertas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={8}>Carregando processos...</td></tr>
                    ) : records.length === 0 ? (
                      <tr><td colSpan={8}><div className="empty-state">Nenhum processo encontrado.</div></td></tr>
                    ) : records.map((item) => (
                      <tr key={item.id} className={selectedProcess?.id === item.id ? 'is-selected' : ''} onClick={() => openProcess(item.id)}>
                        <td data-label="Processo"><strong>{item.process_number}</strong><br /><span className="muted">{kindLabel(item.kind)} . {item.system || '-'}</span></td>
                        <td data-label="Etapa"><span className={`status-badge status-${statusTone(item.stage)}`}>{item.stage_label || stageLabel(item.stage)}</span><br /><span className="muted">{item.stage_owner || '-'}</span></td>
                        <td data-label="Fornecedor / contrato"><strong>{item.supplier_name || '-'}</strong><br /><span className="muted">{item.contract_number || '-'}</span></td>
                        <td data-label="NF / fatura"><strong>{item.invoice_number || '-'}</strong><br /><span className="muted">{item.billing_number || '-'}</span></td>
                        <td data-label="Competência">{formatDate(item.competence_month)}</td>
                        <td data-label="Vencimento">{formatDate(item.due_date)}</td>
                        <td data-label="Valor">{formatCurrency(item.amount)}</td>
                        <td data-label="Alertas">{item.alerts?.length ? <span className="deadline-pill warning">{item.alerts.length}</span> : <span className="deadline-pill success">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadRecords} />
            </div>
          </section>

          <ProcessDetail
            canManage={canManage}
            process={selectedProcess}
            detailTab={detailTab}
            setDetailTab={setDetailTab}
            stageComment={stageComment}
            setStageComment={setStageComment}
            advanceStage={advanceStage}
            checklistDraft={checklistDraft}
            updateChecklistDraft={updateChecklistDraft}
            saveChecklist={saveChecklist}
            onEdit={openEditProcess}
            canDelete={canDeleteProcesses}
            onDelete={openDeleteProcess}
            onClose={closeProcessDetail}
          />
        </>
      ) : null}

      {activeView === 'imports' ? (
        <ImportsView
          canManage={canManage}
          uploadFile={uploadFile}
          setUploadFile={setUploadFile}
          uploading={uploading}
          importResult={importResult}
          handleImport={handleImport}
        />
      ) : null}

      {activeView === 'contracts' ? (
        <ContractsView
          canManage={canManage}
          contracts={contracts}
          suppliers={suppliers}
          selectedContract={selectedContract}
          setSelectedContract={setSelectedContract}
          contractForm={contractForm}
          setContractForm={setContractForm}
          editingContractId={editingContractId}
          saveContract={saveContract}
          contractDrawerOpen={contractDrawerOpen}
          openCreateContract={openCreateContract}
          closeContractDrawer={closeContractDrawer}
          editContract={editContract}
          cancelContract={cancelContract}
          amendmentForm={amendmentForm}
          setAmendmentForm={setAmendmentForm}
          createAmendment={createAmendment}
        />
      ) : null}

      {activeView === 'contractManagement' ? (
        <ContractManagementView
          contracts={contracts}
          suppliers={suppliers}
        />
      ) : null}

      {activeView === 'suppliers' ? (
        <SuppliersView
          canManage={canManage}
          suppliers={suppliers}
          supplierForm={supplierForm}
          setSupplierForm={setSupplierForm}
          editingSupplierId={editingSupplierId}
          setEditingSupplierId={setEditingSupplierId}
          saveSupplier={saveSupplier}
          editSupplier={editSupplier}
          disableSupplier={disableSupplier}
        />
      ) : null}

      <Modal
        open={processModalOpen}
        title={editingProcessId ? 'Editar processo' : 'Novo processo'}
        description="Registre a fatura/NF que será acompanhada no fluxo financeiro."
        onClose={() => setProcessModalOpen(false)}
      >
        <form className="payment-process-form payment-structured-form" onSubmit={saveProcess}>
          <FormSection title="Identificação">
            <div className="payment-form-grid">
              <Field label="Processo">
                <input className="app-input" value={processForm.process_number} onChange={(event) => setProcessForm((current) => ({ ...current, process_number: event.target.value }))} required />
              </Field>
              <Field label="Tipo">
                <select className="app-select" value={processForm.kind} onChange={(event) => setProcessForm((current) => ({ ...current, kind: event.target.value }))}>
                  {kindOptions.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Fornecedor">
                <select className="app-select" value={processForm.supplier_id} onChange={(event) => setProcessForm((current) => ({ ...current, supplier_id: event.target.value, contract_id: '' }))}>
                  <option value="">Selecione</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </Field>
              <Field label="Contrato">
                <select className="app-select" value={processForm.contract_id} onChange={(event) => setProcessForm((current) => ({ ...current, contract_id: event.target.value }))}>
                  <option value="">Selecione</option>
                  {contracts.filter((contract) => !processForm.supplier_id || contract.supplier_id === processForm.supplier_id).map((contract) => (
                    <option key={contract.id} value={contract.id}>{contract.number}</option>
                  ))}
                </select>
              </Field>
              <Field label="Unidade">
                <input className="app-input" value={processForm.unit_name} onChange={(event) => setProcessForm((current) => ({ ...current, unit_name: event.target.value }))} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Documento fiscal">
            <div className="payment-form-grid">
              <Field label="NF">
                <input className="app-input" value={processForm.invoice_number} onChange={(event) => setProcessForm((current) => ({ ...current, invoice_number: event.target.value }))} />
              </Field>
              <Field label="Fatura">
                <input className="app-input" value={processForm.billing_number} onChange={(event) => setProcessForm((current) => ({ ...current, billing_number: event.target.value }))} />
              </Field>
              <Field label="Emissão">
                <input className="app-input" type="date" value={processForm.issue_date} onChange={(event) => setProcessForm((current) => ({ ...current, issue_date: event.target.value }))} />
              </Field>
              <Field label="Competência">
                <input className="app-input" type="month" value={processForm.competence_month} onChange={(event) => setProcessForm((current) => ({ ...current, competence_month: event.target.value }))} />
              </Field>
              <Field label="Vencimento">
                <input className="app-input" type="date" value={processForm.due_date} onChange={(event) => setProcessForm((current) => ({ ...current, due_date: event.target.value }))} />
              </Field>
              <Field label="Valor">
                <input className="app-input" type="number" step="0.01" value={processForm.amount} onChange={(event) => setProcessForm((current) => ({ ...current, amount: event.target.value }))} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Execucao financeira">
            <div className="payment-form-grid">
              <Field label="Empenho">
                <input className="app-input" value={processForm.commitment_number} onChange={(event) => setProcessForm((current) => ({ ...current, commitment_number: event.target.value }))} />
              </Field>
              <Field label="Liquidação">
                <input className="app-input" value={processForm.liquidation_number} onChange={(event) => setProcessForm((current) => ({ ...current, liquidation_number: event.target.value }))} />
              </Field>
              <Field label="Ordem pagamento">
                <input className="app-input" value={processForm.payment_order_number} onChange={(event) => setProcessForm((current) => ({ ...current, payment_order_number: event.target.value }))} />
              </Field>
              <Field label="Pago em">
                <input className="app-input" type="date" value={processForm.paid_at} onChange={(event) => setProcessForm((current) => ({ ...current, paid_at: event.target.value }))} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Observações">
            <div className="payment-form-grid two">
              <Field label="Responsável">
                <input className="app-input" value={processForm.stage_owner} onChange={(event) => setProcessForm((current) => ({ ...current, stage_owner: event.target.value }))} />
              </Field>
              <Field label="Localização">
                <input className="app-input" value={processForm.location} onChange={(event) => setProcessForm((current) => ({ ...current, location: event.target.value }))} />
              </Field>
            </div>
            <Field label="Notas">
              <textarea className="app-textarea" value={processForm.notes} onChange={(event) => setProcessForm((current) => ({ ...current, notes: event.target.value }))} />
            </Field>
          </FormSection>

          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={savingProcess || !canManage}>{savingProcess ? 'Salvando...' : 'Salvar processo'}</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteProcessModalOpen}
        title="Excluir processo"
        description="A exclusão remove o processo da fila e registra a justificativa na trilha de auditoria."
        onClose={closeDeleteProcessModal}
        canClose={!deletingProcess}
      >
        <form className="payment-process-form payment-delete-form" onSubmit={confirmDeleteProcess}>
          <div className="alert alert-info">
            {deleteProcessTarget ? (
              <>Processo <strong>{deleteProcessTarget.process_number}</strong> será removido definitivamente.</>
            ) : 'Selecione um processo para exclusão.'}
          </div>
          <Field label="Justificativa da exclusão">
            <textarea
              className="app-textarea"
              rows="4"
              value={deleteProcessReason}
              onChange={(event) => setDeleteProcessReason(event.target.value)}
              minLength={8}
              maxLength={500}
              required
              placeholder="Ex.: cadastro duplicado na importação de junho."
              disabled={deletingProcess}
            />
          </Field>
          <div className="actions-inline modal-actions">
            <button className="ghost-button" type="button" onClick={closeDeleteProcessModal} disabled={deletingProcess}>Cancelar</button>
            <button className="mini-button danger payment-delete-confirm" type="submit" disabled={deletingProcess || deleteProcessReason.trim().length < 8}>
              {deletingProcess ? 'Excluindo...' : 'Excluir processo'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function FormSection({ title, children }) {
  return (
    <section className="payment-form-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function ProcessDetail({
  canManage,
  canDelete,
  process,
  detailTab,
  setDetailTab,
  stageComment,
  setStageComment,
  advanceStage,
  checklistDraft,
  updateChecklistDraft,
  saveChecklist,
  onEdit,
  onDelete,
  onClose,
}) {
  useEffect(() => {
    if (!process) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [process, onClose])

  if (!process) {
    return null
  }

  return (
    <div className="payment-detail-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="toolbar-card payment-process-panel payment-detail-panel payment-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="payment-detail-header">
          <div>
            <span className="muted">{kindLabel(process.kind)}</span>
            <h2 id="payment-detail-title" className="section-title">{process.process_number}</h2>
          </div>
          <div className="payment-detail-header-actions">
            <span className={`status-badge status-${statusTone(process.stage)}`}>{process.stage_label || stageLabel(process.stage)}</span>
            <button type="button" className="icon-button payment-detail-close" aria-label="Fechar detalhe do processo" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        {process.alerts?.length ? (
          <div className="payment-alert-list">
            {process.alerts.slice(0, 4).map((alert) => <span key={alert}>{alert}</span>)}
          </div>
        ) : <div className="alert alert-info">Sem alertas calculados para a etapa atual.</div>}

        <div className="payment-detail-tabs">
          {[
            { value: 'summary', label: 'Resumo' },
            { value: 'finance', label: 'Financeiro' },
            { value: 'checklist', label: 'Checklist' },
            { value: 'history', label: 'Histórico' },
          ].map((tab) => (
            <button key={tab.value} type="button" className={`status-pill ${detailTab === tab.value ? 'active' : ''}`} onClick={() => setDetailTab(tab.value)}>
              {tab.label}
            </button>
          ))}
        </div>

        {detailTab === 'summary' ? (
          <div className="payment-detail-grid">
            <Info label="Fornecedor" value={process.supplier_name} />
            <Info label="Contrato" value={process.contract_number} />
            <Info label="Unidade" value={process.organization_name || process.unit_name} />
            <Info label="NF / Fatura" value={`${process.invoice_number || '-'} / ${process.billing_number || '-'}`} />
            <Info label="Competência" value={formatDate(process.competence_month)} />
            <Info label="Vencimento" value={formatDate(process.due_date)} />
            <Info label="Localização" value={process.location} />
            <Info label="Responsável" value={process.stage_owner} />
            {process.references?.length ? (
              <div className="payment-reference-list">
                {process.references.map((reference) => (
                  <span key={reference.id}>{referenceLabels[reference.reference_type] || reference.reference_type}: {reference.label}</span>
                ))}
              </div>
            ) : null}
            <div className="actions-inline">
              {canManage ? <button className="secondary-button" type="button" onClick={() => onEdit(process)}>Editar dados</button> : null}
              {canDelete ? <button className="mini-button danger payment-process-delete-action" type="button" onClick={() => onDelete(process)}>Excluir processo</button> : null}
            </div>
          </div>
        ) : null}

        {detailTab === 'finance' ? (
          <div className="payment-detail-grid">
            <Info label="Valor" value={formatCurrency(process.amount)} />
            <Info label="Saldo importado" value={formatCurrency(process.contract_balance)} />
            <Info label="Empenho" value={`${process.commitment_number || '-'} . ${formatDate(process.commitment_date)}`} />
            <Info label="Liquidação" value={`${process.liquidation_number || '-'} . ${formatDate(process.liquidation_date)}`} />
            <Info label="Ordem pagamento" value={`${process.payment_order_number || '-'} . ${formatDate(process.payment_order_date)}`} />
            <Info label="Pago em" value={formatDate(process.paid_at)} />
            {canManage ? (
              <div className="payment-stage-box payment-status-actions">
                <div className="payment-status-current">
                  <span>Status atual</span>
                  <strong>{process.stage_label || stageLabel(process.stage)}</strong>
                </div>
                <Field label="Comentario">
                  <textarea className="app-textarea" rows="3" value={stageComment} onChange={(event) => setStageComment(event.target.value)} />
                </Field>
                <div className="payment-status-button-grid" aria-label="Atualizar etapa do processo">
                  {quickStageOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`status-pill payment-stage-action ${process.stage === option.value ? 'active' : ''}`}
                      onClick={() => advanceStage(option.value)}
                      disabled={process.stage === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {detailTab === 'checklist' ? (
          <div className="payment-checklist-list">
            {checklistDraft.map((item, index) => (
              <div key={`${item.stage}-${item.item_label}`} className="payment-checklist-row">
                <div>
                  <strong>{item.item_label}</strong>
                  <span>{stageLabel(item.stage)}</span>
                </div>
                <select className="app-select" value={item.status} onChange={(event) => updateChecklistDraft(index, { status: event.target.value })} disabled={!canManage}>
                  {checklistStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <input className="app-input" value={item.notes || ''} onChange={(event) => updateChecklistDraft(index, { notes: event.target.value })} placeholder="Observação" disabled={!canManage} />
              </div>
            ))}
            {canManage ? <button className="app-button" type="button" onClick={saveChecklist}>Salvar checklist</button> : null}
          </div>
        ) : null}

        {detailTab === 'history' ? (
          <div className="payment-history-list">
            {process.stage_events?.length ? process.stage_events.map((event) => (
              <div key={event.id} className="payment-history-row">
                <strong>{stageLabel(event.from_stage)}{' -> '}{stageLabel(event.to_stage)}</strong>
                <span>{formatDateTime(event.created_at)} . {event.created_by_name || '-'}</span>
                {event.comment ? <p>{event.comment}</p> : null}
                {event.alerts?.length ? <small>{event.alerts.length} alerta(s) registrados</small> : null}
              </div>
            )) : <div className="empty-state">Nenhuma transicao registrada.</div>}
          </div>
        ) : null}
      </aside>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div className="payment-info-item">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  )
}

function ImportsView({
  canManage,
  uploadFile,
  setUploadFile,
  uploading,
  importResult,
  handleImport,
}) {
  return (
    <section className="payment-import-page">
      <div className="toolbar-card payment-process-panel payment-import-card">
        <div className="payment-section-head">
          <div>
            <h2 className="section-title">Importação XLSX</h2>
            <p className="section-copy">Atualize processos historicos ou novas faturas por planilha.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => downloadUrl(paymentProcessesAPI.templateUrl())}>
            Modelo XLSX
          </button>
        </div>

        <form className="payment-process-import-form payment-workflow-import" onSubmit={handleImport}>
          <Field label="Planilha">
            <input
              type="file"
              className="app-input"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
            />
          </Field>
          <button className="app-button" type="submit" disabled={uploading || !canManage || !uploadFile}>
            {uploading ? 'Importando...' : 'Importar e atualizar'}
          </button>
        </form>
      </div>

      <div className="toolbar-card payment-process-panel payment-import-result-card">
        <div className="payment-section-head">
          <h2 className="section-title">Resultado</h2>
          <span className="muted">{importResult ? `${importResult.total_rows} linha(s)` : 'Aguardando importação'}</span>
        </div>
        {importResult ? (
          <div className="payment-import-result payment-import-result-grid">
            <span>{importResult.total_rows} linhas</span>
            <span>{importResult.created} criadas</span>
            <span>{importResult.updated} atualizadas</span>
            <span>{importResult.skipped} ignoradas</span>
            <span>{importResult.errors} erros</span>
          </div>
        ) : (
          <div className="empty-state">Nenhuma importação executada nesta sessão.</div>
        )}
      </div>
    </section>
  )
}

function ContractManagementView({ contracts, suppliers }) {
  const [filters, setFilters] = useState({ supplier_id: '', kind: '', status: '', search: '', horizon_months: 6 })
  const [selectedContractId, setSelectedContractId] = useState('')
  const [summary, setSummary] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState('')
  const [selectedKpi, setSelectedKpi] = useState(null)

  const filteredContracts = useMemo(() => {
    const term = filters.search.trim().toLowerCase()
    return contracts.filter((contract) => {
      if (filters.supplier_id && contract.supplier_id !== filters.supplier_id) return false
      if (filters.kind && contract.kind !== filters.kind) return false
      if (filters.status && contract.status !== filters.status) return false
      if (!term) return true
      return [contract.number, contract.supplier_name, contract.contract_type, contract.object_description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [contracts, filters])

  useEffect(() => {
    if (selectedContractId && filteredContracts.some((contract) => contract.id === selectedContractId)) return
    setSelectedContractId(filteredContracts[0]?.id || '')
  }, [filteredContracts, selectedContractId])

  useEffect(() => {
    let active = true
    async function loadSummary() {
      setLoadingSummary(true)
      setError('')
      try {
        const { data } = await paymentContractsAPI.managementSummary({
          horizon_months: filters.horizon_months,
          supplier_id: filters.supplier_id || undefined,
          kind: filters.kind || undefined,
          status: filters.status || undefined,
          search: filters.search || undefined,
        })
        if (active) setSummary(data)
      } catch (err) {
        if (active) setError(getApiErrorMessage(err, 'Não foi possível carregar a gestão dos contratos.'))
      } finally {
        if (active) setLoadingSummary(false)
      }
    }
    loadSummary()
    return () => {
      active = false
    }
  }, [filters])

  useEffect(() => {
    if (!selectedContractId) {
      setDetail(null)
      return undefined
    }
    let active = true
    async function loadDetail() {
      setLoadingDetail(true)
      setError('')
      try {
        const { data } = await paymentContractsAPI.management(selectedContractId, { horizon_months: filters.horizon_months })
        if (active) {
          setDetail(data)
          setSelectedKpi(null)
        }
      } catch (err) {
        if (active) setError(getApiErrorMessage(err, 'Não foi possível carregar a análise do contrato.'))
      } finally {
        if (active) setLoadingDetail(false)
      }
    }
    loadDetail()
    return () => {
      active = false
    }
  }, [filters.horizon_months, selectedContractId])

  const historyRows = useMemo(() => (detail?.monthly_history || []).map((row) => ({
    ...row,
    process_amount: toNumber(row.process_amount),
    operational_amount: toNumber(row.operational_amount),
    maintenance_amount: toNumber(row.maintenance_amount),
    total_amount: toNumber(row.total_amount),
    paid_amount: toNumber(row.paid_amount),
    pending_amount: toNumber(row.pending_amount),
  })), [detail])

  const projectionRows = useMemo(() => (detail?.monthly_projection || []).map((row) => ({
    ...row,
    projected_amount: toNumber(row.projected_amount),
    projected_balance: toNumber(row.projected_balance),
  })), [detail])

  const trendRows = useMemo(() => [
    ...historyRows.map((row) => ({ ...row, projected_amount: null, projected_balance: null, series_type: 'historico' })),
    ...projectionRows.map((row) => ({ ...row, total_amount: null, operational_amount: null, maintenance_amount: null, process_amount: null, series_type: 'projecao' })),
  ], [historyRows, projectionRows])

  const selectedKpiRows = useMemo(() => resolveKpiRows(selectedKpi, detail), [detail, selectedKpi])

  function updateFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  return (
    <section className="payment-management-page">
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="toolbar-card payment-process-panel payment-management-filters">
        <Field label="Fornecedor">
          <select className="app-select" value={filters.supplier_id} onChange={(event) => updateFilter({ supplier_id: event.target.value })}>
            <option value="">Todos</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </Field>
        <Field label="Tipo">
          <select className="app-select" value={filters.kind} onChange={(event) => updateFilter({ kind: event.target.value })}>
            {kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="app-select" value={filters.status} onChange={(event) => updateFilter({ status: event.target.value })}>
            <option value="">Todos</option>
            <option value="ACTIVE">Ativo</option>
            <option value="SUSPENDED">Suspenso</option>
            <option value="FINISHED">Finalizado</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </Field>
        <Field label="Horizonte">
          <select className="app-select" value={filters.horizon_months} onChange={(event) => updateFilter({ horizon_months: Number(event.target.value) })}>
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </select>
        </Field>
        <Field label="Busca">
          <input className="app-input" type="search" value={filters.search} onChange={(event) => updateFilter({ search: event.target.value })} placeholder="Contrato, fornecedor..." />
        </Field>
      </div>

      <div className="payment-management-layout">
        <aside className="toolbar-card payment-process-panel payment-management-sidebar">
          <div className="payment-section-head">
            <div>
              <h2 className="section-title">Ranking</h2>
              <span className="muted">{loadingSummary ? 'Carregando...' : `${summary?.total_contracts ?? filteredContracts.length} contrato(s)`}</span>
            </div>
          </div>
          <div className="payment-management-ranking">
            {(summary?.ranking || []).map((item) => (
              <button
                key={item.contract_id}
                type="button"
                className={`payment-management-rank-row ${selectedContractId === item.contract_id ? 'is-selected' : ''}`}
                onClick={() => setSelectedContractId(item.contract_id)}
              >
                <span>
                  <strong>{item.contract_number}</strong>
                  <small>{item.supplier_name || '-'}</small>
                </span>
                <span>{formatCurrency(item.available_balance)}</span>
                {item.alerts_count ? <small className="deadline-pill warning">{item.alerts_count}</small> : null}
              </button>
            ))}
            {!loadingSummary && !summary?.ranking?.length ? <div className="empty-state">Nenhum contrato para os filtros.</div> : null}
          </div>
        </aside>

        <div className="payment-management-main">
          <div className="toolbar-card payment-process-panel payment-management-contract-selector">
            <Field label="Contrato analisado">
              <select className="app-select" value={selectedContractId} onChange={(event) => setSelectedContractId(event.target.value)}>
                {filteredContracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>{contract.number} - {contract.supplier_name || '-'}</option>
                ))}
              </select>
            </Field>
            <div className="payment-management-source">
              <strong>{detail?.contract?.supplier_name || 'Selecione um contrato'}</strong>
              <span>{detail?.source_quality || 'Aguardando dados da análise.'}</span>
            </div>
          </div>

          {loadingDetail ? <div className="toolbar-card payment-process-panel empty-state">Carregando análise do contrato...</div> : null}
          {!loadingDetail && !detail ? <div className="toolbar-card payment-process-panel empty-state">Selecione um contrato para visualizar a gestao.</div> : null}

          {detail ? (
            <>
              <div className="payment-management-kpis">
                {detail.kpis.map((kpi) => (
                  <button key={kpi.key} type="button" className={`payment-management-kpi tone-${kpi.tone}`} onClick={() => setSelectedKpi(kpi)}>
                    <span>{kpi.label}</span>
                    <strong>{kpi.formatted || kpi.value || '-'}</strong>
                  </button>
                ))}
              </div>

              <div className="payment-management-charts">
                <section className="toolbar-card payment-process-panel payment-management-chart">
                  <div className="payment-section-head">
                    <h2 className="section-title">Histórico x projeção</h2>
                    <span className="muted">{detail.projected_depletion_label}</span>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <ComposedChart data={trendRows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(value) => compactMoney(value)} tick={{ fontSize: 11 }} width={58} />
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="total_amount" name="Financeiro" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Area dataKey="projected_amount" name="Projetado" fill="#f59e0b" stroke="#b45309" fillOpacity={0.2} />
                      <Line dataKey="projected_balance" name="Saldo previsto" stroke="#059669" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </section>

                <section className="toolbar-card payment-process-panel payment-management-chart">
                  <div className="payment-section-head">
                    <h2 className="section-title">Composicao mensal</h2>
                    <span className="muted">Pago, pendente e operacional</span>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={historyRows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(value) => compactMoney(value)} tick={{ fontSize: 11 }} width={58} />
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="paid_amount" name="Pago" stackId="financeiro" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="pending_amount" name="Pendente" stackId="financeiro" fill="#d97706" />
                      <Bar dataKey="operational_amount" name="Operacional" fill="#64748b" />
                      <Bar dataKey="maintenance_amount" name="Manutenção" fill="#dc2626" />
                    </BarChart>
                  </ResponsiveContainer>
                </section>
              </div>

              <section className="toolbar-card payment-process-panel">
                <div className="payment-section-head">
                  <h2 className="section-title">Tabela dinamica</h2>
                  <span className="muted">{selectedKpi ? selectedKpi.label : 'Processos recentes'}</span>
                </div>
                <ManagementDetailTable rows={selectedKpiRows} type={selectedKpi?.detail_type || 'processes'} />
              </section>
            </>
          ) : null}
        </div>
      </div>

      <KpiDrawer kpi={selectedKpi} detail={detail} rows={selectedKpiRows} onClose={() => setSelectedKpi(null)} />
    </section>
  )
}

function compactMoney(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  if (Math.abs(number) >= 1000000) return `R$ ${(number / 1000000).toFixed(1)} mi`
  if (Math.abs(number) >= 1000) return `R$ ${(number / 1000).toFixed(0)} mil`
  return `R$ ${number.toFixed(0)}`
}

function resolveKpiRows(kpi, detail) {
  if (!detail) return []
  if (!kpi) return detail.related_processes || []
  if (kpi.detail_type === 'operations') return detail.related_operations || []
  if (kpi.detail_type === 'projection') return detail.monthly_projection || []
  if (kpi.detail_type === 'alerts') return (detail.alerts || []).map((alert, index) => ({ id: index, label: alert, kind: 'alert' }))
  return detail.related_processes || []
}

function ManagementDetailTable({ rows, type }) {
  if (!rows?.length) return <div className="empty-state">Sem registros para o indicador selecionado.</div>

  if (type === 'projection') {
    return (
      <div className="table-wrap table-wrap-wide">
        <table className="data-table payment-management-table">
          <thead><tr><th>Mes</th><th>Consumo projetado</th><th>Saldo previsto</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month || row.label}>
                <td>{row.label}</td>
                <td>{formatCurrency(row.projected_amount)}</td>
                <td>{formatCurrency(row.projected_balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (type === 'alerts') {
    return <div className="payment-alert-list">{rows.map((row) => <span key={row.id}>{row.label}</span>)}</div>
  }

  return (
    <div className="table-wrap table-wrap-wide">
      <table className="data-table payment-management-table">
        <thead><tr><th>Registro</th><th>Data</th><th>Valor</th><th>Status</th><th>Detalhe</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.kind}-${row.id}`}>
              <td><strong>{row.label}</strong><br /><span className="muted">{row.kind}</span></td>
              <td>{formatDate(row.date)}</td>
              <td>{formatCurrency(row.amount)}</td>
              <td>{row.status || '-'}</td>
              <td>{row.detail || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KpiDrawer({ kpi, detail, rows, onClose }) {
  useEffect(() => {
    if (!kpi) return undefined
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [kpi, onClose])

  if (!kpi) return null

  return (
    <div className="payment-detail-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="toolbar-card payment-process-panel payment-detail-panel payment-detail-drawer payment-kpi-drawer" role="dialog" aria-modal="true" aria-labelledby="payment-kpi-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="payment-detail-header">
          <div>
            <span className="muted">Indicador</span>
            <h2 id="payment-kpi-title" className="section-title">{kpi.label}</h2>
          </div>
          <button type="button" className="icon-button payment-detail-close" aria-label="Fechar indicador" onClick={onClose}>&times;</button>
        </div>

        <div className="payment-management-kpi-drawer-value">
          <span>{detail?.contract?.number || '-'}</span>
          <strong>{kpi.formatted || kpi.value || '-'}</strong>
        </div>

        <div className="payment-detail-grid">
          <Info label="Formula" value={kpi.formula} />
          <Info label="Fonte" value={kpi.source} />
          <Info label="Qualidade" value={detail?.source_quality} />
          <Info label="Media mensal" value={formatCurrency(detail?.average_monthly_consumption)} />
          <Info label="Variação" value={formatPercent(detail?.monthly_variation_percentage)} />
          <Info label="Fim do saldo" value={detail?.projected_depletion_label} />
        </div>

        <ManagementDetailTable rows={rows} type={kpi.detail_type} />
      </aside>
    </div>
  )
}

function ContractsView({
  canManage,
  contracts,
  suppliers,
  selectedContract,
  setSelectedContract,
  contractForm,
  setContractForm,
  editingContractId,
  saveContract,
  contractDrawerOpen,
  openCreateContract,
  closeContractDrawer,
  editContract,
  cancelContract,
  amendmentForm,
  setAmendmentForm,
  createAmendment,
}) {
  return (
    <>
      <section className="payment-workspace payment-contract-workspace">
        <div className="toolbar-card payment-process-panel payment-process-list-panel">
          <div className="payment-section-head">
            <div>
              <h2 className="section-title">Contratos</h2>
              <span className="muted">{contracts.length} contrato(s)</span>
            </div>
            {canManage ? <button className="app-button" type="button" onClick={openCreateContract}>Novo contrato</button> : null}
          </div>
          <div className="table-wrap table-wrap-wide">
            <table className="data-table payment-contract-table">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Número</th>
                  <th>Status</th>
                  <th>Vigencia</th>
                  <th>Atualizado</th>
                  <th>Consumido</th>
                  <th>Pago</th>
                  <th>Pendente</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state">Nenhum contrato cadastrado.</div></td></tr>
                ) : contracts.map((contract) => (
                  <tr key={contract.id} className={selectedContract?.id === contract.id ? 'is-selected' : ''} onClick={() => setSelectedContract(contract)}>
                    <td data-label="Fornecedor"><strong>{contract.supplier_name || '-'}</strong><br /><span className="muted">{kindLabel(contract.kind)}</span></td>
                    <td data-label="Número"><strong>{contract.number}</strong><br /><span className="muted">{contract.contract_type || '-'}</span></td>
                    <td data-label="Status"><span className={`status-badge status-${statusTone(contract.status)}`}>{contract.status}</span></td>
                    <td data-label="Vigencia">{formatDate(contract.valid_from)} a {formatDate(contract.valid_until)}</td>
                    <td data-label="Atualizado">{formatCurrency(contract.value_updated)}</td>
                    <td data-label="Consumido">{formatCurrency(contract.consumed_amount)}</td>
                    <td data-label="Pago">{formatCurrency(contract.paid_amount)}</td>
                    <td data-label="Pendente">{formatCurrency(contract.pending_amount)}</td>
                    <td data-label="Saldo"><strong>{formatCurrency(contract.available_balance)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="toolbar-card payment-process-panel payment-detail-panel payment-contract-detail-panel">
          {selectedContract ? (
            <>
              <div className="payment-detail-header">
                <div>
                  <span className="muted">{selectedContract.supplier_name || '-'}</span>
                  <h2 className="section-title">{selectedContract.number}</h2>
                </div>
                <span className={`status-badge status-${statusTone(selectedContract.status)}`}>{selectedContract.status}</span>
              </div>

              <div className="payment-detail-grid">
                <Info label="Valor atualizado" value={formatCurrency(selectedContract.value_updated)} />
                <Info label="Consumido" value={formatCurrency(selectedContract.consumed_amount)} />
                <Info label="Pago" value={formatCurrency(selectedContract.paid_amount)} />
                <Info label="Pendente" value={formatCurrency(selectedContract.pending_amount)} />
                <Info label="Saldo" value={formatCurrency(selectedContract.available_balance)} />
                <Info label="Vigencia" value={`${formatDate(selectedContract.valid_from)} a ${formatDate(selectedContract.valid_until)}`} />
              </div>

              <div className="actions-inline">
                {canManage ? <button className="secondary-button" type="button" onClick={() => editContract(selectedContract)}>Editar contrato</button> : null}
                {canManage ? <button className="ghost-button" type="button" onClick={() => cancelContract(selectedContract.id)}>Cancelar</button> : null}
              </div>

              <div className="payment-contract-detail">
                <div className="payment-section-head">
                  <h3 className="section-title">Aditivos</h3>
                  <span className="muted">{selectedContract.amendments?.length || 0} registro(s)</span>
                </div>

                {selectedContract.amendments?.length ? (
                  <div className="payment-history-list">
                    {selectedContract.amendments.map((amendment) => (
                      <div key={amendment.id} className="payment-history-row">
                        <strong>{amendment.number || amendment.amendment_type || 'Aditivo'}</strong>
                        <span>{formatDate(amendment.signed_at)} . {formatCurrency(amendment.value_delta)}</span>
                        {amendment.notes ? <p>{amendment.notes}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : <div className="empty-state">Nenhum aditivo registrado.</div>}

                {canManage ? (
                  <form className="payment-amendment-form" onSubmit={createAmendment}>
                    <h3 className="section-title">Novo aditivo</h3>
                    <div className="payment-form-grid two">
                      <Field label="Tipo"><input className="app-input" value={amendmentForm.amendment_type} onChange={(event) => setAmendmentForm((current) => ({ ...current, amendment_type: event.target.value }))} /></Field>
                      <Field label="Número"><input className="app-input" value={amendmentForm.number} onChange={(event) => setAmendmentForm((current) => ({ ...current, number: event.target.value }))} /></Field>
                      <Field label="Assinatura"><input className="app-input" type="date" value={amendmentForm.signed_at} onChange={(event) => setAmendmentForm((current) => ({ ...current, signed_at: event.target.value }))} /></Field>
                      <Field label="Delta valor"><input className="app-input" type="number" step="0.01" value={amendmentForm.value_delta} onChange={(event) => setAmendmentForm((current) => ({ ...current, value_delta: event.target.value }))} /></Field>
                      <Field label="Nova vigência"><input className="app-input" type="date" value={amendmentForm.valid_until} onChange={(event) => setAmendmentForm((current) => ({ ...current, valid_until: event.target.value }))} /></Field>
                    </div>
                    <Field label="Observação">
                      <textarea className="app-textarea" value={amendmentForm.notes} onChange={(event) => setAmendmentForm((current) => ({ ...current, notes: event.target.value }))} />
                    </Field>
                    <button className="secondary-button" type="submit">Registrar aditivo</button>
                  </form>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty-state">Selecione um contrato para ver saldo, consumo e aditivos.</div>
          )}
        </aside>
      </section>

      <ContractFormDrawer
        open={contractDrawerOpen}
        canManage={canManage}
        suppliers={suppliers}
        contractForm={contractForm}
        setContractForm={setContractForm}
        editingContractId={editingContractId}
        saveContract={saveContract}
        onClose={closeContractDrawer}
      />
    </>
  )
}

function ContractFormDrawer({
  open,
  canManage,
  suppliers,
  contractForm,
  setContractForm,
  editingContractId,
  saveContract,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="payment-detail-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="toolbar-card payment-process-panel payment-detail-panel payment-detail-drawer payment-contract-form-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-contract-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="payment-detail-header">
          <div>
            <span className="muted">Gestão de contratos</span>
            <h2 id="payment-contract-form-title" className="section-title">{editingContractId ? 'Editar contrato' : 'Novo contrato'}</h2>
          </div>
          <button type="button" className="icon-button payment-detail-close" aria-label="Fechar contrato" onClick={onClose}>
            &times;
          </button>
        </div>

        <form className="payment-process-form payment-structured-form" onSubmit={saveContract}>
          <FormSection title="Dados basicos">
            <Field label="Fornecedor">
              <select className="app-select" value={contractForm.supplier_id} onChange={(event) => setContractForm((current) => ({ ...current, supplier_id: event.target.value }))} required disabled={!canManage}>
                <option value="">Selecione</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </Field>
            <div className="payment-form-grid two">
              <Field label="Número">
                <input className="app-input" value={contractForm.number} onChange={(event) => setContractForm((current) => ({ ...current, number: event.target.value }))} required disabled={!canManage} />
              </Field>
              <Field label="Tipo">
                <select className="app-select" value={contractForm.kind} onChange={(event) => setContractForm((current) => ({ ...current, kind: event.target.value }))} disabled={!canManage}>
                  {kindOptions.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Natureza">
                <input className="app-input" value={contractForm.contract_type} onChange={(event) => setContractForm((current) => ({ ...current, contract_type: event.target.value }))} disabled={!canManage} />
              </Field>
              <Field label="Status">
                <select className="app-select" value={contractForm.status} onChange={(event) => setContractForm((current) => ({ ...current, status: event.target.value }))} disabled={!canManage}>
                  <option value="ACTIVE">Ativo</option>
                  <option value="SUSPENDED">Suspenso</option>
                  <option value="FINISHED">Finalizado</option>
                  <option value="CANCELLED">Cancelado</option>
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Vigencia e valores">
            <div className="payment-form-grid two">
              <Field label="Inicio">
                <input className="app-input" type="date" value={contractForm.valid_from} onChange={(event) => setContractForm((current) => ({ ...current, valid_from: event.target.value }))} disabled={!canManage} />
              </Field>
              <Field label="Fim">
                <input className="app-input" type="date" value={contractForm.valid_until} onChange={(event) => setContractForm((current) => ({ ...current, valid_until: event.target.value }))} disabled={!canManage} />
              </Field>
              <Field label="Valor inicial">
                <input className="app-input" type="number" step="0.01" value={contractForm.value_initial} onChange={(event) => setContractForm((current) => ({ ...current, value_initial: event.target.value }))} disabled={!canManage} />
              </Field>
              <Field label="Valor atualizado">
                <input className="app-input" type="number" step="0.01" value={contractForm.value_updated} onChange={(event) => setContractForm((current) => ({ ...current, value_updated: event.target.value }))} disabled={!canManage} />
              </Field>
              <Field label="Saldo importado (legado)">
                <input
                  className="app-input"
                  type="number"
                  step="0.01"
                  value={contractForm.imported_balance}
                  disabled
                  title="Campo legado da importação. O saldo vivo agora e calculado automaticamente pelos processos vinculados."
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Objeto e observações">
            <Field label="Objeto">
              <textarea className="app-textarea" value={contractForm.object_description} onChange={(event) => setContractForm((current) => ({ ...current, object_description: event.target.value }))} disabled={!canManage} />
            </Field>
            <Field label="Notas">
              <textarea className="app-textarea" value={contractForm.notes} onChange={(event) => setContractForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canManage} />
            </Field>
          </FormSection>

          {canManage ? (
            <div className="actions-inline modal-actions">
              <button className="app-button" type="submit">{editingContractId ? 'Atualizar contrato' : 'Criar contrato'}</button>
            </div>
          ) : null}
        </form>
      </aside>
    </div>
  )
}

function SuppliersView({
  canManage,
  suppliers,
  supplierForm,
  setSupplierForm,
  editingSupplierId,
  setEditingSupplierId,
  saveSupplier,
  editSupplier,
  disableSupplier,
}) {
  return (
    <section className="payment-workspace">
      <div className="toolbar-card payment-process-panel payment-process-list-panel">
        <h2 className="section-title">Fornecedores</h2>
        <div className="payment-supplier-list">
          {suppliers.map((supplier) => (
            <div key={supplier.id} className="payment-supplier-row">
              <span>
                <strong>{supplier.name}</strong>
                <small>{supplier.cnpj || 'CNPJ não informado'}</small>
              </span>
              <span className={`status-badge status-${statusTone(supplier.active ? 'ACTIVE' : 'CANCELLED')}`}>{supplier.active ? 'Ativo' : 'Inativo'}</span>
              <div className="actions-inline">
                {canManage ? <button className="mini-button" type="button" onClick={() => editSupplier(supplier)}>Editar</button> : null}
                {canManage && supplier.active ? <button className="mini-button" type="button" onClick={() => disableSupplier(supplier.id)}>Inativar</button> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="toolbar-card payment-process-panel payment-detail-panel">
        <h2 className="section-title">{editingSupplierId ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
        <form className="payment-process-form" onSubmit={saveSupplier}>
          <Field label="Nome">
            <input className="app-input" value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} required disabled={!canManage} />
          </Field>
          <Field label="CNPJ">
            <input className="app-input" value={supplierForm.cnpj} onChange={(event) => setSupplierForm((current) => ({ ...current, cnpj: event.target.value }))} disabled={!canManage} />
          </Field>
          <Field label="Observações">
            <textarea className="app-textarea" value={supplierForm.notes} onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canManage} />
          </Field>
          {canManage ? (
            <div className="actions-inline">
              <button className="app-button" type="submit">{editingSupplierId ? 'Atualizar fornecedor' : 'Criar fornecedor'}</button>
              {editingSupplierId ? <button className="ghost-button" type="button" onClick={() => { setEditingSupplierId(''); setSupplierForm(emptySupplierForm) }}>Novo</button> : null}
            </div>
          ) : null}
        </form>
      </aside>
    </section>
  )
}
