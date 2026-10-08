async (page) => {
  const requests = [];
  page.on('request', request => { if(request.url().includes('/api/analytics/v2/')) requests.push(new URL(request.url()).pathname); });
  await page.route('**/api/analytics/v2/attention?**', route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Falha simulada de atenção na validação local'})}));
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();
  const attention = page.getByRole('region',{name:'Veículos que exigem atenção',exact:true});
  await attention.getByRole('alert').waitFor();
  await page.getByRole('region',{name:'Situação da frota',exact:true}).getByText('Ativos',{exact:true}).waitFor();
  await page.getByRole('region',{name:'Indicadores do período',exact:true}).locator('article').first().waitFor();
  await page.screenshot({path:'output/playwright/analytics-phase-3/06-partial-error.png',animations:'disabled'});
  await page.unroute('**/api/analytics/v2/attention?**');
  requests.length = 0;
  await attention.getByRole('button',{name:'Tentar novamente',exact:true}).click();
  await attention.getByRole('button').first().waitFor();
  if(requests.length!==1 || requests[0]!=='/api/analytics/v2/attention') throw new Error('Retry touched healthy sources');
  await page.getByRole('textbox',{name:'De',exact:true}).fill('2026-09-01');
  await page.getByRole('textbox',{name:'Até',exact:true}).fill('2026-09-30');
  await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await page.getByRole('region',{name:'Indicadores do período',exact:true}).locator('article').first().waitFor();
  const dates = await page.getByLabel('Recorte aplicado').innerText();
  if(!dates.includes('01/09/2026 a 30/09/2026')) throw new Error('Dates not applied');
  const trigger = attention.getByRole('button').first();
  await trigger.click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  if(await page.getByRole('textbox',{name:'De',exact:true}).inputValue()!=='2026-09-01') throw new Error('Lost dates after drawer');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'output/playwright/analytics-phase-3/07-mobile-viewport.png',animations:'disabled'});
  return {partialErrorIsolated:true,retryOnlyAttention:true,datesAndDrawerPreserved:true,mobileOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)};
}
