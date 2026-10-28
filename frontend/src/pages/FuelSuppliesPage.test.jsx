import { reviewGuidedForm } from '../test/guidedForms'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FuelSuppliesPage from './FuelSuppliesPage'
import { exportRowsToXlsx } from '../utils/exportData'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  listOrganizations: vi.fn(),
  listStations: vi.fn(),
  listSupplies: vi.fn(),
  listOrders: vi.fn(),
  listOpen: vi.fn(),
  getOrder: vi.fn(),
  canCreate: vi.fn(),
  canView: vi.fn(),
}))

vi.mock('../api/client', () => ({ default: { get: mocks.get } }))
vi.mock('../api/masterData', () => ({
  masterDataAPI: { listOrganizations: mocks.listOrganizations },
}))
vi.mock('../api/fuelStations', () => ({
  fuelStationsAPI: { list: mocks.listStations },
}))
vi.mock('../api/fuelSupplies', () => ({
  fuelSuppliesAPI: { list: mocks.listSupplies },
}))
vi.mock('../api/fuelSupplyOrders', () => ({
  fuelSupplyOrdersAPI: {
    list: mocks.listOrders,
    listOpen: mocks.listOpen,
    getById: mocks.getOrder,
    listAllForReport: vi.fn(),
    cancel: vi.fn(),
  },
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    canCreate: mocks.canCreate,
    canEdit: () => true,
    canView: mocks.canView,
    isAdmin: true,
    isProduction: false,
  }),
}))
vi.mock('../components/Modal', () => ({
  default: ({ open, title, children, onClose }) => (open ? <section role="dialog" aria-label={title}><button onClick={onClose}>Fechar</button>{children}</section> : null),
}))
vi.mock('../components/FuelSupplyOrderCreateForm', () => ({ default: () => <div>Formulário de nova ordem</div> }))
vi.mock('../components/FuelSupplyOrderBatchCreateForm', () => ({ default: () => <div>Formulário de ordens em lote</div> }))
vi.mock('../components/FuelSupplyOrderConfirmForm', () => ({ default: ({ order, onSuccess, onClose }) => <><p>Confirmação de {order.id}</p><button onClick={() => { onSuccess('Abastecimento confirmado no teste'); onClose() }}>Salvar confirmação de teste</button></> }))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [] }) }))
vi.mock('../components/DocumentSignaturePanel', () => ({ default: ({ sourceId }) => <div>Assinatura de {sourceId}</div> }))
vi.mock('../components/GuidedTour', () => ({
  default: ({ replayToken }) => <div data-testid="fuel-batch-guided-tour">Tour de lote {replayToken}</div>,
}))
vi.mock('../utils/fuelSupplyOrderDocument', () => ({
  downloadFuelSupplyOrderDocument: vi.fn(),
  previewFuelSupplyOrderDocument: vi.fn(),
}))
vi.mock('../utils/exportData', () => ({
  exportRowsToXlsx: vi.fn(),
  previewRowsToPdf: vi.fn(),
}))

function LocationProbe() {
  const location = useLocation(); const navigate = useNavigate()
  return <><output data-testid="location">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Voltar no navegador</button><button onClick={() => navigate(1)}>Avançar no navegador</button></>
}

function renderPage(initialEntry = '/abastecimentos?acao=nova-ordem') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/abastecimentos" element={<><FuelSuppliesPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

const paged = (rows) => ({ data: { data: rows, pagination: { page: 1, pages: 1, total: rows.length, limit: 10 } } })

