/* LA VUELTA A AU-RA: A DÓNDE, CON QUÉ CÓDIGO, Y SIN DEJAR A NADIE VARADO.
 *
 *   python3 -m http.server 8791      (en la raíz del repositorio)
 *   node pruebas/sso-aura-vuelta.mjs
 *
 * El contrato con AU-RA (su app nueva y su web):
 *
 *   · `vuelta` es de una lista cerrada: `ultronfp://sso` (también si no viene:
 *     las APK viejas no la mandan) y `https://aura-fp.onrender.com/sso`.
 *     Cualquier otra se ignora y se vuelve a `ultronfp://sso` — con un pase en
 *     la mano, seguir una dirección que escribe quien arma el enlace sería
 *     regalárselo.
 *   · A la vuelta va `pase=…&estado=…` o `error=<código>&estado=…`, con los
 *     códigos: cancelado, sin-gid, gid-pendiente, no-vinculada,
 *     correo-sin-confirmar, limite, red, fallo. Cada 403 del puente con SU
 *     código, no todos como «Genesis no verificado».
 *   · El salto ocurre tras esperar al servidor y Chrome puede bloquearlo: queda
 *     siempre un «Volver a AU-RA» que es un enlace de verdad.
 *   · Quien llega sin Genesis ID puede sacarlo en ese momento: el pedido se
 *     guarda (sessionStorage, media hora) y sobrevive a una recarga; al
 *     terminar, en revisión → vuelve con `gid-pendiente`; verificado → el
 *     permiso y el pase. Un pedido contestado queda gastado.
 */
import { chromium } from 'playwright'

const SITIO = 'http://127.0.0.1:8791/apps-web/veta-wallet/index.html'
const RETO = 'r'.repeat(43)
const ESTADO = 'estado-de-prueba'
const WEB_AURA = 'https://aura-fp.onrender.com/sso'

let f = 0
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++ }

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 'a1', userId: 'a1', address: '0x' + 'a'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y'

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })

/**
 * Abre la wallet con sesión y un pedido de AU-RA.
 * `tokens`: lo que contesta /genesis/sso/token, en orden (el último se repite).
 * Cada uno es [estado, cuerpo] o 'cortar' (fallo de red).
 * `identidad`: lo que contesta /genesis/estado.
 */
async function abrir({ hash, tokens = [[200, { token: 'PASE-DE-PRUEBA' }]], identidad = { estado: 'verificada', gid: 'GEN-AAAA-BBBB-C' }, ctx: ctxDado } = {}) {
  const ctx = ctxDado || await nav.newContext({ viewport: { width: 430, height: 900 }, locale: 'es' })
  const pag = await ctx.newPage()
  pag.errores = []
  pag.pedidos = []
  pag.vincular = 0
  pag.aura = []
  pag.on('pageerror', (e) => pag.errores.push(String(e)))
  await pag.addInitScript(([s]) => {
    localStorage.setItem('veta.idioma', 'es')
    localStorage.setItem('veta.musica', 'no')
    localStorage.setItem('veta.genesis.visto', '1')
    localStorage.setItem('veta.sesion', s)
  }, [JSON.stringify({ token: JWT(), correo: 'ana@x.com', nombre: 'Ana', direccion: '0x' + 'a'.repeat(40) })])
  /* Primero lo de fuera, y DESPUÉS lo concreto: en Playwright manda la ruta
     puesta en último lugar. */
  await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
    if (r.request().url().startsWith(WEB_AURA)) pag.aura.push(r.request().url())
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>AU-RA</p>' })
  })
  await pag.route('**/genesis/estado', (r) => r.fulfill({ json: { identidad } }))
  await pag.route('**/genesis/vincular', (r) => { pag.vincular++; return r.fulfill({ json: { ok: true } }) })
  await pag.route('**/genesis/sso/token', (r) => {
    pag.pedidos.push(JSON.parse(r.request().postData() || '{}'))
    const t = tokens[Math.min(pag.pedidos.length - 1, tokens.length - 1)]
    if (t === 'cortar') return r.abort('connectionreset')
    return r.fulfill({ status: t[0], json: t[1] })
  })
  await pag.route(/^ultronfp:/, (r) => r.abort())
  await pag.goto(`${SITIO}${hash}`, { waitUntil: 'domcontentloaded' })
  return pag
}

