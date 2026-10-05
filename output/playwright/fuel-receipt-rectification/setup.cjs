async (page) => {
  const record = { id: '11111111-1111-4111-8111-111111111111', fuel_supply_order_id: '22222222-2222-4222-8222-222222222222',
    vehicle_plate: 'ABC1D23', supplied_at: '2026-09-23T13:21:00Z', organization_name: 'Secretaria de Testes',
    fuel_station_name: 'Posto de Testes', liters: 30, total_amount: 225.3, odometer_km: 8839,
    fuel_type: 'Gasolina comum', receipt_url: '/api/fuel-supplies/11111111-1111-4111-8111-111111111111/receipt' }
  await page.unrouteAll()
  await page.route('http://127.0.0.1:3011/api/**', async route => {
    const url = new URL(route.request().url())
    let data = []
    if (url.pathname === '/api/auth/me') data = { id: 'qa-user', name: 'Validação local', role: 'ADMIN', permissions: Object.fromEntries(['fuel_supplies', 'fuel_supply_orders', 'vehicles', 'vehicle_loans'].map(name => [name, { can_view: true, can_create: true, can_edit: true }])) }
    else if (url.pathname === '/api/fuel-supplies') data = { data: [record], pagination: { page: 1, total_pages: 1, total: 1 } }
    else if (url.pathname === '/api/fuel-supply-orders') data = { data: [], pagination: { page: 1, total_pages: 1, total: 0 } }
    else if (url.pathname === '/api/auth/csrf') data = { csrf_token: 'local-qa' }
    else if (url.pathname.includes('pending')) data = { total: 0 }
    else if (url.pathname.endsWith('/receipt')) return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4 QA original' })
    else if (route.request().method() === 'PATCH') {
      const body = route.request().postData() || ''
      if (!body.includes('name="receipt"') || !body.includes('name="payload"') || !body.includes('Comprovante corrigido em teste local.')) throw new Error('Multipart incompleto')
      data = record
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('http://127.0.0.1:3011/abastecimentos')
}
