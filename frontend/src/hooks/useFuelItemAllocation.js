import { useEffect, useState } from 'react'
import { contractControlAPI } from '../api/contractControl'
import { getApiErrorMessage } from '../utils/apiError'

const key=(value)=>String(value||'').trim().replace(/\s+/g,' ').toUpperCase()

export default function useFuelItemAllocation({ funding, enabled, contractId, providerId, fuelType, liters, totalAmount, additiveType, additiveLiters }) {
  const active=enabled ?? Array.isArray(funding?.item_lines)
  const held=funding?.item_lines||[]
  const [catalog,setCatalog]=useState({scope:'',items:[],error:''})
  const [primary,setPrimary]=useState('')
  const [additional,setAdditional]=useState('')
  const [additiveAmount,setAdditiveAmount]=useState(()=>funding?.actual_item_lines?.find((r)=>r.category==='ADDITIVE')?.amount||'')
  const scope=`${contractId}:${providerId}`
  useEffect(()=>{let alive=true;if(active&&contractId&&providerId)contractControlAPI.itemOptions(contractId,providerId).then(({data})=>{if(alive)setCatalog({scope,items:data.items,error:''})}).catch((err)=>{if(alive)setCatalog({scope,items:[],error:getApiErrorMessage(err,'Não foi possível consultar os itens. As informações da reserva foram preservadas.')})});return()=>{alive=false}},[active,contractId,providerId,scope])
  const current=catalog.scope===scope?catalog.items:[]
  const all=[...current,...held.filter((r)=>!current.some((i)=>i.id===r.item_id)).map((r)=>({...r,id:r.item_id}))]
  const fuelItems=all.filter((r)=>r.category==='FUEL'&&key(r.product_key)===key(fuelType))
  const additiveItems=all.filter((r)=>r.category==='ADDITIVE'&&key(r.product_key)===key(additiveType))
  const selectedFuel=fuelItems.find((r)=>r.id===primary)||(fuelItems.length===1?fuelItems[0]:null)
  const selectedAdditive=additiveItems.find((r)=>r.id===additional)||(additiveItems.length===1?additiveItems[0]:null)
  const withAdditive=Boolean(additiveType&&Number(additiveLiters)>0)
  const extra=withAdditive?Number(additiveAmount):0
  const error=active&&additiveType&&!(Number(additiveLiters)>0)?'Informe a quantidade efetivamente utilizada do aditivo.':active&&withAdditive&&(additiveAmount===''||!Number.isFinite(extra)||extra<0||extra>=Number(totalAmount))?'Informe o valor do aditivo no comprovante, menor que o total.':''
  const lines=active?[{item_id:selectedFuel?.id||null,category:'FUEL',description:fuelType,quantity:String(liters||0),amount:(Number(totalAmount||0)-extra).toFixed(2)},...(withAdditive?[{item_id:selectedAdditive?.id||null,category:'ADDITIVE',description:additiveType,quantity:String(additiveLiters),amount:extra.toFixed(2)}]:[])]:undefined
  return {active,fuelItems,additiveItems,selectedFuel,selectedAdditive,setPrimary,setAdditional,additiveAmount,setAdditiveAmount,withAdditive,error,warning:catalog.scope===scope?catalog.error:'',lines}
}