const pedido = (extra = '') => `#sso-aura?reto=${RETO}&estado=${ESTADO}${extra}`
const esperarPermiso = (pag) => pag.waitForSelector('[role=dialog] [data-comparte]', { timeout: 20000 }).catch(() => {})
/** El enlace del botón «Volver a AU-RA», o null si no está. */
const enlaceVuelta = async (pag) => {
  // Con la galaxia arrancando en un Chromium sin GPU el hilo principal puede
  // tardar varios segundos en atender una respuesta: se espera al botón.
  await pag.waitForSelector('[data-vuelta-aura] a[data-ir]', { timeout: 20000 }).catch(() => {})
  return pag.evaluate(() => document.querySelector('[data-vuelta-aura] a[data-ir]')?.getAttribute('href') || null)
}
const q = (url) => Object.fromEntries(new URLSearchParams(String(url || '').split('?')[1] || ''))

async function permitirY(opciones) {
  const pag = await abrir({ hash: pedido(), ...opciones })
  await esperarPermiso(pag)
  await pag.click('[role=dialog] [data-si]')
  return pag
}

console.log('\n── la vuelta es de una lista cerrada ─────────────────────────')
{
  // Sin `vuelta` (APK vieja): ultronfp://sso.
  const pag = await permitirY({})
  const url = await enlaceVuelta(pag)
  ok('sin vuelta, al esquema de siempre', String(url).startsWith('ultronfp://sso?'), url)
  ok('con el pase y el eco del estado', q(url).pase === 'PASE-DE-PRUEBA' && q(url).estado === ESTADO)
  ok('el botón «Volver a AU-RA» queda a la vista (por si Chrome bloquea el salto)',
    await pag.isVisible('[data-vuelta-aura] a[data-ir]'))
  ok('sin errores de javascript', pag.errores.length === 0, pag.errores.slice(0, 2).join(' | '))
  await pag.context().close()
}
for (const [nombre, vuelta] of [
  ['una dirección cualquiera', 'https://malo.example/robar'],
  ['la de AU-RA con otra ruta', 'https://aura-fp.onrender.com/otra'],
  ['la de AU-RA con un sufijo', 'https://aura-fp.onrender.com/sso.malo.example'],
  ['otro esquema', 'javascript:alert(1)'],
]) {
  const pag = await abrir({ hash: pedido('&vuelta=' + encodeURIComponent(vuelta)) })
  await esperarPermiso(pag)
  await pag.click('[role=dialog] [data-no]')
  const url = await enlaceVuelta(pag)
  ok(`${nombre} se ignora: vuelve a ultronfp://sso`, String(url).startsWith('ultronfp://sso?') && q(url).error === 'cancelado', url)
  await pag.context().close()
}
{
  const pag = await abrir({ hash: pedido('&vuelta=' + encodeURIComponent(WEB_AURA)) })
  await esperarPermiso(pag)
  await pag.click('[role=dialog] [data-si]')
  for (let i = 0; i < 40 && !pag.aura.length; i++) await pag.waitForTimeout(500)
  ok('la web de AU-RA, que está en la lista, recibe el pase', pag.aura.some((u) => q(u).pase === 'PASE-DE-PRUEBA' && q(u).estado === ESTADO),
    pag.aura.join(' '))
  await pag.context().close()
}

