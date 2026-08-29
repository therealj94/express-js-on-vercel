/* LOS ESTADOS DE 24 HORAS, DESDE LA APP.
 *
 * Existían y estaban probados —del lado del relevo— desde hace tiempo: se
 * suben, caducan de verdad a las 24 horas, y a quien bloqueaste no le
 * aparecen. Pero NADA comprobaba que una persona pudiera publicar uno o ver
 * el de otra desde la aplicación.
 *
 * Esa es justo la capa donde se escaparon los fallos de esta semana: la voz
 * troceada, el micrófono automático, el oído sin dueño. Todos tenían el
 * servidor bien y la app mal, y todos aparecieron por la mano de alguien y no
 * por una prueba.
 *
 * Aquí se hace el camino entero con dos personas de verdad en dos navegadores
 * contra un relevo de verdad: Ana publica, Ana lo ve, Beto lo ve. Y lo que más
 * importa: que un estado NO se le muestre a quien no debería.
 */
import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createServer } from 'net'
import { createServer as servidorHttp } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

let mal = 0
const ok = (nombre, cierto, detalle = '') => {
  if (cierto) console.log('  ok    ' + nombre)
  else { mal++; console.log('  FALLA ' + nombre + (detalle ? '\n          ' + detalle : '')) }
}

/* El relevo de verdad, en un puerto que pide el sistema. */
const PUERTO = await new Promise((r) => {
  const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) })
})
const REL = `http://127.0.0.1:${PUERTO}`
const ORIGEN = 'https://cerebro.ordenscan.com'
const SERVIDOR = process.env.SERVIDOR_MENSAJES ||
  new URL('../../../infra/mensajes/servidor.py', import.meta.url).pathname
const CARPETA = mkdtempSync(join(tmpdir(), 'est-'))
const RELEVO = spawn('python3', [SERVIDOR], { env: { ...process.env,
  MENSAJES_DATOS: join(CARPETA, 'd.json'), MENSAJES_PUERTO: String(PUERTO),
  MENSAJES_ARCHIVOS: join(CARPETA, 'arch') }, stdio: 'ignore' })
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 250))
  try { if ((await fetch(REL + '/salud')).ok) break } catch { /* todavía no */ }
}

/* Y la prueba sirve su propio sitio: depender de un servidor puesto a mano es
   lo que dejó a probar-p2c-completo sin correr durante semanas. */
const RAIZ = new URL('../../../', import.meta.url).pathname
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
                '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' }
const sitio = servidorHttp(async (q, r) => {
  try {
    const rel = decodeURIComponent(q.url.split('?')[0])
    const f = join(RAIZ, rel.endsWith('/') ? rel + 'index.html' : rel)
    const d = await readFile(f)
    r.writeHead(200, { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream' })
    r.end(d)
  } catch { r.writeHead(404); r.end('no') }
})
await new Promise((k) => sitio.listen(0, '127.0.0.1', k))
const SITIO = `http://127.0.0.1:${sitio.address().port}/apps-web/veta-wallet/index.html`

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})

/* UNA llave por persona, acuñada UNA vez. Cada `/alta` de la misma cuenta
   vuelve a acuñar y deja invalidada la anterior: pedirla dos veces convierte
   todo lo que venga después en «llave incorrecta». Ya me pasó hoy con una
   sonda contra producción, y volvió a pasar acá. */
const llaves = new Map()
const llaveDe = async (c) => {
  if (!llaves.has(c)) {
    const r = await (await fetch(REL + '/alta', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ correo: c }) })).json()
    llaves.set(c, r.llave)
  }
  return llaves.get(c)
}

