import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ContractItemsPanel from './ContractItemsPanel'
import { contractControlAPI } from '../../api/contractControl'
vi.mock('../../api/contractControl',()=>({contractControlAPI:{items:vi.fn(),quantityOpening:vi.fn(),openQuantities:vi.fn(),createItem:vi.fn(),updateItem:vi.fn(),itemPrice:vi.fn()}}))
const item={id:'i',code:'DIESEL',original_number:'03',description:'Diesel teste',category:'FUEL',product_key:'DIESEL S10',unit:'L',original_quantity:'100',original_unit_price:'5.80',reference_unit_price:'6.02',remaining:null,reserved:null,available:null,active:true}
const provider={id:'p',name:'Oficina teste',active:true}
const price={id:'price',item_id:'i',provider_id:'p',unit_price:'6.02',current:true}
const context=(overrides={})=>({opened:false,items:[item],prices:[price],reservations:[],...overrides})
beforeEach(()=>{vi.resetAllMocks();contractControlAPI.items.mockResolvedValue({data:context()});contractControlAPI.quantityOpening.mockResolvedValue({data:context()});contractControlAPI.openQuantities.mockResolvedValue({data:{opened:true}});contractControlAPI.createItem.mockResolvedValue({data:{id:'new'}});contractControlAPI.updateItem.mockResolvedValue({data:item});contractControlAPI.itemPrice.mockResolvedValue({data:price})})
it('exige conferência explícita sem presumir quantidades e histórico como zero',async()=>{
  render(<ContractItemsPanel contract={{id:'c',number:'TESTE'}} manage providers={[]} />)
  fireEvent.click(await screen.findByRole('button',{name:'Conferir quantidades'}))
  expect(await screen.findByLabelText('Restante DIESEL')).toHaveValue(null)
  expect(screen.getByLabelText('Acréscimos anteriores DIESEL')).toHaveValue(null)
  expect(screen.getByLabelText('Adjudicação / base do limite')).toHaveValue('')
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(contractControlAPI.openQuantities).not.toHaveBeenCalled()
})
it('envia abertura de itens e histórico conferidos sem ajustar dinheiro',async()=>{
  const changed=vi.fn();render(<ContractItemsPanel contract={{id:'c',number:'TESTE'}} manage providers={[]} onChange={changed}/>)
  fireEvent.click(await screen.findByRole('button',{name:'Conferir quantidades'}))
  fireEvent.change(await screen.findByLabelText('Restante DIESEL'),{target:{value:'6'}})
  fireEvent.change(screen.getByLabelText('Acréscimos anteriores DIESEL'),{target:{value:'0'}})
  fireEvent.change(screen.getByLabelText('Adjudicação / base do limite'),{target:{value:'ITEM'}})
  fireEvent.change(screen.getByLabelText('Documento de conferência'),{target:{value:'DOC-TESTE'}})
  fireEvent.change(screen.getByLabelText('Justificativa'),{target:{value:'Quantidades conferidas para teste'}})
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'Confirmar abertura'}))
  await waitFor(()=>expect(contractControlAPI.openQuantities).toHaveBeenCalled())
  expect(contractControlAPI.openQuantities.mock.calls[0]).toEqual(['c',expect.objectContaining({adjudication:'ITEM',history_confirmed:true,items:[{item_id:'i',remaining_quantity:'6',historical_added_quantity:'0'}],reservations:[]})])
  expect(changed).toHaveBeenCalledTimes(1)
})

