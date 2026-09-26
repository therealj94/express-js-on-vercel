/* EL PRECIO SE REFRESCA SIN MOVER LA PAGINA.
 *
 *   node apps-web/mytokenpay/pruebas/probar-precio-quieto.mjs
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * El precio de ORIGEN se lee cada minuto (plan SFSP v0.3, C5). La primera
 * version repintaba la vista entera en cada lectura —cambiara o no el precio,
 * y aunque el feed fallara— y `vista()` termina con `scrollTo(0, 0)`. Con la
 * sesion abierta en el telefono, quien bajaba a enseñar el QR de cobro que
 * esta bajo el teclado lo perdia de la pantalla una vez por minuto, mientras
 * el otro lo escaneaba.
 *
 * Se congela el reloj del navegador (page.clock) para disparar el minuto sin
 * esperarlo, y el feed se finge con page.route: nada sale a la red.
 *
 * MTP_RAIZ apunta a otra copia de la web para medir el antes y el despues.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = process.env.MTP_RAIZ ? resolve(process.env.MTP_RAIZ) : join(AQUI, '..')
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
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
  executablePath: process.env.MTP_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})
const pg = await nav.newPage({ viewport: { width: 360, height: 560 }, locale: 'es-HN' })
const errores = []
pg.on('pageerror', (e) => errores.push(e.message))

// El feed: CoinGecko contesta lo que diga `onza`; gold-api no contesta.
let onza = 4000
await pg.route('**/*', (r) => {
  const url = r.request().url()
  if (url.startsWith(ORIGEN)) return r.continue()
  if (url.includes('api.coingecko.com')) {
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ 'pax-gold': { usd: onza } }) })
  }
  return r.abort()
})
await pg.clock.install()
await pg.addInitScript(() => localStorage.setItem('mtp.estado', JSON.stringify({
  sesion: { nombre: 'Prueba', correo: 'prueba@ejemplo.com' },
  invitado: false, billetera: null, identidad: 'sin-iniciar', saldo: 120, pagos: [],
})))
await pg.goto(ORIGEN, { waitUntil: 'domcontentloaded' })
await pg.clock.runFor(1500)

// Al cobro de un comercio, y abajo, hasta el QR.
await pg.evaluate(() => { const id = (0, eval)('COMERCIOS')[0].id; MTP.pagarA(id) })
await pg.clock.runFor(500)
const bajar = () => pg.evaluate(() => {
  document.getElementById('qr-caja').scrollIntoView({ block: 'center' })
  const l = document.getElementById('lienzo').firstElementChild
  if (l) l.dataset.marca = 'sigue'
  return window.scrollY
})
const mirar = () => pg.evaluate(() => ({
  y: window.scrollY,
  marca: document.getElementById('lienzo').firstElementChild?.dataset.marca || null,
  equivalente: document.querySelector('.monto-grande')?.nextElementSibling?.textContent || '',
}))

// El reloj de la pagina esta congelado, pero la respuesta del feed llega por
// la red (fingida) en tiempo real: tras cada minuto se le da un respiro.
const pasar = async (ms) => { await pg.clock.runFor(ms); await new Promise((r) => setTimeout(r, 500)) }

const abajo = await bajar()
decir(abajo > 100, 'la vista de cobro es mas alta que la pantalla: el QR queda abajo', `${abajo} px`)

// 1. Pasa un minuto y el precio es el mismo: no se toca nada.
await pasar(61_000)
let m = await mirar()
decir(m.marca === 'sigue', 'con el mismo precio no se repinta la vista')
decir(m.y === abajo, 'y la pagina no se mueve', `${abajo} → ${m.y}`)

// 2. Pasa otro minuto y el oro se movio: se repinta, pero sin subir.
onza = 4100
await pasar(61_000)
m = await mirar()
decir(m.marca === null, 'con otro precio la vista se repinta')
decir(m.y === abajo, 'y la pagina se queda donde estaba', `${abajo} → ${m.y}`)

// 3. El feed se cae y el precio caduca: pasa a guion, tambien sin subir.
await bajar()
onza = 0
await pasar(11 * 60_000)
m = await mirar()
decir(m.equivalente.trim() === '—', 'un precio de mas de 10 minutos pasa a guion', m.equivalente)
decir(m.y === abajo, 'sin mover la pagina', `${abajo} → ${m.y}`)

// 4. Navegar a otra vista si empieza arriba.
await pg.evaluate(() => MTP.vista('pagar'))
m = await mirar()
decir(m.y === 0, 'ir a otra vista empieza arriba', `${m.y}`)

decir(errores.length === 0, 'sin errores en la pagina', errores.slice(0, 2).join(' · '))

await nav.close()
sv.close()
console.log(malas ? `\n${malas} comprobacion(es) fallaron` : '\nTodo en verde')
process.exit(malas ? 1 : 0)
