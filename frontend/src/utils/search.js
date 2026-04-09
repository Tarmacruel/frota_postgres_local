export const SEARCH_TYPE_LABELS = {
  vehicle: 'Veiculos',
  possession: 'Condutores',
  maintenance: 'Manutencoes',
}

export function groupSearchResults(results) {
  return results.reduce((groups, result) => {
    const bucket = groups[result.type] || []
    bucket.push(result)
    groups[result.type] = bucket
    return groups
  }, {})
}