it('cadastra somente o preço original e inicia a referência interna com o mesmo valor',async()=>{
  render(<ContractItemsPanel contract={{id:'c',kind:'MAINTENANCE'}} manage />)
  fireEvent.click(await screen.findByRole('button',{name:'Cadastrar item'}))
  expect(screen.queryByLabelText('Preço de referência atualizado (R$)')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Código permanente do item'),{target:{value:'SERV-01'}})
  fireEvent.change(screen.getByLabelText('Número no contrato original'),{target:{value:'1'}})
  fireEvent.change(screen.getByLabelText('Descrição'),{target:{value:'Serviço de manutenção'}})
  fireEvent.change(screen.getByLabelText('Quantidade original'),{target:{value:'100'}})
  fireEvent.change(screen.getByLabelText('Preço unitário original (R$)'),{target:{value:'250,123456'}})
  expect(contractControlAPI.createItem).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Salvar',exact:true}))
  await waitFor(()=>expect(contractControlAPI.createItem).toHaveBeenCalledWith('c',expect.objectContaining({original_unit_price:'250.123456',reference_unit_price:'250.123456'})))
})

it('preserva referência de reajuste existente ao editar os dados originais',async()=>{
  render(<ContractItemsPanel contract={{id:'c',kind:'FUEL'}} manage />)
  fireEvent.click(await screen.findByRole('button',{name:'Editar',exact:true}))
  expect(screen.queryByLabelText('Preço de referência atualizado (R$)')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Preço unitário original (R$)'),{target:{value:'5,85'}})
  fireEvent.click(screen.getByRole('button',{name:'Salvar',exact:true}))
  await waitFor(()=>expect(contractControlAPI.updateItem).toHaveBeenCalledWith('c','i',expect.objectContaining({original_unit_price:'5.85',reference_unit_price:'6.02'})))
})

it('antecipa itens sem preço vigente sem tratar versões históricas ou futuras como válidas',async()=>{
  const inactive={...item,id:'inactive',code:'INATIVO',active:false}
  const second={...item,id:'second',code:'COMUM',description:'Gasolina teste'}
  contractControlAPI.quantityOpening.mockResolvedValue({data:context({items:[item,second,inactive],prices:[{...price,current:false},{...price,id:'future',current:false},{...price,id:'valid',item_id:'second'}]})})
  render(<ContractItemsPanel contract={{id:'c',kind:'FUEL'}} manage />)
  fireEvent.click(await screen.findByRole('button',{name:'Conferir quantidades'}))
  const pending=await screen.findByRole('region',{name:'Preços pendentes'})
  expect(pending).toHaveTextContent('Falta informar o posto e o preço de 1 item.')
  expect(within(pending).getByRole('button',{name:'Informar posto e preço de DIESEL'})).toBeEnabled()
  expect(within(pending).queryByText('COMUM')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Restante INATIVO')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Confirmar abertura'})).toBeDisabled()
  expect(contractControlAPI.openQuantities).not.toHaveBeenCalled()
})

async function openUnpricedMaintenance() {
  const service={...item,code:'SERV-01',description:'Serviço teste',category:'SERVICE',unit:'UN'}
  contractControlAPI.items.mockResolvedValue({data:context({items:[service],prices:[]})})
  contractControlAPI.quantityOpening.mockResolvedValue({data:context({items:[service],prices:[]})})
  render(<ContractItemsPanel contract={{id:'c',kind:'MAINTENANCE'}} manage providers={[provider]} />)
  fireEvent.click(await screen.findByRole('button',{name:'Conferir quantidades'}))
  await screen.findByRole('region',{name:'Preços pendentes'})
  fireEvent.change(screen.getByLabelText('Restante SERV-01'),{target:{value:'50'}})
  fireEvent.change(screen.getByLabelText('Acréscimos anteriores SERV-01'),{target:{value:'0'}})
  fireEvent.change(screen.getByLabelText('Adjudicação / base do limite'),{target:{value:'ITEM'}})
  fireEvent.change(screen.getByLabelText('Documento de conferência'),{target:{value:'DOCUMENTO-TESTE'}})
  fireEvent.change(screen.getByLabelText('Justificativa'),{target:{value:'Conferência de quantidades do contrato'}})
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'Informar oficina e preço de SERV-01'}))
  return {service,priceDialog:within(screen.getByRole('dialog',{name:'Vincular preço ao item'}))}
}

