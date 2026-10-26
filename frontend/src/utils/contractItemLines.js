export const itemLineTotal = (row) => row.amount !== undefined && row.amount !== '' ? Number(row.amount) : Math.round((Number(row.quantity || 0)*Number(row.unit_price || 0)+Number.EPSILON)*100)/100
export const itemLinesTotal = (lines) => (lines.reduce((sum, line) => sum+Math.round(itemLineTotal(line)*100), 0)/100).toFixed(2)
export const itemLinesPayload = (lines, actual = false) => lines.filter((r) => Number(r.quantity) > 0).map((r) => ({ item_id: r.item_id || null, quantity: String(r.quantity),
  ...(actual ? { amount: itemLineTotal(r).toFixed(2), description: r.description || null, category: r.category || 'SERVICE' }
    : { unit_price: String(r.unit_price), ...(r.expected_price_id ? { expected_price_id: r.expected_price_id } : {}) }) }))