async function abrir(correo, nombre) {
  const llave = await llaveDe(correo)
  const pag = await (await nav.newContext({ locale: 'es-HN', viewport: { width: 430, height: 900 } })).newPage()
  const err = []
  pag.on('pageerror', (e) => err.push(String(e)))
  await pag.addInitScript(([u, c, k]) => {
    window.OG_MENSAJES_API = u + '/mensajes'
    try { localStorage.setItem('veta.chat.llave.' + c, k) } catch { /* nada */ }
  }, [ORIGEN, correo, llave])
  /* Todo lo que la app pida al cerebro va al relevo de mentira; lo demás se
     contesta vacío para que ninguna llamada a internet cuelgue la prueba. */
  await pag.route('**/*', async (route) => {
    const u = route.request().url()
    if (u.startsWith(`http://127.0.0.1:${sitio.address().port}`)) return route.continue()
    if (u.startsWith(ORIGEN)) {
      let b = route.request().postData()
      try { const j = JSON.parse(b || '{}'); if (j.sesion) { delete j.sesion; b = JSON.stringify(j) } } catch { /* nada */ }
      const r = await fetch(u.replace(ORIGEN + '/mensajes', REL), { method: route.request().method(),
        headers: { 'content-type': 'application/json' }, body: b })
      return route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await pag.goto(SITIO, { waitUntil: 'domcontentloaded' })
  await pag.waitForTimeout(2400)
  /* EL ARRANQUE, TAL COMO LO HACE probar-p2c-completo. Yo escribía la sesión
     en localStorage y recargaba, y eso NO abre la puerta del chat: `p2cArriba`
     devuelve vacío mientras `chatSt.puerta` sea 'falta', así que no se pintaba
     ni la tira de estados ni las pestañas, y cuatro comprobaciones fallaban
     por mi arranque y no por la función. Se entra por la puerta que la app ya
     tiene para esto. */
  await pag.evaluate(([c, n, a]) => {
    const tk = btoa(JSON.stringify({ sub: c, exp: Math.floor(Date.now() / 1000) + 99999 }))
    VETA._sesion({ token: `x.${tk}.y`, correo: c, nombre: n, direccion: a })
    VETA._identidad({ estado: 'verificada' })
    document.getElementById('app')?.classList.remove('oculto')
    for (const id of ['portada', 'techo', 'acceso', 'reclave']) document.getElementById(id)?.classList.add('oculto')
    VETA.vista('chat')
  }, [correo, nombre, '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2'])
  await pag.waitForTimeout(2800)
  return { pag, err, correo }
}

try {
  const ana = await abrir('ana@prueba.local', 'Ana Prueba')
  const beto = await abrir('beto@prueba.local', 'Beto Prueba')

  /* Se hacen del círculo: sin lazo aceptado, un estado no viaja — y esa es la
     mitad de lo que hay que comprobar. */
  await fetch(REL + '/amistad/pedir', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ correo: 'ana@prueba.local', llave: await llaveDe('ana@prueba.local'),
                           para: 'beto@prueba.local' }) })
  await fetch(REL + '/amistad/responder', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ correo: 'beto@prueba.local', llave: await llaveDe('beto@prueba.local'),
                           de: 'ana@prueba.local', aceptar: true }) })

  /* Antes de que Ana publique, la tira de Beto NO tiene que traerla. Sin esta
     foto previa, «a Beto le aparece Ana» se pondría verde igual si la tira
     mostrara a cada amigo tenga o no algo que contar. */
  const betoAntes = await beto.pag.evaluate(() =>
    [...document.querySelectorAll('.p2c-estados .p2c-est')].map((e) => e.textContent.trim()))

  console.log('\n── Ana publica un estado desde la app ───────────────────────')

  const hayBoton = await ana.pag.evaluate(() =>
    !!document.querySelector('.p2c-est-yo'))
  ok('hay un botón para publicar, a la vista', hayBoton,
     'sin botón no hay función: el relevo la tendría y nadie podría usarla')

  await ana.pag.evaluate(() => (0, eval)('VETA').p2cSubirAbrir())
  await ana.pag.waitForTimeout(700)
  const hayCaja = await ana.pag.evaluate(() => !!document.querySelector('#p2c-est-txt'))
  ok('se abre la caja para escribirlo', hayCaja)

  await ana.pag.evaluate(() => {
    const c = document.querySelector('#p2c-est-txt')
    c.value = 'ESTADO-DE-PRUEBA-DE-ANA'
    c.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await ana.pag.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => /publicar|compartir|subir/i.test(x.textContent || ''))
    if (b) b.click()
    else (0, eval)('VETA').p2cSubirHacer?.(null)
  })
  await ana.pag.waitForTimeout(2600)

  /* `/estados` contesta {gente:[{correo, nombre, estados:[...]}]} —agrupado por
     persona, que es como se mira. Yo leía `.estados` de la raíz, que no existe,
     y daba en rojo con el estado ya publicado y bien guardado. */
  const enElRelevo = await (await fetch(REL + '/estados', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ correo: 'ana@prueba.local', llave: await llaveDe('ana@prueba.local') }) })).json()
  const mios = (enElRelevo.gente || []).find((x) => x.correo === 'ana@prueba.local')
  ok('el estado llega al relevo con su texto',
     !!mios && JSON.stringify(mios).includes('ESTADO-DE-PRUEBA-DE-ANA'),
     `el relevo tiene: ${JSON.stringify(enElRelevo).slice(0, 200)}`)

  console.log('\n── y Beto lo ve ─────────────────────────────────────────────')

  await beto.pag.evaluate(() => (0, eval)('VETA').vista('nucleo'))
  await beto.pag.waitForTimeout(500)
  await beto.pag.evaluate(() => (0, eval)('VETA').vista('chat'))
  await beto.pag.waitForTimeout(2600)

  const leSale = await beto.pag.evaluate(() =>
    [...document.querySelectorAll('.p2c-estados .p2c-est')].map((e) => e.textContent.trim()))
  ok('a Beto le aparece el círculo de Ana —y antes no estaba',
     leSale.some((x) => /ana/i.test(x)) && !betoAntes.some((x) => /ana/i.test(x)),
     `antes: ${JSON.stringify(betoAntes)} · ahora: ${JSON.stringify(leSale)}`)

  /* El aro de «hay algo nuevo» es la clase `sinver` en el círculo (frente a
     `visto`). Antes preguntaba por `.p2c-est-aro, .sinver, .p2c-est`: la última
     alternativa hacía que bastara con que EXISTIERA el círculo, o sea que se
     ponía verde diga lo que diga el aro. Acá se mira la clase, y además que se
     apague al abrirlo — un aviso que nunca se apaga no es un aviso. */
  const aroNuevo = await beto.pag.evaluate(() => {
    const c = [...document.querySelectorAll('.p2c-estados .p2c-est')]
      .find((e) => /ana/i.test(e.textContent))
    return { hay: !!c, sinver: c?.classList.contains('sinver'), visto: c?.classList.contains('visto') }
  })
  ok('con su aro, que es lo que dice «hay algo nuevo»',
     aroNuevo.hay && aroNuevo.sinver && !aroNuevo.visto, JSON.stringify(aroNuevo))

  await beto.pag.evaluate(() => (0, eval)('VETA').p2cVerEstado('ana@prueba.local'))
  await beto.pag.waitForTimeout(2200)
  await beto.pag.evaluate(() => (0, eval)('VETA').vista('nucleo'))
  await beto.pag.waitForTimeout(400)
  await beto.pag.evaluate(() => (0, eval)('VETA').vista('chat'))
  await beto.pag.waitForTimeout(2400)
  const aroApagado = await beto.pag.evaluate(() => {
    const c = [...document.querySelectorAll('.p2c-estados .p2c-est')]
      .find((e) => /ana/i.test(e.textContent))
    return { hay: !!c, sinver: c?.classList.contains('sinver') }
  })
  ok('y el aro se apaga cuando Beto ya lo miró', aroApagado.hay && !aroApagado.sinver,
     JSON.stringify(aroApagado))

  console.log('\n── lo que NO tiene que pasar ────────────────────────────────')

  const zoe = await abrir('zoe@prueba.local', 'Zoe Prueba')
  const leSaleAZoe = await zoe.pag.evaluate(() =>
    [...document.querySelectorAll('.p2c-estados .p2c-est')].map((e) => e.textContent.trim()))
  ok('a quien NO es del círculo no le aparece el estado de Ana',
     !leSaleAZoe.some((x) => /ana/i.test(x)),
     `a Zoe le salió: ${JSON.stringify(leSaleAZoe)} — un estado es para tu gente, ` +
     'no para cualquiera que abra la app')

  console.log('\n── y sin errores por el camino ──────────────────────────────')
  for (const p of [ana, beto, zoe]) {
    ok(`sin errores de javascript (${p.correo.split('@')[0]})`, p.err.length === 0,
       p.err.slice(0, 2).join(' · '))
  }
} finally {
  await nav.close()
  sitio.close()
  RELEVO.kill()
}

console.log(mal ? `\n${mal} en rojo\n` : '\nEstados de 24 horas: todo en verde\n')
process.exit(mal ? 1 : 0)
