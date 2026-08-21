/* PULSE2CHAT entero, con dos navegadores de verdad.
 *
 * Prueba las tres cosas que se rompieron en la mano de quien lo usa —salir del
 * perfil, encontrar los contactos, sentir que guardar guarda— y lo que le
 * faltaba a una app de mensajería: bloquear, borrar un mensaje, buscar dentro
 * de la conversación y comparar el código de seguridad.
 *
 * Lo importante de que sean DOS navegadores: «lo borré para todos» solo
 * significa algo si se puede mirar la otra pantalla.
 */
import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createServer } from 'net'

const PUERTO = await new Promise((r) => {
  const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) })
})
const REL = `http://127.0.0.1:${PUERTO}`
const ORIGEN = 'https://cerebro.ordenscan.com'
const SITIO = 'http://127.0.0.1:8791/apps-web/veta-wallet/index.html'
const SERVIDOR = process.env.SERVIDOR_MENSAJES ||
  new URL('../../../infra/mensajes/servidor.py', import.meta.url).pathname
const CARPETA = mkdtempSync(join(tmpdir(), 'p2c-'))
const RELEVO = spawn('python3', [SERVIDOR], { env: { ...process.env,
  MENSAJES_DATOS: join(CARPETA, 'd.json'), MENSAJES_PUERTO: String(PUERTO),
  MENSAJES_ARCHIVOS: join(CARPETA, 'arch') }, stdio: 'ignore' })
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 250))
  try { if ((await fetch(REL + '/salud')).ok) break } catch {}
}

let f = 0
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++ }
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] })

const llaveDe = async (c) => (await (await fetch(REL + '/alta', { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ correo: c }) })).json()).llave

/* En 430 px de ancho: la casa se esconde cuando se abre un panel, que es donde
   vivía el fallo de «entrar y no poder salir». En una pantalla grande no se
   habría visto nunca. */
