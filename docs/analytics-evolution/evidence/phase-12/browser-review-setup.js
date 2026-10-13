// QA only: the fixture placeholder is replaced with anonymized JSON in ignored output/.
async (page) => {
  const fixtures = __ANALYTICS_FIXTURES__
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api/, '')
    let data = fixtures[path]
    let status = 200
    if (path.endsWith('/export')) {
      status = 403
      data = { detail: 'Permissão insuficiente para exportar (cenário de teste)' }
    } else if (path.includes('/drivers/') && path.endsWith('/events')) {
      data = fixtures[`driver/${url.searchParams.get('source') || 'possession'}`]
    } else if (path.includes('/entities/')) {
      const id = path.split('/').at(-1)
      const driver = fixtures['/analytics/v2/drivers'].drivers.find((item) => item.driver_id === id)
      const vehicle = fixtures['/analytics/v2/utilization'].vehicles.find((item) => item.vehicle_id === id)
      data = { ...fixtures.entity, entity_id: id, entity_type: driver ? 'driver' : 'vehicle',
        title: driver?.name || vehicle?.plate || fixtures.entity.title }
    } else if (/^\/(fuel-supplies|maintenance|fines|claims)\//.test(path)) {
      data = { supplied_at: '2026-09-10T12:00:00Z', odometer_km: 1200, liters: 50, total_amount: 250,
        fuel_type: 'DIESEL', fuel_station_name: 'Posto de teste', consumption_km_l: 8,
        is_consumption_anomaly: false, receipt_url: null,
        start_date: '2026-09-10T12:00:00Z', end_date: '2026-09-11T12:00:00Z', total_cost: 100,
        service_description: 'Serviço fictício para validação de interface.',
        infraction_date: '2026-09-10', amount: 100, status: 'PENDENTE', description: 'Registro fictício de teste.',
        data_ocorrencia: '2026-09-10T12:00:00Z', valor_estimado: 200, descricao: 'Registro fictício de teste.' }
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data ?? []) })
  })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('http://127.0.0.1:6969/analytics')
  await page.getByRole('heading', { name: 'Análises administrativas' }).waitFor()
  return { session: 'mocked in browser only', allApiRequestsIntercepted: true }
}
