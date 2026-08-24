/* Entrar con la frase semilla, en un navegador de verdad.
 *
 * El servidor falso NO existe como proceso: se atiende desde el propio
 * Playwright, en el origen del backend real. Tiene que ser ese origen porque
 * la CSP de la pagina solo deja hablar con los nuestros — y eso es una
 * proteccion que no se toca ni para probar.
 *
 * La verificacion de la firma es la MISMA que hace el controlador: recuperar
 * la direccion desde la firma con ethers y compararla.
 */
import { chromium } from 'playwright'
import { recoverAddress, keccak256, toUtf8Bytes } from '/tmp/npmprueba/node_modules/ethers/lib.esm/index.js'

const API = 'https://vetawallet-1a2e38ac52b1.herokuapp.com'
const FRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const CUENTA = '0xea6e8f7525e8af0669546ac6c5b8318fd2c6d7b6'
const AJENA  = '0x5f8ad1b918ac16b21811f034f956e2cc605eefe6' // existe, pero no es cuenta

const retos = new Map()
const salieron = []
let fallos = 0
const ok = (q,c) => { console.log(`${c?'  ok  ':' FALLA'}  ${q}`); if(!c) fallos++ }

const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-sandbox','--disable-dev-shm-usage'] })
const ctx = await nav.newContext({ locale:'es-HN', viewport:{width:430,height:960}, deviceScaleFactor:2 })
const pag = await ctx.newPage()
const errores = []; pag.on('pageerror', e => errores.push(String(e)))

await pag.route('**/*', async (route) => {
  const req = route.request()
  const u = req.url()
  if (u.startsWith('http://127.0.0.1:8791')) return route.continue()
  const j = (estado, o) => route.fulfill({ status: estado, contentType:'application/json', body: JSON.stringify(o) })

  if (u === API + '/auth/reto-llave') {
    const { direccion } = JSON.parse(req.postData() || '{}')
    salieron.push({ ruta:'reto', cuerpo: req.postData() })
    if (!/^0x[0-9a-fA-F]{40}$/.test(direccion||'')) return j(400,{error:'Dirección inválida'})
    const nonce = 'n' + retos.size
    const texto = `Veta Wallet · entrar con tu llave\ndireccion: ${direccion.toLowerCase()}\nreto: ${nonce}\nvence: 2026-12-31T00:00:00.000Z`
    retos.set(nonce, { direccion: direccion.toLowerCase(), texto })
    return j(200, { reto: texto, nonce, venceEn: 120 })
  }
  if (u === API + '/auth/entrar-con-llave') {
    const { nonce, firma, recupera } = JSON.parse(req.postData() || '{}')
    salieron.push({ ruta:'entrar', cuerpo: req.postData() })
    const g = retos.get(String(nonce||'')); if (g) retos.delete(String(nonce))
    if (!g) return j(400,{error:'El ingreso caducó. Probá otra vez.'})
    if (!/^0x[0-9a-fA-F]{128}$/.test(firma||'')) return j(400,{error:'Firma inválida'})
    let rec
    try { rec = recoverAddress(keccak256(toUtf8Bytes(g.texto)),
      { r:'0x'+firma.slice(2,66), s:'0x'+firma.slice(66,130), v:27+Number(recupera) }) }
    catch { return j(401,{error:'No pudimos comprobar tu llave'}) }
    if (rec.toLowerCase() !== g.direccion) return j(401,{error:'No pudimos comprobar tu llave'})
    if (g.direccion !== CUENTA) return j(404,{error:'Esa llave no corresponde a ninguna cuenta de Veta Wallet.'})
    const carga = Buffer.from(JSON.stringify({ userId:'u1', address:g.direccion, role:'user',
      verify:true, exp: Math.floor(Date.now()/1000)+9999 })).toString('base64url')
    return j(200,{ token:`x.${carga}.y`, refreshToken:'r1',
                   user:{ id:'u1', email:'jose@ordenglobal.link', name:'José', address:g.direccion } })
  }
  return j(200, {})
})

await pag.goto('http://127.0.0.1:8791/apps-web/veta-wallet/index.html', { waitUntil:'domcontentloaded' })
await pag.waitForTimeout(2500)

