async (page) => {
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  const reason = 'Correção de dados de identificação do veículo preenchidos incorretamente no cadastro.';
  const login = async (account) => {
    await page.goto('http://127.0.0.1:6971/login');
    await page.getByRole('textbox', { name: 'Login institucional' }).fill(`${account}@justificativas.example.test`);
    await page.getByRole('textbox', { name: 'Sua senha' }).fill('TesteJustificativas2026!');
    await page.getByRole('button', { name: 'Entrar no sistema' }).click();
    await page.waitForURL('http://127.0.0.1:6971/');
    await page.goto('http://127.0.0.1:6971/vehicles');
    await page.getByRole('button', { name: 'Mais ações do veículo JUS0A01' }).waitFor();
    if (await page.getByRole('button', { name: 'Agora não', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Agora não', exact: true }).click();
  };
  const edit = async () => {
    await page.getByRole('button', { name: 'Mais ações do veículo JUS0A01' }).click();
    await page.getByRole('menuitem', { name: 'Editar cadastro' }).click();
    await page.getByRole('textbox', { name: 'Justificativa da edição' }).waitFor();
  };
  await login('admin');
  await page.setViewportSize({ width: 1366, height: 768 });
  await edit();
  await page.getByRole('button', { name: reason, exact: true }).waitFor();
  const input = page.getByRole('textbox', { name: 'Justificativa da edição' });
  if (await input.inputValue() !== '') throw new Error('Preenchimento automático indevido');
  await page.getByRole('button', { name: reason, exact: true }).click();
  await page.screenshot({ path: 'output/playwright/assisted-justifications/chrome-synced.png' });
  await input.fill('Texto manual que deve ser preservado');
  await page.getByRole('button', { name: 'Ver modelos', exact: true }).click();
  await page.getByRole('button', { name: 'Identificação do veículo', exact: true }).click();
  if (await input.inputValue() !== 'Texto manual que deve ser preservado') throw new Error('Texto sobrescrito sem confirmação');
  await page.getByRole('button', { name: 'Manter meu texto' }).click();
  await page.getByRole('button', { name: 'Identificação do veículo', exact: true }).click();
  await page.getByRole('button', { name: 'Substituir texto' }).click();
  if (await input.inputValue() !== reason) throw new Error('Substituição não aplicada');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Ativar modo escuro' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await edit();
  await page.getByRole('button', { name: reason, exact: true }).click();
  await page.screenshot({ path: 'output/playwright/assisted-justifications/chrome-dark-mobile.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error('Overflow horizontal na página móvel');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.context().clearCookies();
  await page.setViewportSize({ width: 1366, height: 768 });
  await login('admin2');
  await edit();
  await page.getByRole('button', { name: 'Ver modelos' }).click();
  await page.getByRole('button', { name: 'Identificação do veículo', exact: true }).waitFor();
  if (await page.getByRole('button', { name: reason, exact: true }).count()) throw new Error('Vazamento de histórico entre contas');
  await page.getByRole('textbox', { name: 'Justificativa da edição' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/assisted-justifications/chrome-other-account.png' });
  return { browser: 'Chrome', syncedFromEdge: true, explicitSelection: true, replacementConfirmed: true, mobileOverflow: false, secondAccountIsolated: true };
}
