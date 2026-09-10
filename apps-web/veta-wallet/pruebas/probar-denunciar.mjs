import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { mkdtempSync, readFileSync } from 'fs'
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


/* QUE SE PUEDA DENUNCIAR.
 *
 * No habia forma. Se podia bloquear y silenciar, pero bloquear te protege a VOS
 * y deja a esa persona haciendo lo mismo con todos los demas. Para una app con
 * chat entre personas eso no es solo una carencia de producto: las tiendas lo
 * exigen —Apple lo pide explicitamente para contenido de usuarios— y es de la
 * misma familia que lo que ya bloqueo la publicacion una vez con /privacidad.
 *
 * Se comprueba el camino entero y, sobre todo, LO QUE NO TIENE QUE VIAJAR: el
 * texto del mensaje va cifrado y el relevo no puede abrirlo ni deberia. */

const ana = await abrir('ana@den.local', 'Ana Den')
await fetch(REL + '/amistad/pedir', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ correo: 'ana@den.local', llave: await llaveDe('ana@den.local'), para: 'malo@den.local' }) })
await fetch(REL + '/amistad/responder', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ correo: 'malo@den.local', llave: await llaveDe('malo@den.local'), de: 'ana@den.local', aceptar: true }) })

await ana.pag.evaluate(() => (0, eval)('VETA').vista('chat'))
await ana.pag.waitForTimeout(2200)

await ana.pag.evaluate(() => (0, eval)('VETA').chatDenunciar('malo@den.local'))
await ana.pag.waitForTimeout(700)

const hoja = await ana.pag.evaluate(() => {
  const h = document.querySelector('.den-motivos')
  return { hay: !!h, motivos: [...document.querySelectorAll('.den-motivo')].map(b => b.textContent.trim()),
           aviso: document.querySelector('.chaf-honesto')?.textContent || '' }
})
ok('se abre la hoja para denunciar', hoja.hay)
ok('con varios motivos a elegir, no un campo libre', hoja.motivos.length >= 5,
   hoja.motivos.join(' · '))
ok('y AVISA de que denunciar también bloquea, antes de tocar nada',
   /bloque/i.test(hoja.aviso),
   'enterarse después es una sorpresa desagradable en el peor momento · ' + hoja.aviso.slice(0, 90))

ok('sin elegir motivo no se manda nada', await ana.pag.evaluate(async () => {
  await (0, eval)('VETA').chatDenunciarHacer()
  return !!document.querySelector('.den-motivos')      // la hoja sigue abierta
}))

await ana.pag.evaluate(() => {
  (0, eval)('VETA').chatDenunciarMotivo('estafa')
})
await ana.pag.waitForTimeout(400)
await ana.pag.evaluate(() => {
  const c = document.querySelector('#den-nota')
  if (c) c.value = 'me pidió la frase semilla'
})
await ana.pag.evaluate(() => (0, eval)('VETA').chatDenunciarHacer())
await ana.pag.waitForTimeout(1800)

ok('al mandarla, la hoja se cierra',
   !(await ana.pag.evaluate(() => !!document.querySelector('.den-motivos'))))

/* Y ahora lo que de verdad importa: que la denuncia ESTE en el relevo. Mirarlo
   solo en la pantalla diria que el boton hace algo, no que alguien la va a
   poder leer. */
const bloq = await (await fetch(REL + '/bloqueados', { method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ correo: 'ana@den.local', llave: await llaveDe('ana@den.local') }) })).json()
/* `/bloqueados` contesta {gente:[…]}, no {bloqueados:[…]}. Lo lei mal a la
   primera y la comprobacion dio rojo con el bloqueo YA hecho. */
ok('denunciar bloquea en el mismo gesto',
   (bloq.gente || []).some(x => (x.correo || x) === 'malo@den.local'),
   JSON.stringify(bloq).slice(0, 120))

const datos = JSON.parse(readFileSync(join(CARPETA, 'd.json'), 'utf8'))
const den = (datos.denuncias || [])[0]
ok('la denuncia queda guardada, con quién y por qué',
   den && den.de === 'ana@den.local' && den.a === 'malo@den.local' && den.motivo === 'estafa',
   JSON.stringify(den))
ok('con la nota que escribió', den?.nota === 'me pidió la frase semilla', den?.nota)
ok('y sin abrir, que es como llega a quien revisa', den?.visto === false)

/* Un motivo inventado no entra: la lista es cerrada a proposito. Con un campo
   libre llega todo como «otro» y la bandeja de quien revisa no se puede
   ordenar ni se ve qué problema se repite. */
const r = await fetch(REL + '/denunciar', { method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ correo: 'ana@den.local', llave: await llaveDe('ana@den.local'),
                         a: 'otro@den.local', motivo: 'lo-que-sea' }) })
ok('un motivo que no está en la lista se rechaza', r.status === 400, `HTTP ${r.status}`)

/* ── EL AVISO DE QUE CAMBIAR DE TELEFONO PIERDE EL HISTORIAL ────────────
 *
 * La llave del chat vive en el aparato y NO se puede exportar, a proposito:
 * una llave exportable es una llave que se puede robar. La consecuencia es que
 * en un telefono nuevo —o despues de borrar los datos del navegador— los
 * mensajes viejos no se abren nunca mas. Y no habia forma de enterarse hasta
 * que pasara, que es la peor.
 *
 * Va en la pantalla del codigo de seguridad y no en un aviso al entrar: quien
 * abre esa pantalla ya se esta preguntando como funciona el cifrado. Soltarlo
 * de golpe en medio de una conversacion asusta y no enseña nada. */
await fetch(REL + '/amistad/pedir', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ correo: 'ana@den.local', llave: await llaveDe('ana@den.local'), para: 'bien@den.local' }) })
await fetch(REL + '/amistad/responder', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ correo: 'bien@den.local', llave: await llaveDe('bien@den.local'), de: 'ana@den.local', aceptar: true }) })
await ana.pag.evaluate(() => (0, eval)('VETA').chatAbrir('bien@den.local'))
await ana.pag.waitForTimeout(1200)
await ana.pag.evaluate(() => (0, eval)('VETA').chatVerFicha())
await ana.pag.waitForTimeout(600)
await ana.pag.evaluate(() => (0, eval)('VETA').chatVerCodigo())
await ana.pag.waitForTimeout(1500)

const aviso = await ana.pag.evaluate(() =>
  [...document.querySelectorAll('.chaf-nota')].map(e => e.textContent).join(' '))

ok('se avisa de que en un teléfono nuevo se pierde lo viejo',
   /nuevo/i.test(aviso) && /viejos/i.test(aviso), aviso.slice(0, 150))
ok('y de que los mensajes NUEVOS sí van a funcionar',
   /nuevos sí/i.test(aviso),
   'sin eso el aviso se lee como «el chat se rompe», que no es lo que pasa')
ok('está donde ya se habla del cifrado, no como susto al entrar',
   /clave|llave/i.test(aviso), 'la pantalla del código de seguridad')

ok('sin errores de javascript', ana.err.length === 0, ana.err.slice(0, 2).join(' · '))

await nav.close(); sitio.close(); RELEVO.kill()
console.log(mal ? `\n${mal} en rojo\n` : '\nSe puede denunciar\n')
process.exit(mal ? 1 : 0)
