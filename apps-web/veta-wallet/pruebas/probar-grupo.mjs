/* Llamada de grupo en malla, con TRES navegadores de verdad.
 *
 * Lo que se comprueba no es que arranque: es que el TERCERO oiga al SEGUNDO.
 * Ese es el fallo clasico de una malla mal hecha —cada uno conectado solo con
 * quien lo llamo— y no se nota con dos personas.
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
const ARGS = ['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
              '--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage']

const SERVIDOR = process.env.SERVIDOR_MENSAJES ||
  new URL('../../../infra/mensajes/servidor.py', import.meta.url).pathname
const CARPETA = mkdtempSync(join(tmpdir(), 'gru-'))
const RELEVO = spawn('python3', [SERVIDOR], {
  env: { ...process.env, MENSAJES_DATOS: join(CARPETA,'d.json'),
         MENSAJES_PUERTO: String(PUERTO), MENSAJES_ARCHIVOS: join(CARPETA,'arch') },
  stdio: 'ignore' })
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 250))
  try { const r = await fetch(REL + '/salud'); if (r.ok) break } catch {}
}

let f = 0
const ok = (q,c,x='') => { console.log(`${c?'  ok  ':' FALLA'}  ${q}${x?'  · '+x:''}`); if(!c) f++ }
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ARGS })

const llaveDe = async (correo) => (await (await fetch(REL + '/alta', { method:'POST',
  headers:{'content-type':'application/json'}, body: JSON.stringify({ correo }) })).json()).llave

async function abrir(correo, nombre) {
  const llave = await llaveDe(correo)
  const ctx = await nav.newContext({ locale:'es-HN', viewport:{width:430,height:900},
    permissions:['microphone','camera'] })
  const pag = await ctx.newPage()
  const err = []; pag.on('pageerror', e => err.push(String(e)))
  await pag.addInitScript(([u,c,k]) => {
    window.OG_MENSAJES_API = u + '/mensajes'
    try { localStorage.setItem('veta.chat.llave.' + c, k) } catch {}
  }, [ORIGEN, correo, llave])
  await pag.route('**/*', async (route) => {
    const u = route.request().url()
    if (u.startsWith('http://127.0.0.1:8791')) return route.continue()
    if (u.startsWith(ORIGEN)) {
      let cuerpo = route.request().postData()
      try { const b = JSON.parse(cuerpo||'{}'); if (b.sesion) { delete b.sesion; cuerpo = JSON.stringify(b) } } catch {}
      const r = await fetch(u.replace(ORIGEN + '/mensajes', REL), { method: route.request().method(),
        headers:{'content-type':'application/json'}, body: cuerpo })
      return route.fulfill({ status:r.status, contentType:'application/json', body: await r.text() })
    }
    return route.fulfill({ status:200, contentType:'application/json', body:'{}' })
  })
  await pag.goto(SITIO, { waitUntil:'domcontentloaded' })
  await pag.waitForTimeout(2400)
  await pag.evaluate(([c,n]) => {
    const tk = btoa(JSON.stringify({ sub:c, exp:Math.floor(Date.now()/1000)+99999 }))
    VETA._sesion({ token:`x.${tk}.y`, correo:c, nombre:n, direccion:'0x'+'1'.repeat(40) })
    VETA._identidad({ estado:'verificada' })
    document.getElementById('app')?.classList.remove('oculto')
    for (const id of ['portada','techo','acceso','reclave']) document.getElementById(id)?.classList.add('oculto')
    VETA.vista('chat')
  }, [correo, nombre])
  await pag.waitForTimeout(2800)
  return { pag, err, correo }
}

console.log('\nTres personas en el mismo grupo\n')
const A = await abrir('ana@ordenglobal.link', 'Ana')
const B = await abrir('beto@ordenglobal.link', 'Beto')
const C = await abrir('caro@ordenglobal.link', 'Caro')
ok('el navegador puede hacer llamadas de grupo', await A.pag.evaluate(()=>GRUPO.puede()))

// Ana crea el grupo con los tres.
const gid = await A.pag.evaluate(async () => {
  const g = await CHAT.grupoCrear('Junta', ['beto@ordenglobal.link','caro@ordenglobal.link'])
  return g.id
})
ok('se creo el grupo', !!gid, gid)

for (const p of [A, B, C]) {
  await p.pag.evaluate((g) => VETA._chatCon({ id: g, nombre: 'Junta', esGrupo: true }), gid)
}
await A.pag.waitForTimeout(400)
ok('aparece el boton de llamar al grupo', await A.pag.isVisible('#cha-gllamar-video'))

console.log('\nAna llama al grupo\n')
await A.pag.click('#cha-gllamar-video')
await A.pag.waitForTimeout(2500)
ok('a Ana se le abre la llamada de grupo', await A.pag.isVisible('#gru'))
await B.pag.waitForTimeout(1500)
ok('a Beto le entra', await B.pag.evaluate(()=>GRUPO.cuento().estado) === 'entrando')
ok('a Caro tambien', await C.pag.evaluate(()=>GRUPO.cuento().estado) === 'entrando')

console.log('\nEntran los dos\n')
await B.pag.click('#gru-contestar'); await B.pag.waitForTimeout(3000)
await C.pag.click('#gru-contestar'); await C.pag.waitForTimeout(9000)

const gente = async (p) => p.evaluate(()=>GRUPO.cuento().gente.map(g=>({c:g.correo,ok:g.conectado,f:g.hayFlujo})))
const gA = await gente(A.pag), gB = await gente(B.pag), gC = await gente(C.pag)
ok('Ana ve a los otros dos', gA.length === 2, JSON.stringify(gA))
ok('Beto ve a los otros dos', gB.length === 2, JSON.stringify(gB))
ok('Caro ve a los otros dos', gC.length === 2, JSON.stringify(gC))

// LA PRUEBA DE VERDAD: Beto y Caro nunca se llamaron entre si.
const betoOyeCaro = gB.find(g => g.c === 'caro@ordenglobal.link')
const caroOyeBeto = gC.find(g => g.c === 'beto@ordenglobal.link')
ok('BETO recibe el video de CARO, sin haberse llamado', !!betoOyeCaro?.f, JSON.stringify(betoOyeCaro))
ok('y CARO el de BETO', !!caroOyeBeto?.f, JSON.stringify(caroOyeBeto))
ok('los tres cuadros estan en la rejilla de Ana',
   (await A.pag.$$('#gru-rejilla .gru-cuadro')).length === 3)
ok('el boton de compartir pantalla se ve en el grupo', await A.pag.isVisible('#gru-pant'))
await A.pag.screenshot({path:'/tmp/gru.png'})

console.log('\nUno se va y los otros siguen\n')
await C.pag.click('#gru-colgar'); await C.pag.waitForTimeout(2500)
ok('Caro sale', (await C.pag.evaluate(()=>GRUPO.cuento().estado)) === 'libre')
ok('Ana sigue en la llamada', (await A.pag.evaluate(()=>GRUPO.cuento().estado)) === 'hablando')
ok('y le queda solo Beto', (await gente(A.pag)).length === 1)
ok('Beto tambien sigue', (await B.pag.evaluate(()=>GRUPO.cuento().estado)) === 'hablando')

for (const p of [A,B,C]) ok(`sin errores de javascript (${p.correo.split('@')[0]})`, p.err.length===0)
if (A.err.length) console.log(A.err.slice(0,2))
await nav.close(); RELEVO.kill()
try { rmSync(CARPETA, { recursive:true, force:true }) } catch {}
console.log(f?`\n${f} en rojo\n`:'\nTodo en verde\n')
process.exit(f?1:0)