function expectOpeningDraft() {
  expect(screen.getByLabelText('Restante SERV-01')).toHaveValue(50)
  expect(screen.getByLabelText('Acréscimos anteriores SERV-01')).toHaveValue(0)
  expect(screen.getByLabelText('Adjudicação / base do limite')).toHaveValue('ITEM')
  expect(screen.getByLabelText('Documento de conferência')).toHaveValue('DOCUMENTO-TESTE')
  expect(screen.getByLabelText('Justificativa')).toHaveValue('Conferência de quantidades do contrato')
  expect(screen.getByRole('checkbox')).toBeChecked()
}

it('resolve oficina e preço na abertura sem perder o rascunho nem confirmar quantidades automaticamente',async()=>{
  const {service,priceDialog}=await openUnpricedMaintenance()
  expect(priceDialog.getByLabelText('Item')).toHaveValue('i')
  expect(priceDialog.getByLabelText('Oficina / prestador')).toHaveValue('p')
  expect(priceDialog.getByLabelText('Preço unitário cobrado (R$)')).toHaveValue('R$ 6,02')
  expect(contractControlAPI.itemPrice).not.toHaveBeenCalled()
  contractControlAPI.quantityOpening.mockResolvedValue({data:context({items:[service]})})
  fireEvent.click(priceDialog.getByRole('button',{name:'Salvar',exact:true}))
  await waitFor(()=>expect(contractControlAPI.itemPrice).toHaveBeenCalledWith('c',{item_id:'i',provider_id:'p',unit_price:'6.02',fuel_price_id:null}))
  await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Vincular preço ao item'})).not.toBeInTheDocument())
  await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar abertura'})).toBeEnabled())
  expectOpeningDraft()
  expect(contractControlAPI.openQuantities).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Confirmar abertura'}))
  await waitFor(()=>expect(contractControlAPI.openQuantities).toHaveBeenCalledWith('c',expect.objectContaining({items:[{item_id:'i',remaining_quantity:'50',historical_added_quantity:'0'}]})))
})

it('mantém o rascunho e a pendência ao cancelar o vínculo',async()=>{
  const {priceDialog}=await openUnpricedMaintenance()
  fireEvent.click(priceDialog.getByRole('button',{name:'Voltar',exact:true}))
  expectOpeningDraft()
  expect(screen.getByRole('region',{name:'Preços pendentes'})).toHaveTextContent('Falta informar a oficina e o preço de 1 item.')
  expect(screen.getByRole('button',{name:'Confirmar abertura'})).toBeDisabled()
  expect(contractControlAPI.itemPrice).not.toHaveBeenCalled()
  expect(contractControlAPI.openQuantities).not.toHaveBeenCalled()
})

it('preserva o preço digitado e as quantidades quando o vínculo falha',async()=>{
  contractControlAPI.itemPrice.mockRejectedValue(new Error('Falha na conexão'))
  const {priceDialog}=await openUnpricedMaintenance()
  fireEvent.change(priceDialog.getByLabelText('Preço unitário cobrado (R$)'),{target:{value:'7,123456'}})
  fireEvent.click(priceDialog.getByRole('button',{name:'Salvar',exact:true}))
  await waitFor(()=>expect(priceDialog.getByRole('alert')).toBeInTheDocument())
  expect(priceDialog.getByLabelText('Preço unitário cobrado (R$)')).toHaveValue('7,123456')
  expect(contractControlAPI.itemPrice).toHaveBeenCalledWith('c',expect.objectContaining({unit_price:'7.123456'}))
  expectOpeningDraft()
  expect(contractControlAPI.openQuantities).not.toHaveBeenCalled()
})

