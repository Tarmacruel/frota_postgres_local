import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ContractItemsPanel from './ContractItemsPanel'
import { contractControlAPI } from '../../api/contractControl'
vi.mock('../../api/contractControl',()=>({contractControlAPI:{items:vi.fn(),quantityOpening:vi.fn(),openQuantities:vi.fn()}}))
const item={id:'i',code:'DIESEL',original_number:'03',description:'Diesel teste',category:'FUEL',unit:'L',original_quantity:'100',reference_unit_price:'6.02',remaining:null,reserved:null,available:null,active:true}
beforeEach(()=>{vi.clearAllMocks();contractControlAPI.items.mockResolvedValue({data:{opened:false,items:[item],prices:[]}});contractControlAPI.quantityOpening.mockResolvedValue({data:{items:[item],reservations:[]}});contractControlAPI.openQuantities.mockResolvedValue({data:{opened:true}})})
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
