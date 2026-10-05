async (page) => {
  return await page.evaluate(() => Array.from(document.querySelectorAll('.modal-shell,.modal-body,.modal-form-grid,#rectify-receipt,#rectify-liters')).map(e => ({ element: e.className || e.id, width: e.clientWidth, scrollWidth: e.scrollWidth, columns: getComputedStyle(e).gridTemplateColumns })))
}
