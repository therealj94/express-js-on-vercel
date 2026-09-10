/* MYTOKENPAY EN UN TELEFONO, medido a 320 y a 360 px.
 *
 *   node apps-web/mytokenpay/pruebas/probar-movil.mjs
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * El techo de la portada lleva tres piezas en una sola fila (la marca, el
 * enlace al ecosistema y el par ES/EN) y juntas miden unos 370 px. A 360 px,
 * quitando el relleno, quedaban 324 libres. El que sobraba era el ultimo de la
 * fila, o sea EL IDIOMA: medido antes del arreglo, el boton «EN» empezaba en
 * 353 px y terminaba en 401 px de una pantalla de 360, y a 320 px se salian los
 * dos botones.
 *
 * Y no se veia, que es lo peor del caso. El techo es `position:fixed`, asi que
 * lo que se sale de el no alarga el documento ni saca barra de desplazamiento:
 * el boton simplemente quedaba fuera del cristal, sin ningun gesto que lo
 * trajera. Alguien que abriera la pagina en ingles no tenia forma de volver al
 * español desde el telefono. No es un defecto de maquetacion: es un mando
 * perdido, que es la misma clase de fallo que en Ordenex dejo «Cancelar» fuera
 * del borde.
 *
 * Asi que esto no comprueba que el techo «se vea bien»: comprueba que se pueda
 * LLEGAR con el dedo a los dos idiomas y que tocarlos cambie la pagina de
 * verdad, y deja los numeros escritos para que la proxima regresion se lea como
 * un numero y no como una impresion.
 *
 * MTP_RAIZ apunta a otra copia de la web (por ejemplo una sacada de git) para
 * poder medir el antes y el despues con la MISMA vara.
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

/* Los dos anchos que importan:
     320 · el iPhone SE y los Android baratos que todavia se venden aca, donde
           se salian los DOS botones de idioma
     360 · el ancho mas comun de Android en la region, donde se salia «EN» */
const ANCHOS = [320, 360]

let malas = 0
const decir = (ok, que, extra = '') => {
  if (!ok) malas++
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`)
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 160)}`)
}

// ── el servidor: solo la web, sin nada de fuera ─────────────────────────────
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

console.log(`\n════ MYTOKENPAY EN UN TELEFONO ${'═'.repeat(28)}`)
console.log(`     web: ${RAIZ}`)

