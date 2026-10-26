import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ContractAmendmentEditor, { ContractAmendmentReport } from './ContractAmendmentEditor'
import { contractControlAPI } from '../../api/contractControl'
import { paymentContractsAPI } from '../../api/paymentProcesses'
import { exportRowsToXlsx, exportRowsToPdf, previewRowsToPdf } from '../../utils/exportData'

vi.mock('../../api/contractControl',()=>({contractControlAPI:{items:vi.fn(),amendmentPreview:vi.fn(),amendmentAttachment:vi.fn()}}))
vi.mock('../../api/paymentProcesses',()=>({paymentContractsAPI:{createAmendment:vi.fn()}}))
vi.mock('../../utils/exportData',()=>({exportRowsToXlsx:vi.fn(),exportRowsToPdf:vi.fn(),previewRowsToPdf:vi.fn()}))
const contract={id:'contract',number:'TESTE-2026',valid_until:'2027-01-01',amendments:[]}
const providers=[{id:'provider',name:'Posto fictício',active:true}]
const item={id:'diesel',code:'DIESEL',original_number:'03',description:'Diesel S10',category:'FUEL',unit:'L',original_quantity:'100',reference_unit_price:'6.02',remaining:'50',active:true}
const snapshot={contract_id:'contract',contract_number:'TESTE-2026',number:'2TA-TESTE',document_reference:'DOC-TESTE',signed_at:'2026-01-12',effective_date:'2026-01-12',before_valid_until:'2027-01-01',after_valid_until:'2027-01-01',before_available:'1000',after_available:'1000',quantity_amount:'0',price_financial_delta:'0',total_financial_delta:'0',adjudication:'ITEM',limits:[],notes:'Justificativa conferida no termo',lines:[{item_id:'diesel',code:'DIESEL',original_number:'03',document_number:'001',description:'Diesel S10',unit:'L',before_price:'6.02',after_price:'6.21',price_percent:'3.1561',added_quantity:'0',before_remaining:'50',after_remaining:'50',quantity_amount:'0',prices:[{provider_id:'provider',provider_name:'Posto fictício',before:'6.02',after:'6.21'}]}]}
beforeEach(()=>{
  vi.clearAllMocks()
  contractControlAPI.items.mockResolvedValue({data:{opened:true,items:[item,{...item,id:'arla',code:'ARLA',original_number:'05',description:'ARLA 32',category:'ADDITIVE'}],prices:[{id:'price',item_id:'diesel',provider_id:'provider',unit_price:'6.02',current:true}]}})
  contractControlAPI.amendmentPreview.mockResolvedValue({data:{preview_token:'token',snapshot}})
  paymentContractsAPI.createAmendment.mockImplementation(async(_id,data)=>({data:{amendments:[{id:'amendment',request_key:data.request_key,snapshot}]}}))
})
async function fillPrice(){
  fireEvent.change(screen.getByLabelText('Número do instrumento'),{target:{value:'2TA-TESTE'}})
  fireEvent.change(screen.getByLabelText('Assinatura'),{target:{value:'2026-01-12'}})
  fireEvent.change(screen.getByLabelText('Processo / documento de referência'),{target:{value:'DOC-TESTE'}})
  fireEvent.click(screen.getByLabelText('Prazo'))
  fireEvent.click(screen.getByLabelText('Preços'))
  await screen.findByRole('option',{name:/03 · Diesel S10/})
  fireEvent.change(screen.getByLabelText('Natureza da alteração'),{target:{value:'REBALANCE'}})
  fireEvent.change(screen.getByLabelText('Efeito no valor global'),{target:{value:'NONE'}})
  fireEvent.change(screen.getByLabelText('Adicionar item à alteração'),{target:{value:'diesel'}})
  fireEvent.change(screen.getByLabelText('Número do item neste documento'),{target:{value:'001'}})
  fireEvent.change(screen.getByLabelText('Novo preço DIESEL'),{target:{value:'6.21'}})
  fireEvent.change(screen.getByLabelText('Justificativa da alteração'),{target:{value:'Justificativa conferida no termo'}})
}
it('altera um único item, preserva seu ID e diferencia a numeração do documento',async()=>{
  render(<ContractAmendmentEditor contract={contract} providers={providers} onClose={vi.fn()}/>)
  await fillPrice();fireEvent.click(screen.getByRole('button',{name:'Conferir impactos'}))
  await waitFor(()=>expect(contractControlAPI.amendmentPreview).toHaveBeenCalled())
  const [,data]=contractControlAPI.amendmentPreview.mock.calls[0]
  expect(data.change_types).toEqual(['PRICE']);expect(data.lines).toHaveLength(1)
  expect(data.lines[0]).toMatchObject({item_id:'diesel',document_number:'001',new_reference_price:'6.21',added_quantity:'0',prices:[{provider_id:'provider',unit_price:'6.21'}]})
  expect(data.price_financial_effect).toBe('NONE');expect(data.price_financial_delta).toBe('0')
  expect(paymentContractsAPI.createAmendment).not.toHaveBeenCalled()
})
it('confirma com a mesma identificação e abre o demonstrativo persistido',async()=>{
  const onSuccess=vi.fn();render(<ContractAmendmentEditor contract={contract} providers={providers} onClose={vi.fn()} onSuccess={onSuccess}/>)
  await fillPrice();fireEvent.click(screen.getByRole('button',{name:'Conferir impactos'}))
  fireEvent.click(await screen.findByRole('button',{name:'Confirmar alteração e ver relatório'}))
  await screen.findByRole('heading',{name:'Demonstrativo de alterações contratuais'})
  expect(onSuccess).toHaveBeenCalledTimes(1)
  expect(paymentContractsAPI.createAmendment.mock.calls[0][1]).toMatchObject({preview_token:'token',request_key:contractControlAPI.amendmentPreview.mock.calls[0][1].request_key})
})
it('preserva campos quando a confirmação rejeita uma prévia desatualizada',async()=>{
  paymentContractsAPI.createAmendment.mockRejectedValue({response:{status:409,data:{detail:'O saldo mudou. Confira novamente.'}}})
  render(<ContractAmendmentEditor contract={contract} providers={providers} onClose={vi.fn()}/>)
  await fillPrice();fireEvent.click(screen.getByRole('button',{name:'Conferir impactos'}));fireEvent.click(await screen.findByRole('button',{name:'Confirmar alteração e ver relatório'}))
  await screen.findByRole('alert');expect(screen.getByLabelText('Número do instrumento')).toHaveValue('2TA-TESTE');expect(screen.getByLabelText('Novo preço DIESEL')).toHaveValue(6.21)
  expect(screen.getByRole('button',{name:'Conferir impactos'})).toBeEnabled()
})
it('exporta a fotografia salva sem reenviar a confirmação e permite repetir a geração',async()=>{
  previewRowsToPdf.mockRejectedValueOnce(new Error('PDF indisponível'))
  render(<ContractAmendmentReport record={{id:'amendment',snapshot}} onClose={vi.fn()}/>)
  fireEvent.click(screen.getByRole('button',{name:'Pré-visualizar PDF'}));await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button',{name:'Exportar XLSX'}))
  await waitFor(()=>expect(exportRowsToXlsx).toHaveBeenCalled())
  expect(exportRowsToXlsx.mock.calls[0][0].rows[0]).toMatchObject({original_number:'03',document_number:'001',after_price:'6.21'})
  await waitFor(()=>expect(screen.getByRole('button',{name:'Baixar PDF'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'Baixar PDF'}))
  await waitFor(()=>expect(exportRowsToPdf).toHaveBeenCalled())
  expect(exportRowsToPdf.mock.calls[0][0].columns.map((c)=>c.header)).toContain('Restante após')
  expect(paymentContractsAPI.createAmendment).not.toHaveBeenCalled()
})
