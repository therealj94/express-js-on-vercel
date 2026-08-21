/* Responder citando, reacciones y «esta escribiendo», con DOS navegadores.
 *
 * Con uno solo no se puede probar nada de esto: el aviso de que alguien
 * teclea solo existe si hay alguien del otro lado, y una reaccion tiene que
 * llegarle al que escribio el mensaje.
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
const CARPETA = mkdtempSync(join(tmpdir(), 'chv-'))
const RELEVO = spawn('python3', [SERVIDOR], { env: { ...process.env,
  MENSAJES_DATOS: join(CARPETA,'d.json'), MENSAJES_PUERTO: String(PUERTO),
  MENSAJES_ARCHIVOS: join(CARPETA,'arch') }, stdio:'ignore' })
for (let i=0;i<60;i++){ await new Promise(r=>setTimeout(r,250)); try{ if((await fetch(REL+'/salud')).ok) break }catch{} }

let f = 0
const ok = (q,c,x='') => { console.log(`${c?'  ok  ':' FALLA'}  ${q}${x?'  · '+x:''}`); if(!c) f++ }
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-sandbox','--disable-dev-shm-usage'] })

const llaveDe = async (c) => (await (await fetch(REL+'/alta',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({correo:c})})).json()).llave

async function abrir(correo, nombre) {
  const llave = await llaveDe(correo)
  const pag = await (await nav.newContext({ locale:'es-HN', viewport:{width:430,height:900}, deviceScaleFactor:2 })).newPage()
  const err = []; pag.on('pageerror', e=>err.push(String(e)))
  await pag.addInitScript(([u,c,k])=>{ window.OG_MENSAJES_API=u+'/mensajes'
    try{localStorage.setItem('veta.chat.llave.'+c,k)}catch{} }, [ORIGEN, correo, llave])
  await pag.route('**/*', async (route) => {
    const u = route.request().url()
    if (u.startsWith('http://127.0.0.1:8791')) return route.continue()
    if (u.startsWith(ORIGEN)) {
      let b = route.request().postData()
      try{ const j=JSON.parse(b||'{}'); if(j.sesion){delete j.sesion; b=JSON.stringify(j)} }catch{}
      const r = await fetch(u.replace(ORIGEN+'/mensajes', REL), { method: route.request().method(),
        headers:{'content-type':'application/json'}, body:b })
      return route.fulfill({ status:r.status, contentType:'application/json', body: await r.text() })
    }
    return route.fulfill({ status:200, contentType:'application/json', body:'{}' })
  })
  await pag.goto(SITIO, { waitUntil:'domcontentloaded' }); await pag.waitForTimeout(2400)
  await pag.evaluate(([c,n])=>{
    const tk = btoa(JSON.stringify({ sub:c, exp:Math.floor(Date.now()/1000)+99999 }))
    VETA._sesion({ token:`x.${tk}.y`, correo:c, nombre:n, direccion:'0x'+'1'.repeat(40) })
    VETA._identidad({ estado:'verificada' })
    document.getElementById('app')?.classList.remove('oculto')
    for (const id of ['portada','techo','acceso','reclave']) document.getElementById(id)?.classList.add('oculto')
    VETA.vista('chat')
  }, [correo, nombre])
  await pag.waitForTimeout(2600)
  return { pag, err, correo }
}

console.log('\nLa marca\n')
const A = await abrir('ana@ordenglobal.link','Ana')
const B = await abrir('beto@ordenglobal.link','Beto')
ok('dice PULSE2CHAT', /PULSE.?2.?CHAT/i.test(await A.pag.evaluate(()=>document.getElementById('lienzo')?.innerText||'')))
ok('el logo de la marca esta puesto', await A.pag.isVisible('.p2c-marca'))
ok('y no queda ningun «PULSE CHAT» viejo',
   !/PULSE CHAT/.test(await A.pag.evaluate(()=>document.body.innerText)))

await A.pag.evaluate(()=>VETA._chatCon({id:'beto@ordenglobal.link',nombre:'Beto',esGrupo:false}))
await B.pag.evaluate(()=>VETA._chatCon({id:'ana@ordenglobal.link',nombre:'Ana',esGrupo:false}))
await A.pag.waitForTimeout(500)

console.log('\nAna manda un mensaje\n')
await A.pag.fill('#chat-txt','hola beto')
await A.pag.press('#chat-txt','Enter')
await A.pag.waitForTimeout(2500)
await B.pag.evaluate(()=>VETA.vista('chat'))
await B.pag.waitForTimeout(6500)
ok('a Beto le llega', /hola beto/.test(await B.pag.evaluate(()=>document.getElementById('chat-msgs')?.innerText||'')))
ok('el mensaje tiene id', await B.pag.evaluate(()=>!!document.querySelector('.cha-b[data-id]')?.dataset.id))

console.log('\nBeto reacciona\n')
const id = await B.pag.evaluate(()=>document.querySelector('.cha-b[data-id]')?.dataset.id)
await B.pag.evaluate((i)=>VETA.chatReaccion(i,'🔥'), id)
await B.pag.waitForTimeout(2500)
ok('Beto ve su reaccion', await B.pag.isVisible('.cha-reac'))
ok('y queda marcada como suya', await B.pag.isVisible('.cha-reac.mia'))
await A.pag.waitForTimeout(6500)
ok('A ANA le llega la reaccion', await A.pag.isVisible('.cha-reac'), 
   await A.pag.evaluate(()=>document.querySelector('.cha-reac')?.textContent||'(nada)'))

console.log('\nBeto responde citando\n')
await B.pag.evaluate((i)=>VETA.chatCitar(i), id)
await B.pag.waitForTimeout(400)
ok('se ve la cita sobre el campo', await B.pag.isVisible('.cha-citando'))
await B.pag.fill('#chat-txt','te respondo a eso')
await B.pag.press('#chat-txt','Enter')
await B.pag.waitForTimeout(2500)
ok('la cita se limpia al mandar', !(await B.pag.isVisible('.cha-citando')))
await A.pag.waitForTimeout(6500)
ok('Ana ve la respuesta CON la cita adentro', await A.pag.isVisible('.cha-cita'))
ok('y la cita dice a quien responde',
   /ana/i.test(await A.pag.evaluate(()=>document.querySelector('.cha-cita b')?.textContent||'')))

console.log('\n«Esta escribiendo…»\n')
await A.pag.evaluate(()=>{ const c=document.getElementById('chat-txt'); c.value='escribiendo algo'
  c.dispatchEvent(new Event('input',{bubbles:true})) })
await B.pag.waitForTimeout(2500)
ok('Beto ve que Ana escribe', await B.pag.isVisible('#cha-escribe'),
   await B.pag.evaluate(()=>document.getElementById('cha-escribe')?.textContent||'(vacio)'))
await B.pag.waitForTimeout(4500)
ok('y se apaga solo cuando Ana para', !(await B.pag.isVisible('#cha-escribe')))

await A.pag.screenshot({path:'/tmp/p2c.png'})
for (const p of [A,B]) ok(`sin errores de javascript (${p.correo.split('@')[0]})`, p.err.length===0)
if (A.err.length) console.log(A.err.slice(0,2))
await nav.close(); RELEVO.kill()
try { rmSync(CARPETA,{recursive:true,force:true}) } catch {}
console.log(f?`\n${f} en rojo\n`:'\nTodo en verde\n')
process.exit(f?1:0)
