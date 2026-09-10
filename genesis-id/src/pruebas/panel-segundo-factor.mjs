/**
 * El segundo factor en el panel, con un navegador de verdad.
 *
 * Las pruebas de `segundo-factor.test.ts` cubren el servidor. Esta cubre lo
 * otro, que es donde se rompen las cosas sin que nadie lo note: que la pantalla
 * pida el código cuando toca, que el QR se dibuje, y que activarlo de punta a
 * punta funcione desde el navegador y no solo desde una llamada a la API.
 *
 * No es una prueba de la suite normal porque levanta un servidor y un
 * Chromium. Se corre a mano:
 *
 *   node src/pruebas/panel-segundo-factor.mjs
 */

import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHmac } from 'crypto'

const carpeta = mkdtempSync(join(tmpdir(), 'panel2fa-'))
const PUERTO = 4000 + Math.floor(Math.random() * 900)
const CLAVE = 'una contrasena de operador bien larga'
/* Se fija en vez de sacarlo del registro. La primera version lo pescaba con una
   expresion regular sobre lo que imprime el servidor, y agarraba el primer
   correo que apareciera, que era el de otro aviso: la prueba fallaba diciendo
   «contrasena incorrecta» cuando lo que estaba mal era el correo. */
const CORREO = 'operador.prueba@ordenglobal.org'

let fallos = 0
const cierto = (cond, txt) => {
  console.log(`${cond ? '  ok  ' : ' FALLA'} ${txt}`)
  if (!cond) fallos++
}

