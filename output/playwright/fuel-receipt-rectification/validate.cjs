async (page) => {
  const dialog = page.getByRole('dialog', { name: 'Retificar confirmação de abastecimento' })
  await page.getByLabel('Justificativa da retificação').fill('Comprovante corrigido em teste local.')
  await page.getByLabel('Novo comprovante (opcional)').setInputFiles({ name: 'corrigido.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 QA corrected') })
  const results = []
  for (const [width, height] of [[1366, 900], [390, 844]]) {
    await page.setViewportSize({ width, height })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))) })
      await page.getByLabel('Novo comprovante (opcional)').evaluate(el => el.scrollIntoView({ block: 'center' }))
      await page.screenshot({ path: `output/playwright/fuel-receipt-rectification/${width}-${theme}.png` })
      const bounds = await dialog.boundingBox()
      if (bounds.x < 0 || bounds.x + bounds.width > width + 1) throw new Error('Modal fora da largura da tela')
      if (await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1)) throw new Error('Conteúdo excede a largura do modal')
      await page.getByRole('button', { name: 'Salvar retificação', exact: true }).scrollIntoViewIfNeeded()
      results.push({ width, height, theme, modalWithinViewport: true, saveReachable: true })
    }
  }
  await page.getByLabel('Novo comprovante (opcional)').setInputFiles({ name: 'invalido.txt', mimeType: 'text/plain', buffer: Buffer.from('arquivo inválido') })
  if (!await page.getByRole('button', { name: 'Salvar retificação', exact: true }).isDisabled()) throw new Error('Arquivo inválido liberou envio')
  await page.getByLabel('Novo comprovante (opcional)').setInputFiles({ name: 'corrigido.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 QA corrected') })
  const request = page.waitForRequest(request => request.method() === 'PATCH')
  await page.getByRole('button', { name: 'Salvar retificação', exact: true }).click()
  const sent = await request
  if (!(sent.headers()['content-type'] || '').includes('multipart/form-data')) throw new Error('Envio não multipart')
  await page.getByText('Abastecimento do veículo ABC1D23 retificado com sucesso.').waitFor()
  return { matrix: results, invalidFileBlocked: true, multipartSent: true, receiptOnlySuccess: true, data: 'synthetic; API mocked in browser' }
}
