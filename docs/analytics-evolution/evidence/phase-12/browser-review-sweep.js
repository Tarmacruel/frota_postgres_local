async (page) => {
  const sections = ['Visão Geral', 'Custos', 'Combustível', 'Manutenção', 'Utilização', 'Condutores', 'Alertas', 'Relatórios']
  const errors = []
  const onError = (error) => errors.push(error.message)
  page.on('pageerror', onError)
  const cases = []
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    for (const theme of ['light', 'dark']) {
      if (await page.evaluate(() => document.documentElement.dataset.theme) !== theme) {
        await page.getByRole('button', { name: theme === 'dark' ? 'Ativar modo escuro' : 'Ativar modo claro' }).click()
      }
      for (const section of sections) {
        const navigation = page.getByRole('navigation', { name: 'Seções de análises' })
        await navigation.getByRole('button', { name: section, exact: true }).click()
        await page.waitForFunction(() => [...document.querySelectorAll('[aria-busy="true"]')].every((element) => !element.checkVisibility()))
        const geometry = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }))
        cases.push({ section, theme, ...viewport, horizontalOverflow: geometry.width > geometry.viewport + 1 })
        if ((viewport.width === 1366 && theme === 'light') || (viewport.width === 390 && theme === 'dark')) {
          await page.screenshot({ path: `output/playwright/analytics-review-20261013/${sections.indexOf(section) + 1}-${viewport.width}-${theme}.png`,
            fullPage: true, animations: 'disabled' })
        }
      }
    }
  }
  page.off('pageerror', onError)
  return { fixtureSession: true, cases, errors, failures: cases.filter((item) => item.horizontalOverflow) }
}
