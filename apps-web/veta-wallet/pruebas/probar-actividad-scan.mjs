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


/* QUE LA ACTIVIDAD LLEVE AL EXPLORADOR.
 *
 * La lista de movimientos enseñaba la direccion y la fecha como texto suelto,
 * sin una sola forma de llegar a ordenscan. Y la casa entera dice lo contrario:
 * AU-RA contesta «cada movimiento queda escrito en nuestra cadena y lo podes
 * comprobar en ordenscan.com sin pedirle permiso a nadie», y el comprobante de
 * un pago en el chat SI enlaza. Desde la pantalla donde de verdad se mira el
 * dinero, no se podia.
 *
 * Lo que mas importa de esta prueba es el caso NEGATIVO: un movimiento sin
 * hash —tarjeta, fiat— no pasa por la cadena, y enlazarlo llevaria a un «no
 * encontrado» que se lee como que la cadena perdio tu plata. */

const ana = await abrir('ana@act.local', 'Ana Act')

await ana.pag.evaluate(() => {
  const V = (0, eval)('VETA')
  // `_sembrarMovs` ya existia para esto: se usa el gancho que hay.
  V._sembrarMovs([
    { hash: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2',
      amount: 5, symbol: 'ORIGEN', timestamp: 1740000000 },
    { txHash: '0xbbbb000000000000000000000000000000000000000000000000000000000002',
      from: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2',
      to: '0x2222222222222222222222222222222222222222',
      amount: 2, symbol: 'ORIGEN', timestamp: 1740000100 },
    // sin hash: un movimiento de tarjeta, que NO pasa por la cadena
    { from: 'tarjeta', to: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2',
      amount: 9, symbol: 'ORIGEN', timestamp: 1740000200 },
  ])
  V.vista('actividad')
})
await ana.pag.waitForTimeout(1500)

const filas = await ana.pag.evaluate(() =>
  [...document.querySelectorAll('.hilera')].map((f) => {
    const a = f.querySelector('.act-scan')
    return { texto: f.textContent.replace(/\s+/g, ' ').trim().slice(0, 60),
             enlace: a?.getAttribute('href') || null,
             nuevaPestana: a?.getAttribute('target') || null }
  }))

ok('hay tres movimientos a la vista', filas.length === 3, JSON.stringify(filas.map(f => f.texto)))

const conHash = filas.filter((f) => f.enlace)
ok('los DOS que pasaron por la cadena llevan al explorador', conHash.length === 2,
   JSON.stringify(conHash.map(f => f.enlace)))
/* Cada enlace lleva el hash de SU fila. Se comprueba por conjunto y no por
   posicion: la lista ordena por fecha —lo mas nuevo arriba— y atarse al orden
   en que se sembraron seria probar el sembrado, no el enlace. */
const hashes = conHash.map((f) => f.enlace.split('/tx/')[1])
ok('cada enlace lleva el hash de SU movimiento',
   hashes.includes('0xaaaa000000000000000000000000000000000000000000000000000000000001')
   && hashes.includes('0xbbbb000000000000000000000000000000000000000000000000000000000002'),
   JSON.stringify(hashes))
ok('y lo más nuevo va arriba',
   hashes[0].startsWith('0xbbbb'),
   'el de las 1740000100 antes que el de las 1740000000')
ok('a ordenscan.com/tx/', conHash.every((f) => f.enlace.startsWith('https://ordenscan.com/tx/0x')))
ok('en pestaña nueva, para no sacarte de la billetera',
   conHash.every((f) => f.nuevaPestana === '_blank'))

/* EL CASO QUE IMPORTA. Un movimiento de tarjeta no esta en la cadena: si se
   enlazara, el explorador diria «no encontrado» y eso se lee como que la
   cadena perdio tu plata. Mejor sin enlace que con uno roto. */
const sinHash = filas.filter((f) => !f.enlace)
ok('el movimiento que NO pasó por la cadena no lleva enlace roto', sinHash.length === 1,
   'un enlace a un hash que no existe dice «no encontrado», y eso asusta con razón')

ok('sin errores de javascript', ana.err.length === 0, ana.err.slice(0, 2).join(' · '))

await nav.close(); sitio.close(); RELEVO.kill()
console.log(mal ? `\n${mal} en rojo\n` : '\nLa actividad lleva al explorador\n')
process.exit(mal ? 1 : 0)
