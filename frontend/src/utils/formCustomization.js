export const formApiRoutes = { vehicles: '/vehicles', drivers: '/drivers', possession: '/possession',
  vehicle_loans: '/vehicle-loans', claims: '/claims', fines: '/fines', maintenance: '/maintenance',
  fuel_supplies: '/fuel-supplies', fuel_supply_orders: '/fuel-supply-orders', payment_processes: '/payment-processes' }

export function captureCustomFields(config, root = document) {
  if (!['post', 'put', 'patch'].includes(String(config.method).toLowerCase())) return
  const url = String(config.url).replace(/^\/api/, '')
  const containers = [...root.querySelectorAll('[data-custom-fields-module]')].filter((element) => element.getClientRects().length)
  const container = containers.find((element) => {
    const route = formApiRoutes[element.dataset.customFieldsModule]
    return route && (url === route || url.startsWith(`${route}/`))
  })
  if (!container) return
  const entries = {}
  container.querySelectorAll('[data-custom-key]').forEach((control) => {
    entries[control.dataset.customKey] = control.value === '' ? null : control.dataset.customType === 'boolean'
      ? control.value === 'true' : control.dataset.customType === 'number' ? Number(control.value) : control.value
  })
  const encoded = new TextEncoder().encode(JSON.stringify({ module: container.dataset.customFieldsModule, values: entries }))
  return btoa(String.fromCharCode(...encoded))
}