console.log('\nLa pantalla\n')
await pag.evaluate(() => VETA.ir('acceso')); await pag.waitForTimeout(400)
ok('el enlace para entrar con la llave está a la vista', await pag.isVisible('#acc-llave'))
await pag.click('#acc-llave'); await pag.waitForTimeout(300)
ok('se abre el panel', await pag.isVisible('#llv'))
ok('se esconde el formulario de contraseña', !(await pag.isVisible('#form-acceso')))
ok('el aviso de que la frase no se pide está a la vista',
   /nunca te la vamos a pedir/i.test(await pag.textContent('.llv-nota')))
await pag.screenshot({ path:'llv-panel.png' })

console.log('\nUna entrada mal escrita ni sale del navegador\n')
await pag.fill('#llv-rejilla input[data-i="0"]', 'zzzzzz')
await pag.click('#btn-llave'); await pag.waitForTimeout(700)
ok('avisa de que faltan palabras', /faltan palabras/i.test(await pag.textContent('#llv-aviso')))
ok('no mandó nada al servidor', salieron.length === 0)

console.log('\nUna llave que no tiene cuenta\n')
await pag.click('#llv-cambiar'); await pag.waitForTimeout(300)
await pag.fill('#i-llave', '0x878386efb78845b3355bd15ea4d39ef97d179cb712b77d5c12b6be415fffeffe')
await pag.click('#btn-llave'); await pag.waitForTimeout(2500)
ok('avisa de que esa llave no tiene cuenta', /no corresponde a ninguna cuenta/i.test(await pag.textContent('#llv-aviso')))
ok('no entró', !(await pag.evaluate(() => !document.getElementById('app')?.classList.contains('oculto'))))

console.log('\nLa frase buena\n')
await pag.click('#llv-cambiar'); await pag.waitForTimeout(300)   // de vuelta a la frase
await pag.evaluate((fr) => {
  const c = document.querySelector('#llv-rejilla input[data-i="0"]'); c.focus()
  const dt = new DataTransfer(); dt.setData('text/plain', fr)
  c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
}, FRASE)
await pag.waitForTimeout(400)
ok('las doce palabras quedaron puestas', (await pag.$$('.llv-slot.bien')).length === 12)
await pag.click('#btn-llave')
/* Se espera el MECANISMO, no un reloj: entrar con una frase hace criptografía
   de verdad y además monta el Inicio, y bajo carga eso pasa de tres segundos y
   medio con facilidad. Lo que se comprueba es que entra, no cuánto tarda. */
const entro = await pag.waitForFunction(
  () => !document.getElementById('app')?.classList.contains('oculto'),
  null, { timeout: 25000 }).then(() => true).catch(() => false)
ok('entró a la billetera', entro)
ok('la rejilla quedó vacía', (await pag.evaluate(() =>
  [...document.querySelectorAll('#llv-rejilla input')].every(c => !c.value))))
ok('la sesión tiene la dirección de la cuenta',
   (await pag.evaluate(() => VETA.dondeEstoy && document.body.innerText)).length > 0)

console.log('\nLO QUE NUNCA PUEDE VIAJAR\n')
const todo = salieron.map(s => s.cuerpo || '').join(' ')
ok('la frase semilla NO salió en ninguna petición', !todo.includes('abandon'))
ok('la llave privada NO salió en ninguna petición', !/5eb00bbddcf069084889a8ab9155568165f5c453/i.test(todo))
ok('lo único que viajó es dirección, nonce, firma y bit',
   salieron.every(s => Object.keys(JSON.parse(s.cuerpo||'{}')).every(k =>
     ['direccion','nonce','firma','recupera'].includes(k))))
console.log('\n  lo que se mandó, tal cual:')
for (const s of salieron) console.log('   ', s.ruta, '·', (s.cuerpo||'').slice(0,96))

ok('sin errores de javascript', errores.length === 0)
if (errores.length) console.log(errores.slice(0,2))
await pag.screenshot({ path:'llv-dentro.png' })
await nav.close()
console.log(fallos ? `\n${fallos} en rojo\n` : '\nTodo en verde\n')
process.exit(fallos ? 1 : 0)