async function abrir(correo, nombre, addr) {
  const llave = await llaveDe(correo)
  const pag = await (await nav.newContext({ locale: 'es-HN', viewport: { width: 430, height: 900 } })).newPage()
  const err = []
  pag.on('pageerror', e => err.push(String(e)))
  await pag.addInitScript(([u, c, k]) => {
    window.OG_MENSAJES_API = u + '/mensajes'
    try { localStorage.setItem('veta.chat.llave.' + c, k) } catch {}
  }, [ORIGEN, correo, llave])
  await pag.route('**/*', async (route) => {
    const u = route.request().url()
    if (u.startsWith('http://127.0.0.1:8791')) return route.continue()
    if (u.startsWith(ORIGEN)) {
      let b = route.request().postData()
      try { const j = JSON.parse(b || '{}'); if (j.sesion) { delete j.sesion; b = JSON.stringify(j) } } catch {}
      const r = await fetch(u.replace(ORIGEN + '/mensajes', REL), { method: route.request().method(),
        headers: { 'content-type': 'application/json' }, body: b })
      return route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await pag.goto(SITIO, { waitUntil: 'domcontentloaded' })
  await pag.waitForTimeout(2400)
  await pag.evaluate(([c, n, a]) => {
    const tk = btoa(JSON.stringify({ sub: c, exp: Math.floor(Date.now() / 1000) + 99999 }))
    VETA._sesion({ token: `x.${tk}.y`, correo: c, nombre: n, direccion: a })
    VETA._identidad({ estado: 'verificada' })
    document.getElementById('app')?.classList.remove('oculto')
    for (const id of ['portada', 'techo', 'acceso', 'reclave']) document.getElementById(id)?.classList.add('oculto')
    VETA.vista('chat')
  }, [correo, nombre, addr])
  await pag.waitForTimeout(2600)
  return { pag, err, correo, llave, addr }
}

const post = (ruta, cuerpo) => fetch(REL + ruta, { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })

try {
  const A = await abrir('ana@ordenglobal.link', 'Ana Fajardo', '0x' + 'a'.repeat(40))
  const B = await abrir('beto@ordenglobal.link', 'Beto Cruz', '0x' + 'b'.repeat(40))
  // el relevo guarda la direccion de cada uno en su alta; se refresca el perfil
  await post('/alta', { correo: A.correo, llave: A.llave, nombre: 'Ana Fajardo', addr: A.addr })
  await post('/alta', { correo: B.correo, llave: B.llave, nombre: 'Beto Cruz', addr: B.addr })

  // ── EL FALLO 1: salir de «Mi perfil» ───────────────────────────────────
  console.log('\nMi perfil tiene puerta de salida\n')
  await A.pag.evaluate(() => VETA.chatCodigo())
  await A.pag.waitForTimeout(800)
  ok('se abre Mi perfil', await A.pag.isVisible('.cha-yo'))
  ok('la casa está escondida (es un teléfono)', !(await A.pag.isVisible('.p2c-casa')))
  ok('HAY UN BOTON DE VOLVER', await A.pag.isVisible('.cha-volver-fijo'))
  await A.pag.click('.cha-volver-fijo')
  await A.pag.waitForTimeout(600)
  ok('y lleva de vuelta a la casa', await A.pag.isVisible('.p2c-casa'))
  ok('el perfil se cerró', !(await A.pag.isVisible('.cha-yo')))

  // ── EL FALLO 2 y 3: los contactos, y que guardar se sienta ─────────────
  console.log('\nLos contactos son UNA sola libreta\n')
  await post('/amistad/pedir', { correo: A.correo, llave: A.llave, para: B.correo })
  await A.pag.evaluate(() => VETA.p2cTab('gente'))
  await B.pag.evaluate(() => VETA.p2cTab('gente'))
  await B.pag.waitForTimeout(900)
  await B.pag.evaluate(c => VETA.p2cResponder(c, true), A.correo)
  await B.pag.waitForTimeout(1600)

  const libreta = await B.pag.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('veta.contactos') || '[]') } catch { return [] }
  })
  ok('ACEPTAR a alguien ya lo deja en la libreta de la billetera',
     libreta.some(c => c.correo === 'ana@ordenglobal.link'), JSON.stringify(libreta))
  ok('y con su dirección puesta, lista para mandarle',
     libreta.some(c => (c.dir || '').toLowerCase() === A.addr.toLowerCase()),
     JSON.stringify(libreta.map(c => c.dir)))

  await B.pag.waitForTimeout(400)
  const enGente = await B.pag.evaluate(() => document.getElementById('p2c-cuerpo')?.innerText || '')
  ok('se ven en la pestaña Gente, con ese nombre', /Tus contactos/i.test(enGente),
     enGente.slice(0, 90).replace(/\n+/g, ' | '))
  ok('y Ana aparece ahí', /Ana Fajardo/.test(enGente))
  ok('hay una puerta a la libreta entera', /libreta/i.test(enGente))

  // la misma libreta, vista desde la billetera
  await B.pag.evaluate(() => VETA.vista('contactos'))
  await B.pag.waitForTimeout(700)
  const enBilletera = await B.pag.evaluate(() => document.getElementById('lienzo')?.innerText || '')
  ok('LA BILLETERA ENSEÑA LA MISMA PERSONA', /Ana Fajardo/.test(enBilletera),
     enBilletera.slice(0, 120).replace(/\n+/g, ' | '))
  ok('con el botón de escribirle', /Escribir/.test(enBilletera))
  ok('y el de mandarle', /Enviar/.test(enBilletera))
  await B.pag.evaluate(() => VETA.vista('chat'))
  await B.pag.waitForTimeout(1400)

  // ── BUSCAR DENTRO DE LA CONVERSACION ───────────────────────────────────
  console.log('\nBuscar dentro de la conversación\n')
  await A.pag.evaluate(() => VETA._chatCon({ id: 'beto@ordenglobal.link', nombre: 'Beto', esGrupo: false }))
  await A.pag.waitForTimeout(500)
  for (const txt of ['la reunion es el jueves', 'llevo el acta', 'nos vemos']) {
    await A.pag.fill('#chat-txt', txt)
    await A.pag.press('#chat-txt', 'Enter')
    await A.pag.waitForTimeout(1400)
  }
  await A.pag.evaluate(() => VETA.chatBuscarHiloAbrir())
  await A.pag.waitForTimeout(400)
  ok('se abre el buscador del hilo', await A.pag.isVisible('#cha-busca-hilo'))
  await A.pag.fill('#cha-busca-hilo', 'jueves')
  await A.pag.waitForTimeout(600)
  const hallado = await A.pag.evaluate(() => document.getElementById('chat-msgs')?.innerText || '')
  ok('encuentra el mensaje', /jueves/.test(hallado), hallado.slice(0, 70).replace(/\n+/g, ' | '))
  ok('y esconde los que no casan', !/nos vemos/.test(hallado))
  await A.pag.fill('#cha-busca-hilo', 'zzzz')
  await A.pag.waitForTimeout(600)
  ok('si no hay nada lo dice, y dice por qué',
     /cifrados/.test(await A.pag.evaluate(() => document.getElementById('chat-msgs')?.innerText || '')))
  await A.pag.evaluate(() => VETA.chatBuscarHiloAbrir())
  await A.pag.waitForTimeout(400)

  // ── BORRAR UN MENSAJE ──────────────────────────────────────────────────
  console.log('\nBorrar un mensaje, y que se note en la otra pantalla\n')
  await B.pag.evaluate(() => VETA._chatCon({ id: 'ana@ordenglobal.link', nombre: 'Ana', esGrupo: false }))
  await B.pag.waitForTimeout(2200)
  const id = await A.pag.evaluate(() => {
    const b = [...document.querySelectorAll('.cha-b[data-id]')]
    return b[b.length - 1]?.dataset.id
  })
  ok('hay un mensaje al que agarrarse', !!id, String(id))
  /* OJO: sin las llaves, `evaluate` DEVUELVE la promesa de la hoja, y esa
     promesa solo se resuelve cuando alguien toca un botón — o sea nunca, y la
     prueba se cuelga para siempre. Con las llaves, la flecha no devuelve nada
     y `evaluate` vuelve en el acto. */
  await A.pag.evaluate(i => { VETA.chatBorrarMsg(i) }, id)
  await A.pag.waitForTimeout(700)
  ok('pregunta CUAL de las dos cosas', await A.pag.isVisible('.chaf-hoja'))
  const opciones = await A.pag.evaluate(() => document.querySelector('.chaf-hoja')?.innerText || '')
  ok('las dos salidas están, y dicen qué hace cada una',
     /para todos/i.test(opciones) && /solo para m/i.test(opciones),
     opciones.slice(0, 110).replace(/\n+/g, ' | '))
  await A.pag.evaluate(() => VETA.chatElegido('todos'))
  await A.pag.waitForTimeout(2000)
  ok('a quien lo borró le queda dicho que lo borró',
     /Borraste este mensaje/i.test(await A.pag.evaluate(() => document.getElementById('chat-msgs')?.innerText || '')))
  await B.pag.waitForTimeout(6500)
  const enBeto = await B.pag.evaluate(() => document.getElementById('chat-msgs')?.innerText || '')
  ok('Y A LA OTRA PERSONA TAMBIEN SE LE FUE', !/nos vemos/.test(enBeto),
     enBeto.slice(-90).replace(/\n+/g, ' | '))
  ok('con la marca, no con un hueco mudo', /Se borró este mensaje/i.test(enBeto))

  // ── EL CODIGO DE SEGURIDAD ─────────────────────────────────────────────
  console.log('\nEl código de seguridad, por fin a la vista\n')
  await A.pag.evaluate(() => VETA.chatVerFicha())
  await A.pag.waitForTimeout(1200)
  ok('la ficha ofrece verlo', await A.pag.isVisible('.chaf-codigo'))
  await A.pag.evaluate(() => VETA.chatVerCodigo())
  await A.pag.waitForTimeout(1500)
  const codA = await A.pag.evaluate(() => document.querySelector('.chaf-numeros')?.textContent?.trim() || '')
  ok('sale un código legible en voz alta', /^(\d{5} ){4}\d{5}\s+(\d{5} ){4}\d{5}$/.test(codA), codA)

  await A.pag.evaluate(() => VETA.chatFichaCerrar())
  await B.pag.evaluate(() => VETA.chatVerFicha())
  await B.pag.waitForTimeout(1200)
  await B.pag.evaluate(() => VETA.chatVerCodigo())
  await B.pag.waitForTimeout(1500)
  const codB = await B.pag.evaluate(() => document.querySelector('.chaf-numeros')?.textContent?.trim() || '')
  ok('Y ES EL MISMO EN LOS DOS LADOS', codA && codA === codB, `${codA}  vs  ${codB}`)
  await B.pag.evaluate(() => VETA.chatFichaCerrar())

  // ── BLOQUEAR ───────────────────────────────────────────────────────────
  console.log('\nBloquear\n')
  await A.pag.evaluate(c => { VETA.p2cBloquear(c, true) }, B.correo)
  await A.pag.waitForTimeout(700)
  ok('bloquear pregunta antes', await A.pag.isVisible('.chaf-hoja'))
  const aviso = await A.pag.evaluate(() => document.querySelector('.chaf-hoja')?.innerText || '')
  ok('y dice lo que va a pasar, incluido lo del circulo', /c.rculo/i.test(aviso),
     aviso.slice(0, 130).replace(/\n+/g, ' | '))
  await A.pag.evaluate(() => {
    const h = document.querySelector('.chaf-hoja')
    if (h) [...h.querySelectorAll('button')].find(x => /^Bloquear$/i.test(x.textContent.trim()))?.click()
  })
  await A.pag.waitForTimeout(2200)

  const est = await B.pag.evaluate(async () => {
    try { await CHAT.enviar('ana@ordenglobal.link', 'hola?'); return 'pasó' }
    catch (e) { return 'rechazado ' + (e.code || '') }
  })
  ok('el bloqueado ya no puede escribir', est.startsWith('rechazado'), est)

  await A.pag.evaluate(() => VETA.p2cTab('gente'))
  await A.pag.waitForTimeout(1500)
  const gente = await A.pag.evaluate(() => document.getElementById('p2c-cuerpo')?.innerText || '')
  ok('a Ana le aparece en su lista de bloqueados', /Bloqueados/i.test(gente),
     gente.slice(0, 120).replace(/\n+/g, ' | '))
  ok('con la salida de desbloquear a la vista', /Desbloquear/i.test(gente))

  ok('sin errores de javascript (ana)', A.err.length === 0, A.err.join(' | ').slice(0, 200))
  ok('sin errores de javascript (beto)', B.err.length === 0, B.err.join(' | ').slice(0, 200))
} finally {
  await nav.close()
  RELEVO.kill()
  try { rmSync(CARPETA, { recursive: true, force: true }) } catch {}
}

console.log(f ? `\n${f} en rojo\n` : '\nPULSE2CHAT completo: todo en verde\n')
process.exit(f ? 1 : 0)
