/* Las notas de voz, en un navegador de verdad con un microfono falso.
 * Chromium trae --use-fake-device-for-media-stream: da una senal de audio
 * sintetica, asi que MediaRecorder graba de verdad y se puede comprobar que
 * lo que sale es un blob con contenido. */
import { chromium } from 'playwright'
const CEREBRO = 'https://cerebro.ordenscan.com/mensajes'
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required'] })
const ctx = await nav.newContext({ locale:'es-HN', viewport:{width:430,height:900}, deviceScaleFactor:2,
  permissions:['microphone'] })
const pag = await ctx.newPage()
const err=[]; pag.on('pageerror', e=>err.push(String(e)))
const subidas = []
await pag.route('**/*', async (route) => {
  const req = route.request(), u = req.url()
  if (u.startsWith('http://127.0.0.1:8791')) return route.continue()
  const j = (o) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) })
  if (u === CEREBRO + '/subir') {
    const b = JSON.parse(req.postData()||'{}')
    subidas.push({ tipo:b.tipo, mime:b.mime, nombre:b.nombre, bytes:(b.datos||'').length })
    return j({ id: 'arch1' })
  }
  if (u === CEREBRO + '/enviar') { subidas.push({ enviado: JSON.parse(req.postData()||'{}') }); return j({ ok:true }) }
  if (u === CEREBRO + '/bandeja') return j({ mensajes: [] })
  if (u === CEREBRO + '/conversaciones') return j({ conversaciones: [] })
  return j({})
})
await pag.goto('http://127.0.0.1:8791/apps-web/veta-wallet/index.html',{waitUntil:'domcontentloaded'})
await pag.waitForTimeout(2600)

let f=0; const ok=(q,c,x='')=>{console.log(`${c?'  ok  ':' FALLA'}  ${q}${x?'  · '+x:''}`); if(!c)f++}

ok('el navegador sabe grabar', await pag.evaluate(()=>CHAT.puedeGrabar()))

// Se entra y se abre una conversacion fingida.
await pag.evaluate(() => {
  const c = btoa(JSON.stringify({ sub:'u1', exp:Math.floor(Date.now()/1000)+99999 }))
  VETA._sesion({ token:`x.${c}.y`, correo:'jose@ordenglobal.link', nombre:'José', direccion:'0x'+'1'.repeat(40) })
  VETA._identidad({ estado:'verificada' })
  document.getElementById('app')?.classList.remove('oculto')
  for (const id of ['portada','techo','acceso','reclave']) document.getElementById(id)?.classList.add('oculto')
  VETA._chatCon({ id:'ana@ordenglobal.link', nombre:'Ana', esGrupo:false })
  VETA.vista('chat')
})
await pag.waitForTimeout(700)
ok('el microfono esta en la barra', await pag.isVisible('.cha-mic'))

await pag.click('.cha-mic'); await pag.waitForTimeout(1600)
ok('aparece la barra de grabacion', await pag.isVisible('.cha-grab'))
ok('el contador corre', /0:0[12]/.test(await pag.textContent('#cha-grab-t')||''), await pag.textContent('#cha-grab-t'))
ok('el microfono se pone en rojo', await pag.evaluate(()=>document.querySelector('.cha-mic').classList.contains('grabando')))
await pag.screenshot({path:'/tmp/voz-1.png'})

await pag.click('.cha-mic'); await pag.waitForTimeout(2500)
const sub = subidas.find(s=>s.tipo==='voz')
ok('se sube como tipo «voz»', !!sub, JSON.stringify(sub||{}))
ok('la nota trae audio de verdad', (sub?.bytes||0) > 2000, `${sub?.bytes} bytes en base64`)
ok('el nombre lleva los segundos', /^voz-\d+s$/.test(sub?.nombre||''), sub?.nombre)
const env = subidas.find(s=>s.enviado)?.enviado
ok('se manda al hilo con su archivo', env?.tipo==='voz' && env?.archivo==='arch1', JSON.stringify(env||{}))
ok('la barra de grabacion se fue', !(await pag.isVisible('.cha-grab')))

// Cancelar no manda nada
const antes = subidas.length
await pag.click('.cha-mic'); await pag.waitForTimeout(1200)
await pag.click('.cha-grab-x'); await pag.waitForTimeout(900)
ok('cancelar NO sube nada', subidas.length === antes, `${subidas.length} vs ${antes}`)
ok('y suelta el microfono', await pag.evaluate(()=>!document.querySelector('.cha-mic')?.classList.contains('grabando')))

ok('sin errores de javascript', err.length===0)
if(err.length) console.log(err.slice(0,3))
await nav.close()
console.log(f?`\n${f} en rojo\n`:'\nTodo en verde\n')
process.exit(f?1:0)
