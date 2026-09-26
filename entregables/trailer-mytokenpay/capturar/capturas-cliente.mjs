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
await pg.goto(B + '/conectar-wallet', { waitUntil: 'networkidle' }); await pg.waitForTimeout(2500)
await pg.locator('input').first().fill('0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2')
await clic(pg, 'Conectar billetera').catch(e => console.log('con', e.message.slice(0, 80)))
await foto(pg, 'c10-wallet', 2200)
await pg.goto(B + '/pagar', { waitUntil: 'networkidle' }); await foto(pg, 'c04-pagar', 3000)
await clic(pg, 'Escanear QR'); await foto(pg, 'c05-escaneando', 900)
await pg.waitForTimeout(3500); await foto(pg, 'c06-monto', 500)
const monto = pg.locator('input').first()
for (const [i, v] of ['5', '5.5', '5.57'].entries()) { await monto.fill(v); await foto(pg, `c07-monto-${i}`, 350) }
await pg.getByText(/^Pagar \d/).last().click().catch(e => console.log('pagar', e.message.slice(0, 90)))
await foto(pg, 'c08-pagado', 2600)
await pg.goto(B + '/verificar-identidad', { waitUntil: 'networkidle' }); await foto(pg, 'c09-genesis', 3500)
await pg.close()
await nav.close(); process.exit(0)
