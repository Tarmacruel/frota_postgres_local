async (page) => {
  await page.setViewportSize({width:1440,height:1050});
  await page.reload();
  await page.getByRole('region',{name:'Situação da frota',exact:true}).getByText('Ativos',{exact:true}).waitFor();
  await page.getByRole('region',{name:'Indicadores do período',exact:true}).locator('article').first().waitFor();
  await page.getByRole('region',{name:'Veículos que exigem atenção',exact:true}).getByRole('button').first().waitFor();
  await page.screenshot({path:'output/playwright/analytics-phase-3/01-overview-light.png',fullPage:true,animations:'disabled'});
  return {finalAlerts:await page.getByRole('alert').count(),desktopOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)};
}