for (const ANCHO of ANCHOS) {
  console.log(`\n── ${ANCHO} px ${'─'.repeat(46)}`)

  /* Con `hasTouch` el navegador aplica las reglas de puntero grueso, que es
     donde vive la mitad de esta clase de fallos. Sin `isMobile` a proposito:
     ese modo mete la ventana virtual de Chrome por medio y `innerWidth` deja de
     ser los pixeles que se estan midiendo, y una prueba que mide otra cosa que
     la que dice medir no sirve de vara. */
  const p = await nav.newPage({
    viewport: { width: ANCHO, height: 740 }, deviceScaleFactor: 3, hasTouch: true,
  })
  /* Todo lo de fuera se corta: se prueba la caja, no la red. Las tipografias de
     Google tampoco entran, asi que se mide con la de repuesto. Da igual a
     proposito: el arreglo no reparte pixeles contados, deja que el enlace al
     ecosistema ceda ancho con puntos suspensivos, y eso aguanta cualquier
     tipografia. Si algun dia hiciera falta el cuerpo exacto, esta prueba
     estaria midiendo lo que no es. */
  await p.route('**/*', (ruta) => ruta.request().url().startsWith(ORIGEN)
    ? ruta.continue()
    : ruta.fulfill({ status: 200, contentType: 'text/plain', body: '' }))

  await p.goto(`${ORIGEN}/index.html`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)

  // ── 1 · nada se sale del ancho ────────────────────────────────────────────
  const fuera = await p.evaluate((ancho) => {
    const nombre = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
      + (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')
    const lista = []
    document.querySelectorAll('body *').forEach((el) => {
      /* Lo de dentro de un SVG no se mide: sus coordenadas son las del lienzo,
         no las de la pagina, y un `path` que «se sale» es casi siempre un
         adorno recortado a proposito por el `viewBox`. */
      if (el.closest('svg')) return
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') return
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      if (r.right <= ancho + 1 && r.left >= -1) return

      /* Desbordar no es el pecado: el pecado es desbordar SIN SALIDA. Si algun
         padre desplaza, se llega con el dedo y esta bien. Y un adorno sin texto,
         sin hijos y sin toque tampoco cuenta: sangrar por el borde es su
         trabajo y no hay nada ahi que alcanzar. */
      let padre = el.parentElement
      while (padre && padre !== document.body) {
        if (/auto|scroll/.test(getComputedStyle(padre).overflowX)) return
        padre = padre.parentElement
      }
      if (!(el.textContent || '').trim() && el.children.length === 0
          && cs.pointerEvents === 'none') return

      lista.push({
        que: nombre(el), izq: Math.round(r.left), der: Math.round(r.right),
        texto: (el.textContent || '').trim().slice(0, 30),
      })
    })
    return { documento: document.documentElement.scrollWidth, lista: lista.slice(0, 6) }
  }, ANCHO)
  decir(fuera.lista.length === 0 && fuera.documento <= ANCHO,
    'nada se sale del ancho del teléfono',
    fuera.lista.length ? JSON.stringify(fuera.lista) : `documento: ${fuera.documento}px`)

  // ── 2 · LA PRUEBA CARA: los dos idiomas se alcanzan con el dedo ───────────
  const techo = await p.evaluate(() => {
    const caja = (el) => {
      const r = el.getBoundingClientRect()
      return { izq: Math.round(r.left), der: Math.round(r.right), alto: Math.round(r.height) }
    }
    const es = document.querySelector('.idiomas button[data-lang="es"]')
    const en = document.querySelector('.idiomas button[data-lang="en"]')
    const eco = document.querySelector('.techo a.btn')
    return { es: caja(es), en: caja(en), eco: caja(eco), marca: caja(document.querySelector('.techo .tm')), ventana: innerWidth }
  })
  console.log(`           medida: ES ${techo.es.izq}→${techo.es.der} · EN ${techo.en.izq}→${techo.en.der} · de ${techo.ventana}px`)

  /* No se pregunta si «entra bonito»: se pregunta si el boton esta ENTERO
     dentro del cristal. Medio boton de idioma en un telefono se falla mas veces
     de las que se acierta, y el techo es fijo: lo que queda fuera no vuelve con
     ningun gesto. */
  for (const [rot, c] of [['ES', techo.es], ['EN', techo.en]])  {
    decir(c.izq >= 0 && c.der <= ANCHO,
      `el botón de idioma «${rot}» cabe entero en la pantalla`, JSON.stringify(c))
  }
  decir(techo.eco.der <= ANCHO && techo.eco.izq >= 0,
    'y el enlace al ecosistema tampoco se sale', JSON.stringify(techo.eco))
  decir(techo.eco.der <= techo.es.izq + 1,
    'el enlace al ecosistema no se monta encima del par de idiomas',
    `ecosistema termina en ${techo.eco.der}, ES empieza en ${techo.es.izq}`)

  /* Y que llegar sirva: se TOCA de verdad, con el dedo y sin trampas. Nada de
     `dispatchEvent`: el clic sintetico atraviesa cualquier cosa que este
     encima, y «el techo fijo se come el toque» es justo uno de los fallos que
     esto busca. */
  let toco = true, porQue = ''
  try {
    await p.locator('.idiomas button[data-lang="en"]').click({ timeout: 6000 })
  } catch (e) {
    toco = false
    porQue = /intercepts pointer events/.test(String(e?.message || ''))
      ? 'algo se pone encima del botón y se come el toque'
      : 'el toque no llegó al botón'
  }
  await p.waitForTimeout(700)
  const enIngles = await p.evaluate(() => ({
    lang: document.documentElement.lang,
    marcado: document.querySelector('.idiomas button[data-lang="en"]').getAttribute('aria-pressed'),
  }))
  decir(toco && enIngles.marcado === 'true',
    'y tocarlo cambia de verdad el idioma de la página', porQue || JSON.stringify(enIngles))

  // Y vuelta: quedarse encerrado en un idioma es la mitad del fallo.
  let volvio = true
  try {
    await p.locator('.idiomas button[data-lang="es"]').click({ timeout: 6000 })
  } catch { volvio = false }
  await p.waitForTimeout(700)
  const enEspanol = await p.evaluate(() =>
    document.querySelector('.idiomas button[data-lang="es"]').getAttribute('aria-pressed'))
  decir(volvio && enEspanol === 'true', 'y se puede volver al español desde el teléfono', `aria-pressed=${enEspanol}`)

  /* En inglés el enlace dice «← Ecosystem» y en español «← Ecosistema»: la
     etiqueta cambia de largo con el idioma, asi que se vuelve a medir con el
     texto ya cambiado. Un techo que cabe en un idioma y no en el otro es el
     mismo fallo a medio arreglar. */
  await p.locator('.idiomas button[data-lang="en"]').click({ timeout: 6000 }).catch(() => {})
  await p.waitForTimeout(700)
  const enIdiomaLargo = await p.evaluate(() => {
    const caja = (el) => { const r = el.getBoundingClientRect(); return { izq: Math.round(r.left), der: Math.round(r.right) } }
    return { eco: caja(document.querySelector('.techo a.btn')), en: caja(document.querySelector('.idiomas button[data-lang="en"]')) }
  })
  decir(enIdiomaLargo.en.der <= ANCHO && enIdiomaLargo.eco.der <= ANCHO,
    'con la página en inglés el techo sigue cabiendo', JSON.stringify(enIdiomaLargo))

  await p.close()
}

console.log(`\n${malas === 0 ? 'todo en pie.' : malas + ' comprobación(es) fallaron'}\n`)
await nav.close()
sv.close()
process.exit(malas === 0 ? 0 : 1)
