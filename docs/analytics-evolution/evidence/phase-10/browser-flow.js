async (page) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const cases = []
  for (const size of [{width:1366,height:900},{width:1920,height:1080},{width:390,height:844}]) {
    await page.setViewportSize(size)
    for (const theme of ['light','dark']) {
      if (await page.evaluate(() => document.documentElement.dataset.theme) !== theme) await page.getByRole('button',{name:theme==='dark'?'Ativar modo escuro':'Ativar modo claro'}).click()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+1)
      cases.push({...size,theme,horizontalOverflow:overflow})
      if (size.width===1366 && theme==='light' || size.width===390 && theme==='dark') await page.screenshot({path:`output/playwright/analytics-phase-10/queue-${size.width}-${theme}.png`,fullPage:true})
    }
  }
  await page.getByRole('region',{name:'Casos de alertas'}).getByRole('button',{name:/TST/}).first().click()
  await page.getByRole('region',{name:'Como foi calculado?'}).waitFor()
  await page.screenshot({path:'output/playwright/analytics-phase-10/drawer-mobile-dark.png'})
  await page.getByRole('button',{name:'Abrir abastecimento de origem'}).click()
  await page.getByText('Abastecimento · consulta ao registro de domínio').waitFor()
  await page.getByRole('button',{name:'← Voltar'}).click()
  await page.getByRole('region',{name:'Como foi calculado?'}).waitFor()
  await page.getByLabel('Novo estado').selectOption('IGNORED')
  const before = await page.getByRole('region',{name:'Histórico do alerta'}).innerText()
  await page.getByRole('button',{name:'Registrar decisão'}).click()
  const reasonRequired = await page.getByLabel('Justificativa').evaluate((element) => !element.checkValidity())
  await page.getByLabel('Justificativa').fill('Conferência demonstrativa somente na fixture de navegador.')
  await page.getByRole('button',{name:'Registrar decisão'}).click()
  await page.getByText('Decisão registrada no histórico.').waitFor()
  const historyPreserved = (await page.getByRole('region',{name:'Histórico do alerta'}).innerText()).includes('Detecção original')
  await page.screenshot({path:'output/playwright/analytics-phase-10/treated-fixture-mobile-dark.png'})
  await page.getByText('Evidência original preservada',{exact:true}).click()
  await page.getByRole('region',{name:'Evidência original',exact:true}).waitFor()
  await page.screenshot({path:'output/playwright/analytics-phase-10/original-fixture-mobile-dark.png'})
  for (let i=0;i<6;i++) await page.keyboard.press('Tab')
  const focusTrapped = await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))
  await page.keyboard.press('Escape')
  const focusRestored = await page.evaluate(() => document.activeElement.classList.contains('analytics-entity-link') || document.activeElement.getAttribute('aria-label') === 'Central de casos de alertas')
  return {fixtureSession:true,cases,errors,recordAndBack:true,reasonRequired,historyPreserved,originalBefore:before.includes('Detecção original'),focusTrapped,focusRestored}
}
