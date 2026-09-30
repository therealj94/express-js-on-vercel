/* EL PERMISO DE AU-RA DICE EXACTAMENTE LO QUE AU-RA RECIBE.
 *
 *   python3 -m http.server 8791      (en la raíz del repositorio)
 *   node pruebas/sso-aura-permiso.mjs
 *
 * AU-RA abre la wallet con `#sso-aura?reto=…&estado=…` y la persona decide.
 * Lo que decide tiene que ser la verdad: al canjear el pase, Genesis le da a
 * AU-RA el nombre (gid.perfil), el cumpleaños SIN año (gid.cumple), el correo
 * (gid.correo), y el chat PULSE2CHAT canjea el mismo pase. Ni más —prometer
 * menos de lo que se entrega es engañar— ni menos.
 *
 * Se entra con una sesión guardada (el camino de quien ya usa la wallet) y se
 * mira la lista del permiso, que «No» no acuña nada y que «Permitir» pide el
 * pase para las dos apps con el reto que mandó AU-RA.
 */
import { chromium } from 'playwright'

const SITIO = 'http://127.0.0.1:8791/apps-web/veta-wallet/index.html'
const RETO = 'r'.repeat(43)
const ESTADO = 'estado-de-prueba'

let f = 0
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++ }

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 'a1', userId: 'a1', address: '0x' + 'a'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y'

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })

async function abrir() {
  const ctx = await nav.newContext({ viewport: { width: 430, height: 900 }, locale: 'es' })
  const pag = await ctx.newPage()
  pag.errores = []
  pag.pedidos = []
  pag.on('pageerror', (e) => pag.errores.push(String(e)))
  await pag.addInitScript(([s]) => {
    localStorage.setItem('veta.idioma', 'es')
    localStorage.setItem('veta.musica', 'no')
    localStorage.setItem('veta.genesis.visto', '1')
    localStorage.setItem('veta.sesion', s)
  }, [JSON.stringify({ token: JWT(), correo: 'ana@x.com', nombre: 'Ana', direccion: '0x' + 'a'.repeat(40) })])
  /* Primero lo de fuera, y DESPUÉS lo concreto: en Playwright manda la ruta
     puesta en último lugar. */
  await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 200, json: {} }))
  await pag.route('**/genesis/sso/token', (r) => {
    pag.pedidos.push(JSON.parse(r.request().postData() || '{}'))
    return r.fulfill({ json: { token: 'PASE-DE-PRUEBA' } })
  })
  // La vuelta a AU-RA es un esquema propio (ultronfp://): se apunta y no se sigue.
  await pag.route(/^ultronfp:/, (r) => r.abort())
  await pag.goto(`${SITIO}#sso-aura?reto=${RETO}&estado=${ESTADO}`, { waitUntil: 'domcontentloaded' })
  await pag.waitForSelector('[role=dialog] [data-comparte]', { timeout: 20000 }).catch(() => {})
  return pag
}

console.log('\n── lo que dice el permiso ───────────────────────────────────')
{
  const pag = await abrir()
  const lista = await pag.evaluate(() =>
    [...document.querySelectorAll('[data-comparte] li')].map((li) => li.textContent.trim()))
  ok('aparece el permiso de AU-RA', lista.length > 0)
  ok('lista CUATRO cosas, ni una más', lista.length === 4, JSON.stringify(lista))
  ok('el nombre', /nombre/i.test(lista[0] || ''), lista[0])
  ok('el cumpleaños, día y mes', /cumpleaños/i.test(lista[1] || '') && /día y mes/i.test(lista[1] || ''), lista[1])
  ok('y dice que NUNCA el año', /nunca el año/i.test(lista[1] || ''))
  ok('el correo', /correo/i.test(lista[2] || ''), lista[2])
  ok('y que se conecta el chat PULSE2CHAT', /PULSE2CHAT/.test(lista[3] || '') && /conecta/i.test(lista[3] || ''), lista[3])
  const todo = await pag.evaluate(() => document.querySelector('[data-comparte]')?.closest('[role=dialog]')?.textContent || '')
  ok('no promete lo que no se da (ni «Genesis ID» como dato suelto ni «verificado»)',
    !lista.some((x) => /verificad|Genesis ID/i.test(x)))
  ok('y recuerda lo que NO sale: contraseña, frase semilla, fondos',
    /contraseña/.test(todo) && /frase semilla/.test(todo) && /fondos/.test(todo))
  ok('sin pedir el pase antes de que la persona decida', pag.pedidos.length === 0)

  await pag.click('[role=dialog] [data-no]')
  await pag.waitForTimeout(600)
  ok('«No» cierra sin acuñar nada', pag.pedidos.length === 0 && !(await pag.$('[role=dialog] [data-comparte]')))
  ok('sin errores de javascript', pag.errores.length === 0, pag.errores.slice(0, 2).join(' | '))
  await pag.context().close()
}

console.log('\n── «Permitir» pide el pase para las dos, con el reto de AU-RA ─')
{
  const pag = await abrir()
  await pag.click('[role=dialog] [data-si]')
  /* Se espera a que se cierre, no un tiempo fijo: con la galaxia arrancando
     en un Chromium sin GPU, el hilo principal a veces tarda más de un segundo
     en atender la respuesta. */
  await pag.waitForSelector('[role=dialog] [data-comparte]', { state: 'detached', timeout: 15000 }).catch(() => {})
  const p = pag.pedidos[0] || {}
  ok('se pide UN pase', pag.pedidos.length === 1, String(pag.pedidos.length))
  ok('para AU-RA y el chat (aud)', JSON.stringify(p.aud) === JSON.stringify(['aura', 'pulse2chat']), JSON.stringify(p.aud))
  ok('con el reto que mandó AU-RA', p.reto === RETO)
  ok('y el permiso se cierra', !(await pag.$('[role=dialog] [data-comparte]')))
  await pag.context().close()
}

await nav.close()
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n')
process.exit(f ? 1 : 0)