console.log('\n── cada negativa con su código ───────────────────────────────')
const CASOS = [
  ['correo sin confirmar', [[403, { error: 'x', codigo: 'CORREO_NO_VERIFICADO' }]], 'correo-sin-confirmar'],
  ['429', [[429, { error: 'Demasiados intentos', codigo: 'LIMITE' }]], 'limite'],
  ['429 sin cuerpo del puente', [[429, {}]], 'limite'],
  ['Genesis caído', [[504, { error: 'x', codigo: 'GENESIS_RED' }]], 'red'],
  ['un 500 del backend', [[500, { message: 'x' }]], 'red'],
  ['sin red', ['cortar'], 'red'],
  ['bloqueada o suspendida', [[403, { error: 'x', codigo: 'GID_NO_DISPONIBLE' }]], 'fallo'],
  ['un 400 cualquiera', [[400, { error: 'Destino del pase inválido' }]], 'fallo'],
]
for (const [nombre, tokens, codigo] of CASOS) {
  const pag = await permitirY({ tokens })
  const url = await enlaceVuelta(pag)
  ok(`${nombre} → error=${codigo}`, q(url).error === codigo && q(url).estado === ESTADO && !q(url).pase, url)
  ok(`  y no manda a verificarse otra vez`, !(await pag.$('[data-alta-aura]')))
  if (pag.errores.length) ok('  sin errores de javascript', false, pag.errores[0])
  await pag.context().close()
}
{
  // Verificada pero sin atar: se ata y se pide UNA vez más.
  const pag = await permitirY({ tokens: [[403, { error: 'x', codigo: 'CUENTA_NO_VINCULADA' }], [200, { token: 'PASE-TRAS-ATAR' }]] })
  const url = await enlaceVuelta(pag)
  ok('cuenta sin atar: se ata sola y el pase sale', pag.vincular >= 1 && q(url).pase === 'PASE-TRAS-ATAR', `${pag.vincular} · ${url}`)
  ok('  y se pidió dos veces, no más', pag.pedidos.length === 2, String(pag.pedidos.length))
  await pag.context().close()
}
{
  const pag = await permitirY({ tokens: [[403, { error: 'x', codigo: 'CUENTA_NO_VINCULADA' }]] })
  const url = await enlaceVuelta(pag)
  ok('si atarla no basta → error=no-vinculada', q(url).error === 'no-vinculada', url)
  await pag.context().close()
}
{
  const pag = await permitirY({
    tokens: [[403, { error: 'x', codigo: 'GID_PENDIENTE' }]],
    identidad: { estado: 'en-revision', gid: null, hecho: { datos: true, documento: true, rostro: true } },
  })
  const url = await enlaceVuelta(pag)
  ok('en revisión → error=gid-pendiente, sin ofrecer otro trámite', q(url).error === 'gid-pendiente' && !(await pag.$('[data-alta-aura]')), url)
  await pag.context().close()
}