// ── El mismo TOTP, para poder calcular el código que el panel va a pedir.
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function deBase32(t) {
  let bits = 0, valor = 0
  const out = []
  for (const c of String(t).toUpperCase().replace(/[\s=-]/g, '')) {
    valor = (valor << 5) | ALFABETO.indexOf(c)
    bits += 5
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}
function totp(secreto, paso) {
  const c = Buffer.alloc(8)
  c.writeBigUInt64BE(BigInt(paso))
  const h = createHmac('sha1', deBase32(secreto)).update(c).digest()
  const i = h[h.length - 1] & 0x0f
  const n = ((h[i] & 0x7f) << 24) | (h[i + 1] << 16) | (h[i + 2] << 8) | h[i + 3]
  return String(n % 1e6).padStart(6, '0')
}
const paso = () => Math.floor(Date.now() / 1000 / 30)

const servidor = spawn('npx', ['tsx', 'src/index.ts'], {
  env: {
    ...process.env,
    PORT: String(PUERTO),
    GENESIS_DATA_FILE: join(carpeta, 'genesis.json'),
    GENESIS_PERMITIR_ARCHIVO: 'si',
    GENESIS_LISTAS_AUTO: 'no',
    GENESIS_ANCLA_AUTO: 'no',
    GENESIS_ADMIN_PASSWORD: CLAVE,
    GENESIS_ADMIN_EMAIL: CORREO,
    GENESIS_2FA_ROLES: 'admin',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let registro = ''
servidor.stdout.on('data', (d) => { registro += d })
servidor.stderr.on('data', (d) => { registro += d })

const base = `http://127.0.0.1:${PUERTO}`
const esperar = async () => {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/healthz')).ok) return true } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/* La pantalla de carga tapa la cabecera hasta que la primera vista termina de
   pintarse, y con ella encima el clic en «Salir» no llega al botón. Esperarla es
   parte de usar el panel, no un apaño de la prueba. */
async function salirDelPanel(pag) {
  /* `state: 'attached'` y no el 'visible' de por defecto: lo que se espera es
     justamente que el velo esté OCULTO, o sea lo contrario de visible. Con el
     valor de por defecto esto no cuadraba nunca y la prueba fallaba por su
     propio selector, no por el panel. */
  await pag.waitForSelector('#velo.oculto', { state: 'attached', timeout: 20000 })
  await pag.click('button.g:has-text("Salir")')
}

let navegador
try {
  if (!await esperar()) throw new Error('el servidor no arrancó:\n' + registro)

  const correo = CORREO
  console.log(`\nservidor en ${base}, administrador ${correo}\n`)

  /* Se le dice dónde está el Chromium en vez de dejar que lo busque: la versión
     de Playwright del proyecto espera un número de build distinto del que hay
     instalado en la máquina, y sin esto se cae pidiendo que se baje otro. */
  const suyo = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium'
  navegador = await chromium.launch(
    existsSync(suyo) ? { executablePath: suyo } : {})
  const pag = await navegador.newPage()
  const errores = []
  pag.on('pageerror', (e) => errores.push(String(e)))
  await pag.goto(base + '/', { waitUntil: 'domcontentloaded' })
  await pag.waitForTimeout(800)

  console.log('── Entrar sin segundo factor puesto')
  await pag.fill('#eMail', correo)
  await pag.fill('#eClave', CLAVE)
  await pag.click('button[type=submit]')
  await pag.waitForTimeout(1500)
  if (!await pag.isVisible('#app')) {
    console.log('    error en pantalla:', await pag.textContent('#eError').catch(() => '(ninguno)'))
    console.log('    errores de JS:', errores.slice(0, 3))
    console.log('    registro del servidor:', registro.slice(-1200))
  }
  cierto(await pag.isVisible('#app'), 'se entra, porque cerrarlo dejaría fuera al equipo')
  cierto(await pag.isVisible('#qSegundoFactor'), 'sale el botón de activar')
  cierto(/pendiente/.test(await pag.textContent('#qSegundoFactor')),
    'y dice que está pendiente, porque el rol lo exige')

  console.log('\n── Activarlo')
  await pag.click('#qSegundoFactor')
  await pag.waitForTimeout(900)
  cierto(await pag.isVisible('.sfCapa'), 'se abre la ventana')
  cierto((await pag.locator('.sfCapa svg').count()) > 0, 'y el QR se dibuja de verdad')

  const aMano = (await pag.textContent('.sfCapa code')).replace(/\s/g, '')
  // (la clave a mano es el único `code` que hay en esta primera ventana)
  cierto(aMano.length >= 32, 'la clave a mano está y es larga')

  // Con el paso ANTERIOR: activar gasta el código, y el de ahora hace falta
  // entero para la prueba de más abajo.
  await pag.fill('#sfCodigo', totp(aMano, paso() - 1))
  await pag.click('#sfOk')
  await pag.waitForTimeout(1200)

  cierto(await pag.isVisible('#rOk'), 'salen los códigos de recuperación')
  const respaldos = await pag.locator('.rCodigo').allTextContents()
  cierto(respaldos.length === 10, `son diez (salieron ${respaldos.length})`)
  cierto(await pag.isDisabled('#rOk'), 'no se puede cerrar sin confirmar que se apuntaron')
  await pag.check('#rLeido')
  cierto(!(await pag.isDisabled('#rOk')), 'al marcar la casilla ya se puede cerrar')
  await pag.click('#rOk')
  await pag.waitForTimeout(500)
  cierto(/activo/.test(await pag.textContent('#qSegundoFactor')), 'el botón pasa a «activo»')

  console.log('\n── Volver a entrar, ahora con el segundo factor puesto')
  await salirDelPanel(pag)
  await pag.waitForTimeout(800)

  await pag.fill('#eMail', correo)
  await pag.fill('#eClave', CLAVE)
  await pag.click('button[type=submit]')
  await pag.waitForTimeout(1200)
  cierto(!(await pag.isVisible('#app')), 'sin código NO se entra, aunque la contraseña sea buena')
  cierto(await pag.isVisible('#eDosFactoresCaja'), 'y la pantalla pide el código sola')

  const codigo = totp(aMano, paso())
  await pag.fill('#eCodigo', codigo)
  await pag.click('button[type=submit]')
  await pag.waitForTimeout(1500)
  cierto(await pag.isVisible('#app'), 'con el código bueno, se entra')

  console.log('\n── Y el mismo código no sirve dos veces')
  await salirDelPanel(pag)
  await pag.waitForTimeout(800)
  await pag.fill('#eMail', correo)
  await pag.fill('#eClave', CLAVE)
  await pag.fill('#eCodigo', codigo)
  await pag.click('button[type=submit]')
  await pag.waitForTimeout(1200)
  cierto(!(await pag.isVisible('#app')), 'reusar el código no entra')
  cierto(/ya se us/.test(await pag.textContent('#eError')), 'y lo dice con esas palabras')

  console.log('\n── Un código de recuperación')
  await pag.fill('#eCodigo', respaldos[0])
  await pag.click('button[type=submit]')
  await pag.waitForTimeout(1500)
  cierto(await pag.isVisible('#app'), 'un código de recuperación deja entrar')

  cierto(errores.length === 0, `sin errores de JavaScript${errores.length ? ': ' + errores[0] : ''}`)
} catch (e) {
  console.error('\nse rompió:', e.message)
  fallos++
} finally {
  if (navegador) await navegador.close()
  servidor.kill()
  rmSync(carpeta, { recursive: true, force: true })
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\ntodo en verde')
process.exit(fallos ? 1 : 0)
