import { chromium } from 'playwright'
const B = 'http://127.0.0.1:8790'
const nav = await chromium.launch({ args: ['--no-sandbox'] })
const ocultarDemo = () => {
  const quitar = ['Simular pago', 'Simular pago escaneado']
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n; while ((n = w.nextNode())) {
    if (!quitar.includes(n.textContent.trim())) continue
    let e = n.parentElement
    while (e && !(e.tabIndex >= 0 || e.getAttribute('role') === 'button')) e = e.parentElement
    ;(e || n.parentElement).style.visibility = 'hidden'
  }
}
async function sesion(cuenta) {
  const pg = await nav.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-HN' })
  pg.on('pageerror', e => console.log('ERR', e.message.slice(0, 140)))
  await pg.goto(B + '/', { waitUntil: 'networkidle' }); await pg.waitForTimeout(2500)
  await pg.getByText('Saltar', { exact: true }).click().catch(() => {})
  await pg.goto(B + '/login', { waitUntil: 'networkidle' }); await pg.waitForTimeout(2000)
  await pg.getByText(cuenta, { exact: true }).last().click(); await pg.waitForTimeout(3000)
  return pg
}
const foto = async (pg, n, w = 2400) => { await pg.waitForTimeout(w); await pg.evaluate(ocultarDemo); await pg.screenshot({ path: `cap/${n}.png` }); console.log('ok', n) }
const clic = (pg, t) => pg.getByText(t, { exact: true }).last().click({ timeout: 8000 })

// ── cliente ──
let pg = await sesion('Cliente')
await foto(pg, 'c01-inicio', 1500)
await pg.goto(B + '/explorar', { waitUntil: 'networkidle' }); await foto(pg, 'c02-explorar', 3000)
await pg.locator('input').first().fill('café').catch(e => console.log('busq', e.message.slice(0, 80)))
await foto(pg, 'c03-buscar', 2000)
await pg.goto(B + '/pagar', { waitUntil: 'networkidle' }); await foto(pg, 'c04-pagar', 3000)
await clic(pg, 'Escanear QR'); await foto(pg, 'c05-escaneando', 900)
await pg.waitForTimeout(3500); await foto(pg, 'c06-monto', 500)
const monto = pg.locator('input').first()
for (const [i, v] of ['1', '12', '12.5'].entries()) { await monto.fill(v); await foto(pg, `c07-monto-${i}`, 350) }
await pg.getByText(/^Pagar \d/).last().click().catch(e => console.log('pagar', e.message.slice(0, 90)))
await foto(pg, 'c08-pagado', 2600)
await pg.goto(B + '/verificar-identidad', { waitUntil: 'networkidle' }); await foto(pg, 'c09-genesis', 3500)
await pg.goto(B + '/conectar-wallet', { waitUntil: 'networkidle' }); await foto(pg, 'c10-wallet', 3500)
await pg.close()

// ── negocio ──
pg = await sesion('Café')
await pg.goto(B + '/negocio-panel', { waitUntil: 'networkidle' }); await foto(pg, 'n01-panel', 4000)
await pg.goto(B + '/negocio/mtp-demo-cafe', { waitUntil: 'networkidle' }); await pg.waitForTimeout(3000)
await pg.getByText('Menú · paga con ORIGEN').scrollIntoViewIfNeeded()
const mas = async nombre => { await pg.getByText(nombre, { exact: true }).locator('xpath=ancestor::div[2]').locator('xpath=./div[last()]').click(); await pg.waitForTimeout(450) }
await foto(pg, 'n02-menu', 800)
for (const n of ['Espresso doble', 'Cappuccino Veta', 'Baleada gourmet']) { await mas(n); }
await foto(pg, 'n03-menu-carrito', 800)
await clic(pg, 'Ver factura y cobrar'); await foto(pg, 'n04-factura')
await clic(pg, '10%'); await foto(pg, 'n05-factura-propina', 1000)
await clic(pg, 'QR de cobro'); await foto(pg, 'n06-qr')
await clic(pg, 'Volver a la factura'); await pg.waitForTimeout(900)
await clic(pg, 'Dividir cuenta'); await pg.waitForTimeout(1500)
await clic(pg, '3'); await foto(pg, 'n07-dividir', 1000)
await clic(pg, 'Generar códigos QR'); await foto(pg, 'n08-qrs-0')
for (let i = 1; i <= 3; i++) {
  await pg.evaluate(() => document.querySelectorAll('[style*="visibility: hidden"]').forEach(e => e.style.visibility = ''))
  await pg.getByText('Simular pago', { exact: true }).first().click()
  await foto(pg, i < 3 ? `n08-qrs-${i}` : 'n09-acreditado', i < 3 ? 1300 : 2200)
}
await pg.goto(B + '/negocio-panel', { waitUntil: 'networkidle' }); await foto(pg, 'n10-panel-post', 4000)
await clic(pg, 'Retirar a mi banco'); await pg.waitForTimeout(1800)
await clic(pg, 'Todo'); await foto(pg, 'n11-retiro', 1200)
await nav.close()
