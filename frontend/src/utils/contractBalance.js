export const formatContractMoney = (value) => value === null || value === undefined ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const contractKinds = { FUEL: 'Abastecimento', MAINTENANCE: 'Manutenção veicular' }
export const contractDate = (value) => value ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não informada'