console.log('\n── sin Genesis ID: sacarlo sin perder el pedido ──────────────')
{
  const ctx = await nav.newContext({ viewport: { width: 430, height: 900 }, locale: 'es' })
  const tokens = [[403, { error: 'x', codigo: 'GID_SIN_IDENTIDAD' }]]
  const identidad = { estado: 'iniciada', gid: null }
  const pag = await permitirY({ tokens, identidad, ctx })
  await pag.waitForSelector('[data-alta-aura]', { timeout: 20000 }).catch(() => {})
  ok('sin Genesis ID se ofrece crearlo', Boolean(await pag.$('[data-alta-aura]')))
  ok('  y todavía no se volvió a AU-RA', !(await pag.$('[data-vuelta-aura]')))
  await pag.click('[data-alta-aura] [data-alta]')
  await pag.waitForFunction(() => VETA.dondeEstoy() === 'verificar', null, { timeout: 15000 }).catch(() => {})
  ok('«Crear mi Genesis ID» abre el trámite', (await pag.evaluate(() => VETA.dondeEstoy())) === 'verificar')
  ok('  con el aviso de AU-RA abajo', await pag.isVisible('[data-aviso-aura] [data-volver]'))
  const guardado = await pag.evaluate(() => JSON.parse(sessionStorage.getItem('veta.aura.pedido') || 'null'))
  ok('  el pedido queda guardado en la pestaña, con su fase y su plazo corto',
    guardado?.reto === RETO && guardado?.estado === ESTADO && guardado?.fase === 'alta'
      && guardado.hasta > Date.now() && guardado.hasta <= Date.now() + 31 * 60_000, JSON.stringify(guardado))

  // Una recarga en medio del trámite: la dirección ya no dice #sso-aura.
  const dir = pag.url()
  ok('la dirección ya no lleva el pedido', !dir.includes('sso-aura'), dir)
  await pag.reload({ waitUntil: 'domcontentloaded' })
  await pag.waitForSelector('[data-aviso-aura] [data-volver]', { timeout: 20000 }).catch(() => {})
  ok('tras recargar sigue el trámite con el aviso de AU-RA', await pag.isVisible('[data-aviso-aura] [data-volver]'))
  ok('  y no vuelve a preguntar el permiso', !(await pag.$('[role=dialog] [data-comparte]')))

  // Al terminar el trámite en la web queda en revisión: de vuelta a AU-RA.
  await pag.evaluate(() => { VETA._identidad({ estado: 'en-revision', paso: 'revision' }); VETA._auraTerminar({ hayQueCorregir: false }) })
  const url = await enlaceVuelta(pag)
  ok('al terminar en revisión → error=gid-pendiente, con el mismo estado', q(url).error === 'gid-pendiente' && q(url).estado === ESTADO, url)
  ok('  y el pedido se suelta de la pestaña', (await pag.evaluate(() => sessionStorage.getItem('veta.aura.pedido'))) === null)

  // El mismo enlace otra vez en la misma pestaña (el botón atrás): gastado,
  // no acuña otro pase con el mismo reto.
  const antes = pag.pedidos.length
  await pag.goto('about:blank')
  pag.errores = []   // el guion de arranque no puede tocar localStorage en about:blank
  await pag.goto(`${SITIO}${pedido()}`, { waitUntil: 'domcontentloaded' })
  await pag.waitForTimeout(2500)
  ok('el mismo pedido, ya contestado, no vuelve a abrir el permiso', !(await pag.$('[role=dialog] [data-comparte]')))
  ok('  ni pide un pase', pag.pedidos.length === antes)
  ok('  sin errores de javascript', pag.errores.length === 0, pag.errores.slice(0, 2).join(' | '))
  await ctx.close()
}
{
  // Con algo que corregir no se va: se queda con el aviso.
  const pag = await permitirY({ tokens: [[403, { error: 'x', codigo: 'GID_PENDIENTE' }]], identidad: { estado: 'datos', gid: null } })
  await pag.waitForSelector('[data-alta-aura]', { timeout: 20000 }).catch(() => {})
  ok('a medio trámite se ofrece TERMINARLO', /Terminar/.test(await pag.textContent('[data-alta-aura] [data-alta]').catch(() => '')))
  await pag.click('[data-alta-aura] [data-alta]')
  await pag.evaluate(() => VETA._auraTerminar({ hayQueCorregir: true }))
  await pag.waitForTimeout(400)
  ok('con el documento por corregir no se vuelve a AU-RA', !(await pag.$('[data-vuelta-aura]')) && await pag.isVisible('[data-aviso-aura]'))
  // El aviso deja volver cuando la persona quiera, con el código de ese momento.
  await pag.click('[data-aviso-aura] [data-volver]')
  const url = await enlaceVuelta(pag)
  ok('«Volver a AU-RA» del aviso → error=gid-pendiente', q(url).error === 'gid-pendiente', url)
  await pag.context().close()
}
{
  // Si al terminar ya consta verificado: el permiso, y con él el pase.
  const pag = await permitirY({ tokens: [[403, { error: 'x', codigo: 'GID_SIN_IDENTIDAD' }], [200, { token: 'PASE-RECIEN-VERIFICADO' }]], identidad: { estado: 'iniciada', gid: null } })
  await pag.waitForSelector('[data-alta-aura]', { timeout: 20000 }).catch(() => {})
  await pag.click('[data-alta-aura] [data-alta]')
  await pag.evaluate(() => { VETA._identidad({ estado: 'verificada', gid: 'GEN-AAAA-BBBB-C' }); VETA._auraTerminar({ hayQueCorregir: false }) })
  await esperarPermiso(pag)
  ok('verificado al terminar → vuelve el permiso', Boolean(await pag.$('[role=dialog] [data-comparte]')))
  await pag.click('[role=dialog] [data-si]')
  const url = await enlaceVuelta(pag)
  ok('  y «Permitir» devuelve el pase a AU-RA', q(url).pase === 'PASE-RECIEN-VERIFICADO' && q(url).estado === ESTADO, url)
  await pag.context().close()
}
{
  // Un pedido guardado que venció no revive.
  const ctx = await nav.newContext({ viewport: { width: 430, height: 900 }, locale: 'es' })
  await ctx.addInitScript(([r, e]) => {
    sessionStorage.setItem('veta.aura.pedido', JSON.stringify({ reto: r, estado: e, vuelta: 'ultronfp://sso', fase: 'alta', hasta: Date.now() - 1000 }))
  }, [RETO, ESTADO])
  const pag = await abrir({ hash: '#verificar', ctx })
  await pag.waitForTimeout(2500)
  ok('un pedido guardado que venció no revive', !(await pag.$('[data-aviso-aura]')) && !(await pag.$('[role=dialog] [data-comparte]')))
  await ctx.close()
}

await nav.close()
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n')
process.exit(f ? 1 : 0)