describe('FuelSuppliesPage quick order action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canCreate.mockReturnValue(true)
    mocks.canView.mockReturnValue(true)
    mocks.get.mockResolvedValue({ data: [] })
    mocks.listOrganizations.mockResolvedValue({ data: [] })
    mocks.listStations.mockResolvedValue({ data: [] })
    mocks.listSupplies.mockResolvedValue(paged([]))
    mocks.listOrders.mockResolvedValue(paged([]))
    mocks.listOpen.mockResolvedValue(paged([]))
    mocks.getOrder.mockResolvedValue({ data: { id: 'focus-test' } })
  })

  it('abre o formulário oficial e remove apenas o comando da URL', async () => {
    renderPage('/abastecimentos?acao=nova-ordem&origem=mobile')

    expect(await screen.findByRole('dialog', { name: 'Nova ordem de abastecimento' })).toHaveTextContent('Formulário de nova ordem')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/abastecimentos\?origem=mobile$/))
    expect(screen.getByTestId('location')).not.toHaveTextContent('acao=nova-ordem')
  })

  it('não abre o formulário quando o perfil não pode criar ordens', async () => {
    mocks.canCreate.mockReturnValue(false)

    renderPage()

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/abastecimentos$/))
    expect(screen.queryByRole('dialog', { name: 'Nova ordem de abastecimento' })).not.toBeInTheDocument()
  })

  it('abre o lote e inicia o guia pela URL de novidade', async () => {
    renderPage('/abastecimentos?acao=nova-ordem-lote&guia=1&origem=novidade')

    expect(await screen.findByRole('dialog', { name: 'Nova ordem de abastecimento em lote' })).toHaveTextContent('Formulário de ordens em lote')
    expect(screen.getByTestId('fuel-batch-guided-tour')).toHaveTextContent('Tour de lote 1')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/abastecimentos\?origem=novidade$/))
  })

  it('oferece o guia rápido manualmente para quem pode emitir ordens', async () => {
    renderPage('/abastecimentos')

    fireEvent.click(screen.getByRole('button', { name: 'Mais ações de abastecimentos' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ver guia rápido' }))

    expect(screen.getByRole('dialog', { name: 'Nova ordem de abastecimento em lote' })).toBeInTheDocument()
    expect(screen.getByTestId('fuel-batch-guided-tour')).toHaveTextContent('Tour de lote 1')
  })

  it('mostra apenas ordens na entrada e só consulta o histórico ao selecioná-lo', async () => {
    renderPage('/abastecimentos?origem=menu')
    await waitFor(() => expect(mocks.listOrders).toHaveBeenCalled())
    expect(screen.getByRole('region', { name: 'Ordens de abastecimento' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Histórico de abastecimentos' })).not.toBeInTheDocument()
    expect(mocks.listSupplies).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Histórico', exact: true }))
    await waitFor(() => expect(mocks.listSupplies).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Ordens de abastecimento' })).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('origem=menu&view=history')
  })

  it('preserva busca, filtros e página de ordens ao ir ao histórico e voltar', async () => {
    mocks.listOrders.mockImplementation(async ({ page }) => ({ data: { data: [{ id: `ordem-${page}`, status: 'OPEN' }],
      pagination: { page, pages: 3, total: 25, limit: 10 } } }))
    renderPage('/abastecimentos')
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar ordens' }), { target: { value: 'TESTE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Filtros', exact: true }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Situação das ordens' }), { target: { value: 'OPEN' } })
    await waitFor(() => expect(mocks.listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'TESTE', status: 'OPEN', page: 1 })))
    fireEvent.click(await screen.findByRole('button', { name: 'Página 2' }))
    await waitFor(() => expect(mocks.listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
    fireEvent.click(screen.getByRole('button', { name: 'Histórico', exact: true }))
    await screen.findByRole('region', { name: 'Histórico de abastecimentos' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar abastecimentos confirmados' }), { target: { value: 'ETANOL' } })
    await waitFor(() => expect(mocks.listSupplies).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'ETANOL' })))
    fireEvent.click(screen.getByRole('button', { name: 'Ordens', exact: true }))
    expect(screen.getByRole('textbox', { name: 'Buscar ordens' })).toHaveValue('TESTE')
    await waitFor(() => expect(mocks.listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, status: 'OPEN', search: 'TESTE' })))
    fireEvent.click(screen.getByRole('button', { name: 'Histórico', exact: true }))
    expect(screen.getByRole('textbox', { name: 'Buscar abastecimentos confirmados' })).toHaveValue('ETANOL')
  })

  it('abre links antigos de indicador no histórico e permanece nele ao limpar o KPI', async () => {
    const response = paged([])
    response.data.indicators = { items: [{ key: 'total', label: 'Abastecimentos', value: 221, unit: 'count' },
      { key: 'alerts', label: 'Com alerta de consumo', value: 135, unit: 'count' }] }
    mocks.listSupplies.mockResolvedValue(response)
    renderPage('/abastecimentos?indicator=alerts&origem=painel')
    await waitFor(() => expect(mocks.listSupplies).toHaveBeenCalledWith(expect.objectContaining({ indicator: 'alerts' })))
    expect(mocks.listOrders).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Limpar indicador' }))
    expect(screen.getByTestId('location')).toHaveTextContent('origem=painel&view=history')
    await waitFor(() => expect(mocks.listSupplies).toHaveBeenLastCalledWith(expect.objectContaining({ indicator: undefined })))
    expect(screen.getByRole('region', { name: 'Histórico de abastecimentos' })).toBeInTheDocument()
  })

  it('mantém o contexto e o retorno ao contrato ao alternar as áreas', async () => {
    renderPage('/abastecimentos?contract_id=contrato-teste&return_to=%2Fprocessos-pagamento%3Fcontract_id%3Dcontrato-teste')
    fireEvent.click(screen.getByRole('button', { name: 'Histórico', exact: true }))
    expect(screen.getByTestId('location')).toHaveTextContent('contract_id=contrato-teste&return_to=')
    expect(screen.getByRole('link', { name: 'Voltar ao contrato' })).toHaveAttribute('href', '/processos-pagamento?contract_id=contrato-teste')
    fireEvent.click(screen.getByRole('button', { name: 'Ordens', exact: true }))
    expect(screen.getByTestId('location')).toHaveTextContent('view=orders')
    expect(screen.getByRole('link', { name: 'Voltar ao contrato' })).toBeInTheDocument()
  })

  it('consulta somente histórico quando o perfil não pode ver ordens', async () => {
    mocks.canView.mockImplementation((module) => module === 'fuel_supplies')
    renderPage('/abastecimentos?view=orders')
    await waitFor(() => expect(mocks.listSupplies).toHaveBeenCalled())
    expect(mocks.listOrders).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Ordens', exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exportar ordens' })).not.toBeInTheDocument()
  })

  it('ignora erro tardio da área anterior depois de trocar a listagem', async () => {
    let rejectOrders
    mocks.listOrders.mockImplementation(() => new Promise((_resolve, reject) => { rejectOrders = reject }))
    renderPage('/abastecimentos')
    await waitFor(() => expect(rejectOrders).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Histórico', exact: true }))
    await waitFor(() => expect(mocks.listSupplies).toHaveBeenCalled())
    rejectOrders(new Error('Falha tardia das ordens'))
    await waitFor(() => expect(screen.queryByText('Falha tardia das ordens')).not.toBeInTheDocument())
    expect(screen.getByRole('region', { name: 'Histórico de abastecimentos' })).toBeInTheDocument()
  })

  it('carrega Ordens abertas sob demanda, incorpora a confirmação e atualiza somente essa consulta', async () => {
    mocks.listOpen.mockResolvedValue(paged([{ id:'aberta-teste',vehicle_plate:'TST0001',status:'OPEN' }]))
    renderPage('/abastecimentos')
    await waitFor(()=>expect(mocks.listOrders).toHaveBeenCalled())
    expect(mocks.listOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'Ordens abertas',exact:true}))
    await waitFor(()=>expect(mocks.listOpen).toHaveBeenCalled())
    expect(screen.getByRole('region',{name:'Ordens abertas'})).toBeInTheDocument()
    expect(screen.queryByRole('region',{name:'Ordens de abastecimento'})).not.toBeInTheDocument()
    expect(screen.queryByRole('heading',{name:'Ordens de abastecimento abertas'})).not.toBeInTheDocument()
    reviewGuidedForm()
  fireEvent.click(await screen.findByRole('button',{name:'Confirmar abastecimento', hidden: true }))
    expect(screen.getByRole('dialog',{name:'Confirmar abastecimento'})).toHaveTextContent('Confirmação de aberta-teste')
    reviewGuidedForm()
  fireEvent.click(screen.getByRole('button',{name:'Salvar confirmação de teste', hidden: true }))
    await waitFor(()=>expect(mocks.listOpen).toHaveBeenCalledTimes(2))
    expect(mocks.listOrders).toHaveBeenCalledTimes(1);expect(mocks.listSupplies).not.toHaveBeenCalled()
  })

  it('não leva o erro da consulta geral para a operação aberta', async () => {
    mocks.listOrders.mockRejectedValue({response:{status:500,data:{detail:'Falha nas ordens gerais'}}})
    renderPage('/abastecimentos')
    await screen.findByText(/Falha nas ordens gerais/)
    fireEvent.click(screen.getByRole('button',{name:'Ordens abertas',exact:true}))
    await waitFor(()=>expect(mocks.listOpen).toHaveBeenCalled())
    expect(screen.queryByText(/Falha nas ordens gerais/)).not.toBeInTheDocument()
  })

  it('preserva a busca e a página de abertas, suspendendo consultas fora da aba', async () => {
    mocks.listOpen.mockImplementation(async({page})=>({data:{data:[],pagination:{page,pages:3,total:25,limit:10}}}))
    renderPage('/abastecimentos?view=open')
    fireEvent.change(screen.getByRole('textbox',{name:'Buscar ordens abertas'}),{target:{value:'TST0001'}})
    await waitFor(()=>expect(mocks.listOpen).toHaveBeenLastCalledWith(expect.objectContaining({search:'TST0001',page:1})))
    fireEvent.click(await screen.findByRole('button',{name:'Página 2'}))
    await waitFor(()=>expect(mocks.listOpen).toHaveBeenLastCalledWith(expect.objectContaining({page:2})))
    const before=mocks.listOpen.mock.calls.length
    fireEvent.click(screen.getByRole('button',{name:'Histórico',exact:true}))
    await waitFor(()=>expect(mocks.listSupplies).toHaveBeenCalled())
    expect(screen.queryByRole('region',{name:'Ordens abertas'})).not.toBeInTheDocument()
    expect(mocks.listOpen).toHaveBeenCalledTimes(before)
    fireEvent.click(screen.getByRole('button',{name:'Ordens abertas',exact:true}))
    expect(screen.getByRole('textbox',{name:'Buscar ordens abertas'})).toHaveValue('TST0001')
    await waitFor(()=>expect(mocks.listOpen).toHaveBeenLastCalledWith(expect.objectContaining({page:2,search:'TST0001'})))
  })

  it('mantém o perfil somente ordens sem histórico, emissão ou consultas dos cadastros gerais', async () => {
    mocks.canView.mockImplementation((module)=>module==='fuel_supply_orders')
    renderPage('/abastecimentos?view=history')
    await waitFor(()=>expect(mocks.listOpen).toHaveBeenCalled())
    expect(screen.queryByRole('button',{name:'Ordens',exact:true})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Histórico',exact:true})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Nova ordem',exact:true})).not.toBeInTheDocument()
    expect(mocks.listSupplies).not.toHaveBeenCalled();expect(mocks.listOrders).not.toHaveBeenCalled()
    expect(mocks.listStations).not.toHaveBeenCalled();expect(mocks.listOrganizations).not.toHaveBeenCalled()
    expect(mocks.get).not.toHaveBeenCalledWith('/vehicles/options')
  })

  it('mantém o perfil somente histórico sem consultar ordens abertas', async () => {
    mocks.canView.mockImplementation((module)=>module==='fuel_supplies')
    renderPage('/abastecimentos?view=open')
    await waitFor(()=>expect(mocks.listSupplies).toHaveBeenCalled())
    expect(screen.queryByRole('button',{name:'Ordens abertas',exact:true})).not.toBeInTheDocument()
    expect(mocks.listOpen).not.toHaveBeenCalled();expect(mocks.listOrders).not.toHaveBeenCalled()
  })

  it('abre a assinatura pelo foco e remove apenas esse foco ao fechar', async () => {
    mocks.getOrder.mockResolvedValue({data:{id:'assinatura-teste'}})
    renderPage('/abastecimentos?view=open&focus=assinatura-teste&origem=pendencia')
    expect(await screen.findByRole('dialog',{name:'Assinatura da ordem'})).toHaveTextContent('Assinatura de assinatura-teste')
    expect(mocks.getOrder).toHaveBeenCalledWith('assinatura-teste')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Fechar',exact:true}))
    expect(screen.getByTestId('location')).toHaveTextContent('view=open&origem=pendencia')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('separa os indicadores das abertas e do histórico', async () => {
    const response=paged([]);response.data.indicators={items:[{key:'total',label:'Ordens',value:12},
      {key:'due_today',label:'Vencem hoje',value:2}]}
    mocks.listOpen.mockResolvedValue(response)
    renderPage('/abastecimentos?view=open&indicator=alerts&open_indicator=due_today')
    await waitFor(()=>expect(mocks.listOpen).toHaveBeenCalledWith(expect.objectContaining({indicator:'due_today'})))
    fireEvent.click(await screen.findByRole('button',{name:'Limpar indicador'}))
    expect(screen.getByTestId('location')).toHaveTextContent('view=open&indicator=alerts')
    fireEvent.click(screen.getByRole('button',{name:'Histórico',exact:true}))
    await waitFor(()=>expect(mocks.listSupplies).toHaveBeenCalledWith(expect.objectContaining({indicator:'alerts'})))
  })
})

