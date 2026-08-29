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
/* El relevo necesita una llave VAPID para que el navegador pueda suscribirse:
   sin ella `pedirAvisos` se va por «sin-llave» y el camino de ENCENDER no se
   ejercita. Se fabrica una para la prueba y se tira al terminar. */
import { execFileSync } from 'node:child_process'
const VAPID = join(CARPETA, 'vapid.pem')
execFileSync('openssl', ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', VAPID])

const RELEVO = spawn('python3', [SERVIDOR], { env: { ...process.env,
  MENSAJES_VAPID_PEM: VAPID,
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


/* QUE LOS AVISOS SE PUEDAN APAGAR.
 *
 * `/desuscribir` existia en el relevo desde el principio y NADIE la llamaba.
 * La campana solo salia con el permiso sin decidir y desaparecia en cuanto se
 * concedia: se podian encender y no habia forma de apagarlos desde la app.
 * Quien se arrepentia tenia que ir a los ajustes del navegador a buscar el
 * permiso del sitio, que casi nadie sabe hacer y menos en un telefono.
 *
 * Se comprueba el camino ENTERO y en los dos sentidos, porque un interruptor
 * que enciende y no apaga es exactamente lo que habia. */

const ana = await abrir('ana@avisos.local', 'Ana Avisos')

/* El navegador de la prueba no tiene push de verdad, asi que se le pone uno de
   mentira ANTES de mirar nada: lo que se prueba es que la app haga las dos
   llamadas en el orden correcto, no la red de Google. */
await ana.pag.evaluate(() => {
  window.__desuscrito = 0
  window.__suelta = 0
  const falsa = {
    endpoint: 'https://push.de-mentira/abc',
    toJSON: () => ({ endpoint: 'https://push.de-mentira/abc', keys: { p256dh: 'x', auth: 'y' } }),
    unsubscribe: async () => { window.__suelta++; window.__hay = null; return true },
  }
  // Se empieza SIN suscripcion, que es como llega alguien que todavia no
  // los encendio. Dejarlo ya suscrito hacia que el primer toque APAGARA,
  // y la prueba media el camino al reves sin decirlo.
  window.__hay = null
  const reg = {
    pushManager: {
      getSubscription: async () => window.__hay,
      subscribe: async () => { window.__hay = falsa; return falsa },
    },
  }
  navigator.serviceWorker.register = async () => reg
  navigator.serviceWorker.ready = Promise.resolve(reg)
  Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true })
})

await ana.pag.evaluate(() => (0, eval)('VETA').vista('chat'))
await ana.pag.waitForTimeout(2500)

const campana = () => ana.pag.evaluate(() => {
  const b = document.querySelector('#cha-avisos')
  return b ? { hay: true, on: b.classList.contains('on'),
               dice: b.getAttribute('aria-pressed'), titulo: b.title } : { hay: false }
})

ok('la campana está a la vista con el permiso ya concedido',
   (await campana()).hay,
   'antes desaparecía en cuanto se concedía, y con ella la única salida')

await ana.pag.evaluate(() => (0, eval)('VETA').chatAvisos())
await ana.pag.waitForTimeout(1500)
const encendida = await campana()
ok('al tocarla, los avisos quedan encendidos', encendida.on === true,
   JSON.stringify(encendida))
ok('y lo dice para quien usa lector de pantalla', encendida.dice === 'true')

await ana.pag.evaluate(() => (0, eval)('VETA').chatAvisos())
await ana.pag.waitForTimeout(1500)
const apagada = await campana()
ok('al volver a tocarla, se apagan', apagada.on === false, JSON.stringify(apagada))

const cuentas = await ana.pag.evaluate(() => ({ suelta: window.__suelta }))
ok('y se suelta la suscripción del navegador', cuentas.suelta >= 1,
   `${cuentas.suelta} vez/veces`)

/* Lo que de verdad corta los avisos es que el RELEVO deje de mandar. Se mira
   ahi, y no en el navegador: soltar la suscripcion sin avisar al relevo lo
   deja mandando a un buzon que ya no se lee. */
const ficha = await (await fetch(REL + '/ficha', { method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ correo: 'ana@avisos.local', llave: await llaveDe('ana@avisos.local'),
                         de: 'ana@avisos.local' }) })).json()
ok('el relevo ya no la tiene apuntada',
   !(ficha.ficha?.push || []).some(x => (x.endpoint || '') === 'https://push.de-mentira/abc'),
   JSON.stringify(ficha.ficha?.push || []))

ok('sin errores de javascript', ana.err.length === 0, ana.err.slice(0, 2).join(' · '))

await nav.close(); sitio.close(); RELEVO.kill()
console.log(mal ? `\n${mal} en rojo\n` : '\nLos avisos se pueden apagar\n')
process.exit(mal ? 1 : 0)
