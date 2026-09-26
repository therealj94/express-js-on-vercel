/* CADA PRECIO CADUCA POR SU CUENTA.
 *
 *   node apps-web/veta-wallet/pruebas/probar-precio-por-pata.mjs
 *
 * SFSP v0.3 §10.5: sin dato fresco, guion — nunca un valor antiguo — y «la
 * plata sigue el mismo esquema». La billetera web llevaba UN solo reloj para
 * toda la cartera y lo renovaba en cuanto llegaba el oro O la plata. Si solo
 * llegaba una pata, la otra conservaba su precio viejo para siempre:
 *
 *   1. CoinGecko con 429 y gold-api que da la plata pero no el oro: ORIGEN y
 *      AUKA se quedaban con el oro de hace horas, en la lista, el patrimonio y
 *      el equivalente en USD del comprobante.
 *   2. CoinGecko que trae pax-gold sin kinesis-silver: `metales()` no probaba
 *      el respaldo de la plata, y AGKA se quedaba congelado.
 *
 * Se congela el reloj del navegador (page.clock) y el feed se finge: nada sale
 * a la red. VETA_RAIZ apunta a otra copia de la web para medir el antes.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = process.env.VETA_RAIZ ? resolve(process.env.VETA_RAIZ) : join(AQUI, '..')
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.json': 'application/json',
}

let malas = 0
const decir = (ok, que, extra = '') => {
  if (!ok) malas++
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '  · ' + extra : ''}`)
}

const sv = createServer(async (q, r) => {
  const ruta = decodeURIComponent(q.url.split('?')[0])
  try {
    const p = join(RAIZ, ruta.replace(/^\/$/, '/index.html'))
    const d = await readFile(p)
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' })
    r.end(d)
  } catch { r.writeHead(404); r.end('no') }
})
await new Promise((res) => sv.listen(0, '127.0.0.1', res))
const ORIGEN = `http://127.0.0.1:${sv.address().port}`

const nav = await chromium.launch({
  executablePath: process.env.VETA_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})
const pg = await nav.newPage({ locale: 'es-HN' })
await pg.route('**/*', (r) => (r.request().url().startsWith(ORIGEN) ? r.continue() : r.abort()))
await pg.clock.install()
await pg.goto(ORIGEN, { waitUntil: 'domcontentloaded' })
await pg.clock.runFor(500)

const sembrar = () => pg.evaluate(() => {
  const V = (0, eval)('VETA')
  V._cartera([
    { s: 'ORIGEN', cant: 10, leido: true, precio: 2.35, chg: 0.4, declarado: null },
    { s: 'AUKA', cant: 1, leido: true, precio: 4000, chg: 0.4, declarado: null },
    { s: 'AGKA', cant: 2, leido: true, precio: 45, chg: 1.1, declarado: null },
    { s: 'ONDK', cant: 3, leido: true, precio: 1, chg: null, declarado: { precio: 1 } },
  ])
})
// El feed fingido: lo que conteste `p` en cada ciclo.
const feed = (p, chg = {}) => pg.evaluate(([p, chg]) => {
  (0, eval)('CADENA').precios = async () => ({ p, chg })
}, [p, chg])
// Diecisiete ciclos de 40 s: once minutos y pico con el feed en ese estado.
const ciclos = async (n = 17) => {
  for (let i = 0; i < n; i++) {
    await pg.clock.fastForward(40_000)
    await pg.evaluate(() => (0, eval)('VETA')._refrescarPrecios())
  }
}
const precios = () => pg.evaluate(() => {
  const V = (0, eval)('VETA')
  return { ORIGEN: V._precioDe('ORIGEN'), AUKA: V._precioDe('AUKA'), AGKA: V._precioDe('AGKA'), ONDK: V._precioDe('ONDK') }
})

// ── 1. solo llega la plata ──────────────────────────────────────────────────
await sembrar()
await feed({ AGKA: 47 })
await ciclos()
let p = await precios()
decir(p.ORIGEN === null && p.AUKA === null, 'sin oro durante mas de 10 minutos, ORIGEN y AUKA pasan a guion',
  `ORIGEN ${p.ORIGEN} · AUKA ${p.AUKA}`)
decir(p.AGKA === 47, 'la plata que si llega se sigue enseñando', `AGKA ${p.AGKA}`)
decir(p.ONDK === 1, 'el precio declarado por acta no caduca con el feed', `ONDK ${p.ONDK}`)

// ── 2. solo llega el oro ────────────────────────────────────────────────────
await sembrar()
await feed({ AUKA: 4100, ORIGEN: 4100 / 31.1035 / 55 }, { AUKA: 0.2, ORIGEN: 0.2 })
await ciclos()
p = await precios()
decir(p.AGKA === null, 'sin plata durante mas de 10 minutos, AGKA pasa a guion', `AGKA ${p.AGKA}`)
decir(p.AUKA === 4100, 'el oro que si llega se sigue enseñando', `AUKA ${p.AUKA}`)

// ── 3. con el feed entero nada caduca ───────────────────────────────────────
await sembrar()
await feed({ AUKA: 4100, ORIGEN: 4100 / 31.1035 / 55, AGKA: 46 })
await ciclos()
p = await precios()
decir(p.AUKA === 4100 && p.AGKA === 46 && p.ORIGEN > 0, 'con las dos patas llegando, los tres siguen con precio')

// ── 4. todo caido: los tres caducan (lo que ya funcionaba) ─────────────────
await feed({})
await ciclos()
p = await precios()
decir(p.ORIGEN === null && p.AUKA === null && p.AGKA === null, 'con el feed entero caido, los tres pasan a guion')

// ── 5. el respaldo de la plata en cadena.js ────────────────────────────────
// cadena.js se evalua de nuevo en una pagina limpia para probar su metales().
const pg2 = await nav.newPage()
await pg2.route('**/*', (r) => (r.request().url().startsWith(ORIGEN) ? r.continue() : r.abort()))
await pg2.goto(`${ORIGEN}/pruebas/vacio.html`, { waitUntil: 'domcontentloaded' })
const fuente = await readFile(join(RAIZ, 'cadena.js'), 'utf8')
const r5 = await pg2.evaluate(async (src) => {
  window.fetch = async (url) => {
    const u = String(url)
    const json = (d) => ({ ok: true, status: 200, json: async () => d })
    if (u.includes('coingecko')) return json({ 'pax-gold': { usd: 4000, usd_24h_change: 0.3 } })
    if (u.endsWith('/XAG')) return json({ price: 31.5 })
    if (u.endsWith('/XAU')) return json({ price: 3990 })
    throw new Error('sin red')
  }
  const CADENA = (0, eval)(src + '\n;CADENA')
  return CADENA.precios()
}, fuente)
decir(r5.p.AUKA === 4000, 'CoinGecko con oro: AUKA sale de CoinGecko', `AUKA ${r5.p.AUKA}`)
decir(r5.p.AGKA === 31.5, 'CoinGecko sin plata: AGKA sale del respaldo de gold-api', `AGKA ${r5.p.AGKA}`)

await nav.close()
sv.close()
console.log(malas ? `\n${malas} comprobacion(es) fallaron` : '\nTodo en verde')
process.exit(malas ? 1 : 0)
