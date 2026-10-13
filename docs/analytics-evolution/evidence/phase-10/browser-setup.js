async (page) => {
  const fixtures = __ANALYTICS_FIXTURES__
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api/, '')
    let data = []
    if (path === '/auth/me') data = fixtures.auth
    else if (path === '/auth/csrf') data = { csrf_token: 'fixture-only-csrf' }
    else if (path === '/master-data/catalog') data = { organizations: [] }
    else if (path === '/analytics/v2/alerts') {
      const items = fixtures.listing.items.filter((item) => url.searchParams.get('status') ? item.status === url.searchParams.get('status') : ['NEW','IN_REVIEW'].includes(item.status))
      data = { ...fixtures.listing, items, total: items.length }
    } else if (path.endsWith('/status') && path.includes('/alerts/')) {
      const id = path.split('/').at(-2), body = request.postDataJSON(), item = fixtures.details[id]
      const before = item.status
      item.status = body.status; item.version += 1; item.allowed_states = ['IN_REVIEW']
      fixtures.listing.items.find((row) => row.id === id).status = item.status
      fixtures.histories[id].items.unshift({ id: 'fixture-event', event_type:'STATUS_CHANGED', from_status:before, to_status:item.status,
        actor_label:'Operador de teste', reason:body.reason, evidence:{}, evaluation_context:{}, created_at:new Date().toISOString() })
      fixtures.histories[id].total += 1
      data = { id, status:item.status, version:item.version }
    } else if (path.includes('/alerts/') && path.endsWith('/events')) data = fixtures.histories[path.split('/').at(-2)]
    else if (path.includes('/alerts/')) data = fixtures.details[path.split('/').at(-1)]
    else if (path.includes('/entities/')) data = fixtures.entity
    else if (path.startsWith('/fuel-supplies/')) data = fixtures.record
    else if (path === '/analytics/insights') data = []
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(data) })
  })
  await page.setViewportSize({ width:1366, height:900 })
  await page.goto('http://127.0.0.1:6969/analytics?view=alerts')
  await page.getByRole('region',{name:'Casos de alertas'}).waitFor()
  return { allRequestsIntercepted:true, fixtureSession:true }
}
