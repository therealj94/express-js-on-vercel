import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
const B = 'http://127.0.0.1:8790', I = new URL('img/', import.meta.url).pathname
const nav = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-HN' })
await ctx.route('**/picsum.photos/**', async r => {
  const u = r.request().url()
  const m = [['mtp-demo-cafe-cover', 'cafe-cover.jpg'], ['mtp-demo-cafe-g1', 'cafe-g1.jpg'], ['mtp-demo-cafe-g2', 'cafe-g2.jpg'], ['mtp-demo-cafe-g3', 'cafe-g3.jpg'],
    ['mtp-demo-cafe-logo', 'logo-cafe.png'], ['mtp-ni-4-cover', 'calle-cover.jpg'], ['mtp-ni-4-logo', 'logo-cc.png'], ['-logo', 'logo-cc.png']].find(([k]) => u.includes(k))
  const f = m ? m[1] : 'dark.jpg'
  await r.fulfill({ status: 200, contentType: f.endsWith('png') ? 'image/png' : 'image/jpeg', body: await readFile(I + f) })
})
const pg = await ctx.newPage()
await pg.goto(B + '/', { waitUntil: 'networkidle' }); await pg.waitForTimeout(2500)
await pg.getByText('Saltar', { exact: true }).click().catch(() => {})
await pg.goto(B + '/login', { waitUntil: 'networkidle' }); await pg.waitForTimeout(2000)
await pg.getByText('Cliente', { exact: true }).last().click(); await pg.waitForTimeout(3000)
await pg.goto(B + '/explorar', { waitUntil: 'networkidle' }); await pg.waitForTimeout(3000)
const inp = pg.locator('input').first()
for (const [i, v] of ['', 'ca', 'caf', 'café'].entries()) { await inp.fill(v); await pg.waitForTimeout(v ? 900 : 1500); await pg.screenshot({ path: `cap/c03-buscar-${i}.png` }) }
await pg.goto(B + '/negocio/mtp-demo-cafe', { waitUntil: 'networkidle' }); await pg.waitForTimeout(3500)
await pg.screenshot({ path: 'cap/c03-ficha.png' })
console.log('ok'); await nav.close()
