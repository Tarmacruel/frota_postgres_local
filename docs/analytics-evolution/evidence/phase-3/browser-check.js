async (page) => {
  const results = {};
  const requests = [];
  page.on('request', request => { if(request.url().includes('/api/analytics/')) requests.push(new URL(request.url()).pathname); });
  await page.reload();
  await page.getByRole('region',{name:'Situação da frota',exact:true}).getByText('Ativos',{exact:true}).waitFor();
  await page.getByRole('region',{name:'Indicadores do período',exact:true}).locator('article').first().waitFor();
  results.overviewRequests = [...requests];
  if(requests.some(url=>!url.includes('/v2/'))) throw new Error('V1 requested by overview');
  await page.getByRole('button',{name:'Ativar modo escuro',exact:true}).click();
  await page.screenshot({path:'output/playwright/analytics-phase-3/02-overview-dark.png',fullPage:true,animations:'disabled'});
  const trigger = page.getByRole('region',{name:'Veículos que exigem atenção',exact:true}).getByRole('button').first();
  await trigger.focus(); await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  if(!await page.getByText('Detalhamento ainda não disponível',{exact:true}).isVisible()) throw new Error('Drawer placeholder absent');
  await page.screenshot({path:'output/playwright/analytics-phase-3/03-drawer-dark.png',animations:'disabled'});
  await page.keyboard.press('Escape');
  results.focusRestored = await trigger.evaluate(el=>el===document.activeElement);
  if(!results.focusRestored) throw new Error('Focus not restored');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'output/playwright/analytics-phase-3/04-mobile-dark.png',fullPage:true,animations:'disabled'});
  results.mobileOverflow = await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  await page.getByRole('button',{name:'Ativar modo claro',exact:true}).click();
  await page.screenshot({path:'output/playwright/analytics-phase-3/05-mobile-light.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1440,height:1050});
  await page.evaluate(()=>window.scrollTo(0,0));
  return results;
}
