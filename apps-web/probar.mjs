// Prueba las dos aplicaciones web en un navegador de verdad.
//
// No comprueba que "se vea bien" — eso se mira. Comprueba lo que se puede
// romper sin que nadie lo note: que los dos idiomas cubran cada texto, que
// ninguna pantalla quede a medio traducir, que las vistas internas se dibujen
// sin errores, y que el ancho de un teléfono no deje nada fuera de la pantalla.
//
//   node probar.mjs

import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Las carpetas de las dos aplicaciones. Se puede apuntar a otro sitio con
// APPS_DIR: el script corre desde donde este playwright, que no siempre es
// donde viven los archivos.
const AQUI = process.env.APPS_DIR || dirname(fileURLToPath(import.meta.url))
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg' }

function servir(raiz) {
  const sv = createServer(async (q, r) => {
    try {
      const p = join(raiz, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'))
      const d = await readFile(p)
      r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' })
      r.end(d)
    } catch { r.writeHead(404); r.end('no') }
  })
  return new Promise(ok => sv.listen(0, () => ok({ sv, base: `http://127.0.0.1:${sv.address().port}` })))
}

let fallos = 0
const decir = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`)
  if (!ok) fallos++
}

const APPS = [
  {
    nombre: 'Veta Wallet', raiz: join(AQUI, 'veta-wallet'), api: 'VETA',
    vistas: ['billetera', 'tarjeta', 'cambiar', 'actividad', 'ajustes',
             'enviar', 'recibir', 'comprar', 'deposito', 'token', 'identidad'],
    tramos: ['que-es', 'boveda', 'ecosistema', 'empezar'],
    sesion: () => localStorage.setItem('veta.sesion', JSON.stringify({
      token: 'x.' + btoa(JSON.stringify({ address: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y',
      correo: 'jose@ordenglobal.org', nombre: 'José Enamorado',
      direccion: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2',
    })),
  },
  {
    nombre: 'MyTokenPay', raiz: join(AQUI, 'mytokenpay'), api: 'MTP',
    vistas: ['inicio', 'explorar', 'pagar', 'cuenta', 'billetera', 'identidad'],
    tramos: ['como', 'negocio', 'eco', 'empezar'],
    sesion: () => localStorage.setItem('mtp.estado', JSON.stringify({
      sesion: { nombre: 'José Enamorado', correo: 'jose@ordenglobal.org' },
      invitado: false, billetera: null, identidad: 'sin-iniciar', saldo: 120, pagos: [],
    })),
  },
]

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})

for (const app of APPS) {
  console.log(`\n══ ${app.nombre}`)
  const { sv, base } = await servir(app.raiz)
  const errores = []
  const pg = await nav.newPage({ viewport: { width: 1440, height: 900 }, locale: 'es-HN' })
  pg.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|Failed to load resource/.test(m.text())) errores.push(m.text()) })
  pg.on('pageerror', e => errores.push(e.message))
  await pg.goto(base, { waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(1200)

  // ── 1. los dos diccionarios cubren las mismas claves ──────────────────────
  // Una clave que existe en uno y falta en el otro deja media pantalla en el
  // idioma equivocado, y solo se descubre cuando alguien la abre.
  const claves = await pg.evaluate(() => ({
    es: Object.keys(I18N.es), en: Object.keys(I18N.en),
  }))
  const soloEs = claves.es.filter(k => !claves.en.includes(k))
  const soloEn = claves.en.filter(k => !claves.es.includes(k))
  decir(soloEs.length === 0 && soloEn.length === 0,
    `los dos idiomas cubren las mismas ${claves.es.length} claves`,
    [soloEs.length ? 'solo en español: ' + soloEs.join(', ') : '',
     soloEn.length ? 'solo en inglés: ' + soloEn.join(', ') : ''].filter(Boolean).join(' · '))

  // ── 2. cada data-t apunta a una clave que existe ──────────────────────────
  const huerfanas = await pg.evaluate(() => {
    const faltan = []
    document.querySelectorAll('[data-t]').forEach(el => { if (!(el.dataset.t in I18N.es)) faltan.push(el.dataset.t) })
    document.querySelectorAll('[data-tp]').forEach(el => { if (!(el.dataset.tp in I18N.es)) faltan.push(el.dataset.tp) })
    return [...new Set(faltan)]
  })
  decir(huerfanas.length === 0, 'cada texto de la página tiene su clave',
    huerfanas.length ? 'sin traducción: ' + huerfanas.join(', ') : '')

  // ── 3. la portada no deja huecos ──────────────────────────────────────────
  const vacios = await pg.evaluate(() =>
    [...document.querySelectorAll('[data-t]')].filter(el => !el.textContent.trim()).map(el => el.dataset.t))
  decir(vacios.length === 0, 'la portada se pinta entera', vacios.length ? 'vacíos: ' + vacios.join(', ') : '')

  // ── 4. el idioma se cambia y se recuerda ──────────────────────────────────
  const antes = await pg.evaluate(() => document.body.innerText.slice(0, 400))
  await pg.click('[data-lang="en"]')
  await pg.waitForTimeout(700)
  const despues = await pg.evaluate(() => document.body.innerText.slice(0, 400))
  decir(antes !== despues, 'cambiar a inglés cambia la página')
  const guardado = await pg.evaluate(() => localStorage.getItem('veta.idioma') || localStorage.getItem('mtp.idioma'))
  decir(guardado === 'en', 'y queda recordado para la próxima visita', `guardado: ${guardado}`)
  await pg.reload({ waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(900)
  const trasRecarga = await pg.evaluate(() => document.documentElement.lang)
  decir(trasRecarga === 'en', 'al recargar sigue en inglés')
  await pg.click('[data-lang="es"]')
  await pg.waitForTimeout(500)

  // ── 5. el recorrido se revela al bajar ────────────────────────────────────
  const antesRev = await pg.evaluate(() => document.querySelectorAll('.rev.ve').length)
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await pg.waitForTimeout(1600)
  const trasRev = await pg.evaluate(() => ({
    ve: document.querySelectorAll('.rev.ve').length, total: document.querySelectorAll('.rev').length }))
  decir(trasRev.ve > antesRev && trasRev.ve === trasRev.total,
    'los bloques del recorrido aparecen al bajar',
    `${antesRev} visibles al abrir, ${trasRev.ve} de ${trasRev.total} al final`)

  // ── 6. las vistas internas se dibujan ─────────────────────────────────────
  await pg.evaluate(app.sesion)
  await pg.goto(base, { waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(1500)
  for (const v of app.vistas) {
    const r = await pg.evaluate(([api, vista]) => {
      // VETA y MTP se declaran con const: son globales lexicas y no cuelgan de
      // window, asi que hay que resolverlas por nombre.
      try { (0, eval)(api).vista(vista) } catch (e) { return { mal: e.message } }
      const l = document.getElementById('lienzo')
      return { largo: (l?.innerText || '').trim().length }
    }, [app.api, v])
    decir(!r.mal && r.largo > 60, `la vista «${v}» se dibuja`, r.mal || (r.largo <= 60 ? `solo ${r.largo} caracteres` : ''))
  }


  // ── 8. dentro de la cuenta no queda la portada por debajo ─────────────────
  // Se colo: el recorrido son secciones hermanas de la bienvenida, y esconder
  // solo la bienvenida dejaba la pagina entera colgando bajo la billetera. En
  // escritorio no se veia porque el riel la tapaba; en un telefono, si.
  const restos = await pg.evaluate(() => {
    const p = document.getElementById('portada')
    return { escondida: p ? p.classList.contains('oculto') : null,
             alto: document.body.scrollHeight, pantalla: innerHeight }
  })
  decir(restos.escondida === true, 'al entrar a la cuenta la portada se esconde entera',
    restos.escondida === null ? 'no existe #portada' : '')
  decir(restos.alto < restos.pantalla * 4, 'y la pagina no arrastra el recorrido detras',
    `${restos.alto} px de alto con una pantalla de ${restos.pantalla}`)

  // ── 9. en un teléfono no se sale nada de la pantalla ──────────────────────
  const tel = await nav.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-HN' })
  tel.on('pageerror', e => errores.push('móvil: ' + e.message))
  await tel.goto(base, { waitUntil: 'domcontentloaded' })
  await tel.waitForTimeout(1800)
  const desborde = await tel.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  decir(desborde <= 1, 'en un teléfono no hay desplazamiento lateral', `sobra ${desborde} px`)
  await tel.close()

  decir(errores.length === 0, 'sin errores de consola', errores.slice(0, 3).join(' · '))
  await pg.close(); sv.close()
}

await nav.close()
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nLas dos aplicaciones pasan todo')
process.exit(fallos ? 1 : 0)
