import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import useFuelItemAllocation from './useFuelItemAllocation'
import { contractControlAPI } from '../api/contractControl'
vi.mock('../api/contractControl',()=>({contractControlAPI:{itemOptions:vi.fn()}}))
const items=[{id:'gas',category:'FUEL',product_key:'GASOLINA COMUM',description:'Gasolina'},{id:'eth',category:'FUEL',product_key:'ETANOL',description:'Etanol'},{id:'arla',category:'ADDITIVE',product_key:'ARLA 32',description:'ARLA'}]
beforeEach(()=>{vi.clearAllMocks();contractControlAPI.itemOptions.mockResolvedValue({data:{items,prices:[]}})})
it('usa o item do combustível efetivo e divide o total com o ARLA',async()=>{
  const {result}=renderHook(()=>useFuelItemAllocation({enabled:true,contractId:'c',providerId:'p',fuelType:'Etanol',liters:4,totalAmount:30,additiveType:'ARLA 32',additiveLiters:2}))
  await waitFor(()=>expect(result.current.selectedFuel?.id).toBe('eth'))
  expect(result.current.error).toContain('valor do aditivo')
  act(()=>result.current.setAdditiveAmount('5.00'))
  expect(result.current.lines).toEqual([{item_id:'eth',category:'FUEL',description:'Etanol',quantity:'4',amount:'25.00'},{item_id:'arla',category:'ADDITIVE',description:'ARLA 32',quantity:'2',amount:'5.00'}])
})
it('mantém o gasto real sem item conhecido para registro da divergência',async()=>{
  const {result}=renderHook(()=>useFuelItemAllocation({enabled:true,contractId:'c',providerId:'p',fuelType:'GNV',liters:3,totalAmount:15}))
  await waitFor(()=>expect(contractControlAPI.itemOptions).toHaveBeenCalled())
  expect(result.current.lines[0]).toMatchObject({item_id:null,description:'GNV',quantity:'3',amount:'15.00'})
})
it('não consulta catálogo nem muda o payload do modo anterior',()=>{
  const {result}=renderHook(()=>useFuelItemAllocation({enabled:false,fuelType:'Etanol',liters:4,totalAmount:20}))
  expect(result.current.lines).toBeUndefined();expect(contractControlAPI.itemOptions).not.toHaveBeenCalled()
})
