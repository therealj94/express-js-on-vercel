/* NEXUSCODER EN UN TELEFONO, medido a 320 y a 360 px.
 *
 *   node apps-web/nexuscoder/pruebas/probar-movil.mjs
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * A 320 px la portada arrastraba la pagina entera de lado (documento de 340 px
 * en una pantalla de 320) y el motivo eran dos minimos duros escritos en el CSS
 * que nadie habia vuelto a mirar desde un telefono:
 *
 *   1. LA REJILLA DE CAPACIDADES pedia `minmax(320px,1fr)`. Eso no es una
 *      preferencia, es un suelo: la columna NO baja de 320 px aunque la caja
 *      util sean 280. Las seis tarjetas se plantaban en 320, empujaban el
 *      documento a 340, y el borde derecho de las seis quedaba cortado.
 *
 *   2. EL TITULAR tenia `clamp(38px,6.4vw,74px)`, con el minimo fijo en 38 px.
 *      Una palabra sola de la casa («infraestructura.», «infrastructure.») mide
 *      a ese cuerpo unos 331 px de monoespaciada, y no hay donde partirla: se
 *      salia 71 px por la derecha y se llevaba la pagina con ella.
 *
 * Los dos son el mismo error de fondo: un numero en pixeles decidido mirando
 * una pantalla ancha, que en un telefono deja de ser un minimo razonable y pasa
 * a ser un empujon. Por eso esta prueba mide a 320 px, que es donde los minimos
 * duros se notan, y no solo a 360.
 *
 * QUE NO CUENTA COMO FALLO, y por que: el halo del heroe (`.glow`) es un
 * degradado de 820 px que sangra por los bordes a proposito, sin texto, sin
 * hijos, sin toque, y su padre lo recorta con `overflow:hidden` porque ese
 * sangrado ES el efecto. Ahi no hay nada que alcanzar y perder un trozo no
 * cuesta nada. Contarlo seria enseñar a ignorar el informe.
 *
 * NXC_RAIZ apunta a otra copia de la web (por ejemplo una sacada de git) para
 * poder medir el antes y el despues con la MISMA vara.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = process.env.NXC_RAIZ ? resolve(process.env.NXC_RAIZ) : join(AQUI, '..')
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
}

/* 320 px es el que manda aqui: es donde los dos minimos duros se notaban. 360
   va detras para que no se arregle uno rompiendo el otro. */
const ANCHOS = [320, 360]

let malas = 0
const decir = (ok, que, extra = '') => {
  if (!ok) malas++
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`)
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 160)}`)
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
  executablePath: process.env.NXC_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})

console.log(`\n════ NEXUSCODER EN UN TELEFONO ${'═'.repeat(28)}`)
console.log(`     web: ${RAIZ}`)