it('bloqueia abertura com verificação indisponível e permite tentar de novo sem apagar dados',async()=>{
  render(<ContractItemsPanel contract={{id:'c',kind:'FUEL'}} manage />)
  fireEvent.click(await screen.findByRole('button',{name:'Conferir quantidades'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar abertura'})).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Restante DIESEL'),{target:{value:'50'}})
  contractControlAPI.quantityOpening.mockRejectedValueOnce(new Error('Rede indisponível'))
  fireEvent.click(screen.getByRole('button',{name:'Atualizar verificação de preços'}))
  await screen.findByRole('alert')
  expect(screen.getByRole('button',{name:'Confirmar abertura'})).toBeDisabled()
  expect(screen.getByLabelText('Restante DIESEL')).toHaveValue(50)
  fireEvent.click(screen.getByRole('button',{name:'Atualizar verificação de preços'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar abertura'})).toBeEnabled())
  expect(screen.getByLabelText('Restante DIESEL')).toHaveValue(50)
})

it('reconsulta preço que deixou de valer no servidor e explica como corrigir sem apagar o formulário',async()=>{
  render(<ContractItemsPanel contract={{id:'c',kind:'FUEL'}} manage />)
  fireEvent.click(await screen.findByRole('button',{name:'Conferir quantidades'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar abertura'})).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Restante DIESEL'),{target:{value:'50'}})
  contractControlAPI.openQuantities.mockRejectedValueOnce({response:{data:{detail:'Vincule ao menos um preço vigente e executante a cada item antes de confirmar a abertura'}}})
  contractControlAPI.quantityOpening.mockResolvedValueOnce({data:context({prices:[]})})
  fireEvent.submit(screen.getByRole('button',{name:'Confirmar abertura'}).closest('form'))
  expect(await screen.findByRole('region',{name:'Preços pendentes'})).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Um preço mudou ou deixou de valer.')
  expect(screen.getByRole('button',{name:'Confirmar abertura'})).toBeDisabled()
  expect(screen.getByLabelText('Restante DIESEL')).toHaveValue(50)
})

it('sugere o valor do item mas só vincula uma versão existente após seleção explícita',async()=>{
  const legacy={id:'old-price',provider_id:'p',fuel_type:'DIESEL S10',unit_price:'6.10'}
  render(<ContractItemsPanel contract={{id:'c',kind:'FUEL'}} manage providers={[provider]} legacyPrices={[legacy,{...legacy,id:'future',unit_price:'7',valid_from:'2999-01-01T00:00:00Z'}]} />)
  fireEvent.click(await screen.findByRole('button',{name:'Vincular preço',exact:true}))
  expect(screen.getByLabelText('Posto / fornecedor')).toHaveValue('p')
  expect(screen.getByLabelText('Preço já cadastrado')).toHaveValue('')
  expect(screen.queryByRole('option',{name:'DIESEL S10 · 7'})).not.toBeInTheDocument()
  expect(contractControlAPI.itemPrice).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Preço já cadastrado'),{target:{value:'old-price'}})
  fireEvent.click(screen.getByRole('button',{name:'Salvar',exact:true}))
  await waitFor(()=>expect(contractControlAPI.itemPrice).toHaveBeenCalledWith('c',{item_id:'i',provider_id:'p',unit_price:'6.10',fuel_price_id:'old-price'}))
})

it('orienta a vincular uma oficina quando a rede está vazia sem permitir salvar preço',async()=>{
  render(<ContractItemsPanel contract={{id:'c',kind:'MAINTENANCE'}} manage />)
  fireEvent.click(await screen.findByRole('button',{name:'Vincular preço',exact:true}))
  expect(screen.getByText(/Primeiro, adicione uma oficina ou prestador/)).toHaveTextContent('Rede executante')
  expect(screen.getByRole('button',{name:'Salvar',exact:true})).toBeDisabled()
  expect(contractControlAPI.itemPrice).not.toHaveBeenCalled()
})

it('não expõe ações de configuração ao perfil de leitura',async()=>{
  render(<ContractItemsPanel contract={{id:'c',kind:'FUEL'}} manage={false} />)
  await screen.findByText('03 · Diesel teste')
  expect(screen.queryByRole('button',{name:'Cadastrar item'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Conferir quantidades'})).not.toBeInTheDocument()
  expect(contractControlAPI.quantityOpening).not.toHaveBeenCalled()
})