describe('FuelSuppliesPage common vehicle and entity filters', () => {
  const vehicles = [{ id: 'vehicle-a', plate: 'TST1A23', brand: 'Marca', model: 'Modelo', current_department: 'Frota de teste' },
    { id: 'vehicle-b', plate: 'TST9B87', brand: 'Marca', model: 'Modelo', current_department: 'Frota de teste' }]
  const stations = [{ id: 'station-a', name: 'Posto de teste' }]
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canCreate.mockReturnValue(true); mocks.canView.mockReturnValue(true)
    mocks.get.mockReset().mockImplementation(async (url) => ({ data: url === '/vehicles/options' ? vehicles : [] }))
    mocks.listStations.mockReset().mockResolvedValue({ data: stations })
    mocks.listOrganizations.mockReset().mockResolvedValue({ data: [{ id: 'organization-a', name: 'Secretaria de teste' }] })
    mocks.listSupplies.mockReset().mockResolvedValue(paged([]))
    mocks.listOrders.mockReset().mockResolvedValue(paged([]))
    mocks.listOpen.mockReset().mockResolvedValue(paged([]))
    mocks.getOrder.mockReset().mockResolvedValue({ data: { id: 'focus-test' } })
  })
  function openFilters() { fireEvent.click(screen.getByRole('button', { name: /^Filtros/ })) }
  async function chooseVehicle(plate) {
    fireEvent.click(screen.getByRole('button', { name: /^Filtrar veículo:/ }))
    fireEvent.change(screen.getByPlaceholderText('Buscar veículo por placa, marca ou modelo'), { target: { value: plate } })
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${plate} ·`) }))
  }

  it('leva o veículo escolhido às três áreas, mantendo as buscas específicas', async () => {
    renderPage('/abastecimentos?origem=teste')
    await waitFor(() => expect(mocks.listOrders).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar ordens' }), { target: { value: 'solicitante' } })
    openFilters(); await chooseVehicle('TST1A23')
    await waitFor(() => expect(mocks.listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-a', search: 'solicitante', page: 1 })))
    fireEvent.click(screen.getByRole('button', { name: 'Ordens abertas', exact: true }))
    await waitFor(() => expect(mocks.listOpen).toHaveBeenLastCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-a' })))
    openFilters()
    expect(screen.getByRole('button', { name: /^Filtrar veículo: TST1A23/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Histórico', exact: true }))
    await waitFor(() => expect(mocks.listSupplies).toHaveBeenLastCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-a' })))
    fireEvent.click(screen.getByRole('button', { name: 'Ordens', exact: true }))
    expect(screen.getByRole('textbox', { name: 'Buscar ordens' })).toHaveValue('solicitante')
    expect(screen.getByTestId('location')).toHaveTextContent('origem=teste&vehicle_id=vehicle-a&view=orders')
  })

  it.each([['orders', 'listOrders'], ['open', 'listOpen']])('reinicia a página ao trocar o veículo em %s e recebe KPIs globais filtrados', async (view, apiName) => {
    mocks[apiName].mockImplementation(async ({ page, vehicle_id }) => ({ data: { data: [], pagination: { page, pages: 3, total: vehicle_id ? 14 : 50 },
      indicators: { items: [{ key: 'total', label: 'Ordens', value: vehicle_id ? 14 : 50 }] } } }))
    renderPage(`/abastecimentos?view=${view}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Página 2' }))
    await waitFor(() => expect(mocks[apiName]).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
    openFilters(); await chooseVehicle('TST1A23')
    await waitFor(() => expect(mocks[apiName]).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, vehicle_id: 'vehicle-a' })))
    expect(await screen.findByRole('button', { name: 'Ordens 14' })).toBeInTheDocument()
  })

  it('mantém o filtro no relatório completo de ordens', async () => {
    const { fuelSupplyOrdersAPI } = await import('../api/fuelSupplyOrders')
    mocks.listOrders.mockResolvedValue(paged([{ id: 'order-a', vehicle_plate: 'TST1A23' }]))
    fuelSupplyOrdersAPI.listAllForReport.mockResolvedValue([{ id: 'order-a', vehicle_plate: 'TST1A23' }])
    renderPage('/abastecimentos?view=orders&vehicle_id=vehicle-a')
    await waitFor(() => expect(mocks.listOrders).toHaveBeenCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-a' })))
    fireEvent.click(screen.getByRole('button', { name: 'Exportar ordens' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exportar XLSX' }))
    await waitFor(() => expect(fuelSupplyOrdersAPI.listAllForReport).toHaveBeenCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-a' })))
    expect(exportRowsToXlsx).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ vehicle_plate: 'TST1A23' })] }))
  })

  it('combina veículo, secretaria, posto, situação e datas nas ordens', async () => {
    renderPage('/abastecimentos?view=orders'); openFilters(); await chooseVehicle('TST1A23')
    fireEvent.click(screen.getByRole('button', { name: /^Filtrar secretaria:/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Secretaria de teste', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: /^Filtrar posto:/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Posto de teste', exact: true }))
    fireEvent.change(screen.getByLabelText('Situação das ordens'), { target: { value: 'OPEN' } })
    fireEvent.change(screen.getByLabelText('Data inicial da emissão'), { target: { value: '2026-10-01' } })
    await waitFor(() => expect(mocks.listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-a', organization_id: 'organization-a', fuel_station_id: 'station-a', status: 'OPEN', created_from: expect.any(String) })))
  })

  it('carrega o catálogo autorizado de postos sob demanda nas abertas e combina os filtros no servidor', async () => {
    renderPage('/abastecimentos?view=open'); openFilters(); await chooseVehicle('TST1A23')
    expect(mocks.listStations).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Filtrar posto:/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Posto de teste', exact: true }))
    await waitFor(() => expect(mocks.listOpen).toHaveBeenLastCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-a', fuel_station_id: 'station-a' })))
    expect(mocks.listOrders).not.toHaveBeenCalled(); expect(mocks.listSupplies).not.toHaveBeenCalled()
  })

  it('ao limpar um link antigo de veículo permanece no histórico e remove o UUID da URL', async () => {
    renderPage('/abastecimentos?vehicle_id=vehicle-a&origem=emprestimo&indicator=alerts')
    await waitFor(() => expect(mocks.listSupplies).toHaveBeenCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-a' })))
    openFilters(); fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros', exact: true }))
    await waitFor(() => expect(mocks.listSupplies).toHaveBeenLastCalledWith(expect.not.objectContaining({ vehicle_id: expect.anything() })))
    expect(screen.getByTestId('location')).toHaveTextContent('origem=emprestimo&indicator=alerts&view=history')
    expect(screen.getByTestId('location')).not.toHaveTextContent('vehicle_id=')
    expect(mocks.listOrders).not.toHaveBeenCalled()
  })

  it('Voltar e Avançar atualizam o seletor e a consulta sem perder o contrato', async () => {
    renderPage('/abastecimentos?view=orders&contract_id=contract-a&return_to=%2Fprocessos-pagamento')
    openFilters(); await chooseVehicle('TST1A23'); await chooseVehicle('TST9B87')
    await waitFor(() => expect(mocks.listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-b' })))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar no navegador' }))
    await waitFor(() => expect(mocks.listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-a' })))
    expect(screen.getByRole('button', { name: /^Filtrar veículo: TST1A23/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Avançar no navegador' }))
    await waitFor(() => expect(mocks.listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-b' })))
    expect(screen.getByTestId('location')).toHaveTextContent('contract_id=contract-a&return_to=')
  })

  it('mantém um veículo fora do catálogo identificado no link para perfis sem acesso a veículos', async () => {
    mocks.canView.mockImplementation((module) => module === 'fuel_supply_orders')
    renderPage('/abastecimentos?view=open&vehicle_id=vehicle-a')
    await waitFor(() => expect(mocks.listOpen).toHaveBeenCalledWith(expect.objectContaining({ vehicle_id: 'vehicle-a' })))
    openFilters()
    expect(screen.getByRole('button', { name: 'Filtrar veículo: Veículo selecionado' })).toBeInTheDocument()
    expect(mocks.get).not.toHaveBeenCalledWith('/vehicles/options'); expect(mocks.listStations).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros', exact: true }))
    expect(screen.getByTestId('location')).not.toHaveTextContent('vehicle_id=')
    expect(screen.queryByRole('button', { name: /^Filtrar veículo:/ })).not.toBeInTheDocument()
  })

  it('falha ao atualizar as opções preserva a seleção e os resultados consultados', async () => {
    renderPage('/abastecimentos?view=history&vehicle_id=vehicle-a')
    await waitFor(() => expect(mocks.listSupplies).toHaveBeenCalled())
    openFilters()
    await screen.findByRole('button', { name: /^Filtrar veículo: TST1A23/ })
    mocks.get.mockRejectedValueOnce(new Error('Indisponível'))
    fireEvent.click(screen.getByRole('button', { name: /^Filtrar veículo:/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Os dados da última consulta continuam visíveis')
    expect(screen.getByRole('button', { name: /^Filtrar veículo: TST1A23/ })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('vehicle_id=vehicle-a')
  })
})

describe('FuelSuppliesPage administrative adjustments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canCreate.mockReturnValue(true)
    mocks.canView.mockReturnValue(true)
    mocks.get.mockResolvedValue({ data: [] })
    mocks.listOrganizations.mockResolvedValue({ data: [] })
    mocks.listStations.mockResolvedValue({ data: [] })
    mocks.listSupplies.mockResolvedValue(paged([]))
    mocks.listOrders.mockResolvedValue(paged([]))
    mocks.listOpen.mockResolvedValue(paged([]))
    mocks.getOrder.mockResolvedValue({ data: { id: 'focus-test' } })
  })

  it('carrega todas as ordens filtradas somente ao solicitar o XLSX', async () => {
    mocks.listOrders.mockResolvedValue(paged([{ id: 'order-1', status: 'EXPIRED' }]))
    const reportRows = Array.from({ length: 12 }, (_, index) => ({ id: `order-${index + 1}`, status: 'EXPIRED' }))
    const { fuelSupplyOrdersAPI } = await import('../api/fuelSupplyOrders')
    fuelSupplyOrdersAPI.listAllForReport.mockResolvedValue(reportRows)
    renderPage('/abastecimentos')

    await waitFor(() => expect(mocks.listOrders).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 })))
    expect(fuelSupplyOrdersAPI.listAllForReport).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Exportar ordens' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exportar XLSX' }))
    await waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalledWith(expect.objectContaining({ rows: reportRows })))
  })

  it('oferece retificação auditável para abastecimento confirmado por ordem', async () => {
    mocks.listSupplies.mockResolvedValue(paged([{
          id: 'supply-1',
          fuel_supply_order_id: 'order-1',
          vehicle_plate: 'THE3C94',
          supplied_at: '2026-07-10T17:45:00Z',
          organization_name: 'Secretaria de Segurança e Transporte',
          fuel_station_name: 'LJ POSTO',
          liters: 30,
          total_amount: 225.30,
          odometer_km: 9278,
          fuel_type: 'Gasolina comum',
          receipt_url: '/api/fuel-supplies/supply-1/receipt',
        }]))

    renderPage('/abastecimentos?view=history')

    fireEvent.click(await screen.findByRole('button', { name: 'Retificar' }))
    expect(screen.getByRole('dialog', { name: 'Retificar confirmação de abastecimento' })).toBeInTheDocument()
    expect(screen.getByLabelText('Valor total (R$)')).toHaveValue('R$ 225,30')
    expect(screen.getByLabelText('Justificativa da retificação')).toBeRequired()
  })

  it('oferece reabertura auditável para ordem expirada', async () => {
    mocks.listOrders.mockResolvedValue(paged([{
          id: 'order-expired',
          status: 'EXPIRED',
          vehicle_plate: 'THE3C94',
          expires_at: '2026-07-10T17:45:00Z',
          requested_liters: 30,
        }]))

    renderPage('/abastecimentos')

    fireEvent.click(await screen.findByRole('button', { name: 'Mais ações da ordem AB-ORDER-EX' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reabrir prazo' }))
    expect(screen.getByRole('dialog', { name: 'Reabrir prazo da ordem' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Novo prazo')).toBeRequired()
    expect(screen.getByLabelText('Justificativa')).toBeRequired()
  })

  it('exibe motivo persistido por hover e clique, preservando filtros e ações', async () => {
    const reason = 'Alerta: consumo 6.45 km/l está mais de 30% abaixo da média histórica (10.20 km/l).'
    mocks.listSupplies.mockResolvedValue(paged([{
      id: 'alert-1', vehicle_plate: 'ABC1D23', supplied_at: '2026-10-06T14:01:00Z',
      is_consumption_anomaly: true, anomaly_details: reason, liters: 40, consumption_km_l: 6.45,
      fuel_supply_order_id: 'order-1', receipt_url: '/api/fuel-supplies/alert-1/receipt',
    }]))
    renderPage('/abastecimentos?vehicle_id=vehicle-1')
    const trigger = await screen.findByRole('button', { name: 'Ver motivo do alerta de ABC1D23' })
    const search = screen.getByPlaceholderText('Buscar por placa, secretaria, posto, combustível ou aditivo')
    fireEvent.change(search, { target: { value: 'ABC1D23' } })
    fireEvent.mouseEnter(trigger)
    expect(screen.getByRole('tooltip')).toHaveTextContent(reason)
    fireEvent.click(trigger)
    const drawer = screen.getByRole('dialog', { name: 'Alerta de abastecimento — ABC1D23' })
    expect(drawer).toHaveTextContent(reason)
    expect(drawer).toHaveTextContent('Rendimento registrado (km/l)')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(search).toHaveValue('ABC1D23')
    expect(screen.getByTestId('location')).toHaveTextContent('/abastecimentos?vehicle_id=vehicle-1')
    expect(screen.getByRole('link', { name: 'Comprovante' })).toHaveAttribute('href', '/api/fuel-supplies/alert-1/receipt')
    expect(screen.getByRole('button', { name: 'Retificar' })).toBeInTheDocument()
  })

  it('informa motivo ausente sem fabricar regra e mantém Regular sem ação de alerta', async () => {
    mocks.listSupplies.mockResolvedValue(paged([
      { id: 'missing', vehicle_plate: 'ABC1D23', is_consumption_anomaly: true, anomaly_details: '   ' },
      { id: 'regular', vehicle_plate: 'DEF4G56', is_consumption_anomaly: false },
    ]))
    renderPage('/abastecimentos?view=history')
    fireEvent.click(await screen.findByRole('button', { name: 'Ver motivo do alerta de ABC1D23' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Motivo não informado no registro deste abastecimento.')
    expect(screen.getByText('Regular')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver motivo do alerta de DEF4G56' })).not.toBeInTheDocument()
  })

  it('mantém apenas um resumo ao percorrer alertas e remove todos ao rolar', async () => {
    mocks.listSupplies.mockResolvedValue(paged([
      { id: 'first', vehicle_plate: 'ABC1D23', is_consumption_anomaly: true, anomaly_details: 'Motivo do primeiro registro.' },
      { id: 'second', vehicle_plate: 'DEF4G56', is_consumption_anomaly: true, anomaly_details: 'Motivo do segundo registro.' },
    ]))
    renderPage('/abastecimentos?view=history')
    const first = await screen.findByRole('button', { name: 'Ver motivo do alerta de ABC1D23' })
    const second = screen.getByRole('button', { name: 'Ver motivo do alerta de DEF4G56' })
    fireEvent.mouseEnter(first)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Motivo do primeiro registro.')
    // A previous mouseleave is not guaranteed when rows move under a stationary pointer.
    fireEvent.mouseEnter(second)
    expect(screen.getAllByRole('tooltip')).toHaveLength(1)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Motivo do segundo registro.')
    expect(first).not.toHaveAttribute('aria-describedby')
    fireEvent.scroll(window)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.focus(first)
    expect(screen.getAllByRole('tooltip')).toHaveLength(1)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Motivo do primeiro registro.')
    fireEvent.click(first)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('Motivo do primeiro registro.')
  })
})

vi.mock('../api/contractControl', () => ({ contractControlAPI: { config: async () => ({ data: { enabled: false } }) }, maintenanceOrdersAPI: {} }))