for (const ANCHO of ANCHOS) {
  console.log(`\n── ${ANCHO} px ${'─'.repeat(46)}`)

  const p = await nav.newPage({
    viewport: { width: ANCHO, height: 740 }, deviceScaleFactor: 3, hasTouch: true,
  })
  // Todo lo de fuera se corta: se prueba la caja, no la red. Las tipografias de
  // esta web son locales, asi que el cuerpo del titular se mide con la de verdad.
  await p.route('**/*', (ruta) => ruta.request().url().startsWith(ORIGEN)
    ? ruta.continue()
    : ruta.fulfill({ status: 200, contentType: 'text/plain', body: '' }))

  await p.goto(`${ORIGEN}/index.html`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)

  // ── 1 · la pagina no se arrastra de lado ─────────────────────────────────
  const fuera = await p.evaluate((ancho) => {
    const nombre = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
      + (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')
    const lista = []
    document.querySelectorAll('body *').forEach((el) => {
      if (el.closest('svg')) return
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') return
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      if (r.right <= ancho + 1 && r.left >= -1) return

      // Si algun padre desplaza, se llega con el dedo y esta bien.
      let padre = el.parentElement
      while (padre && padre !== document.body) {
        if (/auto|scroll/.test(getComputedStyle(padre).overflowX)) return
        padre = padre.parentElement
      }
      // El adorno que sangra a proposito: sin texto, sin hijos y sin toque.
      if (!(el.textContent || '').trim() && el.children.length === 0
          && cs.pointerEvents === 'none') return

      lista.push({
        que: nombre(el), izq: Math.round(r.left), der: Math.round(r.right),
        texto: (el.textContent || '').trim().slice(0, 30),
      })
    })
    return { documento: document.documentElement.scrollWidth, lista: lista.slice(0, 6) }
  }, ANCHO)
  console.log(`           medida: documento ${fuera.documento}px de ${ANCHO}px`)
  decir(fuera.documento <= ANCHO, 'la página no se desplaza a lo ancho',
    `documento ${fuera.documento} vs pantalla ${ANCHO}`)
  decir(fuera.lista.length === 0, 'nada se sale del ancho del teléfono',
    fuera.lista.length ? JSON.stringify(fuera.lista) : 'nada suelto ni recortado')

  // ── 2 · el titular: la palabra larga cabe ────────────────────────────────
  const titular = await p.evaluate(() => {
    const h1 = document.querySelector('.heroe h1')
    const cs = getComputedStyle(h1)
    /* Se mide el TROZO mas ancho, no el `h1`: el bloque siempre mide lo que su
       padre le deja, asi que su caja nunca delata el desborde. Quien se sale es
       el renglon de texto de dentro, y eso solo se ve con los rectangulos del
       rango. */
    let der = 0, peor = ''
    for (const t of h1.querySelectorAll('span')) {
      const rango = document.createRange()
      rango.selectNodeContents(t)
      for (const r of rango.getClientRects()) {
        if (r.width > 0 && r.right > der) { der = r.right; peor = t.textContent.trim() }
      }
    }
    return { cuerpo: cs.fontSize, der: Math.round(der), peor, ancho: Math.round(h1.getBoundingClientRect().width) }
  })
  console.log(`           titular a ${titular.cuerpo}: «${titular.peor}» termina en ${titular.der}px`)
  decir(titular.der <= ANCHO, 'la palabra más larga del titular cabe en la pantalla',
    JSON.stringify(titular))

  // ── 3 · las capacidades: la rejilla cede en vez de empujar ───────────────
  const caps = await p.evaluate(() => [...document.querySelectorAll('.rejC .cap')].map((c) => {
    const r = c.getBoundingClientRect()
    return { w: Math.round(r.width), der: Math.round(r.right), t: (c.querySelector('h3')?.textContent || '').trim().slice(0, 22) }
  }))
  decir(caps.length > 0, 'están las tarjetas de capacidades', `${caps.length} tarjeta(s)`)
  const anchas = caps.filter((c) => c.der > ANCHO + 1)
  decir(anchas.length === 0, 'ninguna tarjeta de capacidades se sale del ancho',
    anchas.length ? JSON.stringify(anchas.slice(0, 3)) : `todas ≤ ${ANCHO}px (la mayor mide ${Math.max(...caps.map((c) => c.w))}px)`)

  /* Y que el texto de dentro siga completo: una tarjeta que «cabe» porque le
     cortaron el parrafo no esta arreglada. Se compara el alto del contenido con
     el de la caja. */
  const cortadas = await p.evaluate(() => [...document.querySelectorAll('.rejC .cap')]
    .filter((c) => c.scrollWidth > c.clientWidth + 1)
    .map((c) => ({ t: (c.querySelector('h3')?.textContent || '').trim().slice(0, 22), scroll: c.scrollWidth, caja: c.clientWidth })))
  decir(cortadas.length === 0, 'y ninguna queda con el texto cortado por dentro',
    cortadas.length ? JSON.stringify(cortadas) : 'ninguna')

  await p.close()
}

console.log(`\n${malas === 0 ? 'todo en pie.' : malas + ' comprobación(es) fallaron'}\n`)
await nav.close()
sv.close()
process.exit(malas === 0 ? 0 : 1)
