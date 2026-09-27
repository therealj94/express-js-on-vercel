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
// Lo que contesta el relevo a /bandeja: una prueba lo cambia para meter un mensaje.
let bandejaFalsa = null
await pag.route('**/*', async (route) => {
  const req = route.request(), u = req.url()
  if (u.startsWith('http://127.0.0.1:8791')) return route.continue()
  const j = (o) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) })
  if (u === CEREBRO + '/subir') {
    const b = JSON.parse(req.postData()||'{}')
    subidas.push({ tipo:b.tipo, mime:b.mime, nombre:b.nombre, bytes:(b.datos||'').length })
    await pag.evaluate((d) => { window.__ultimaSubida = d }, b.datos || '')
    return j({ id: 'arch1' })
  }
  if (u === CEREBRO + '/enviar') { subidas.push({ enviado: JSON.parse(req.postData()||'{}') }); return j({ ok:true }) }
  if (u === CEREBRO + '/bandeja') return j(bandejaFalsa || { mensajes: [] })
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

// Con candado, la nota sube CERRADA: el relevo guarda bytes que no puede oír,
// y con la llave que viaja dentro del mensaje vuelve entera.
const cerrada = await pag.evaluate(async () => {
  const hayAntes = CANDADO.hay
  CANDADO.hay = () => true
  try {
    const crudos = new Uint8Array(4096).map((_, i) => (i * 37) & 255)
    const adj = await CHAT.subirVoz(new Blob([crudos], { type: 'audio/webm' }), 3)
    return { llave: !!adj.llave, iv: !!adj.iv, adj }
  } finally { CANDADO.hay = hayAntes }
})
const subCif = subidas.filter(s=>s.tipo==='voz').pop()
ok('con candado la nota vuelve con su llave', cerrada.llave && cerrada.iv)
const vuelta = await pag.evaluate(async ({ adj }) => {
  const r = window.__ultimaSubida
  if (!r) return null
  const cerr = Uint8Array.from(atob(r), c => c.charCodeAt(0))
  const crudos = new Uint8Array(4096).map((_, i) => (i * 37) & 255)
  const igual = cerr.length === crudos.length && cerr.every((b, i) => b === crudos[i])
  const abierta = await CANDADO.abrirBytes(cerr, adj.llave, adj.iv)
  return { igualQueElOriginal: igual, vuelveEntera: abierta.length === 4096 && abierta.every((b, i) => b === crudos[i]) }
}, cerrada)
ok('lo que sube no es el audio en claro', vuelta && !vuelta.igualQueElOriginal, JSON.stringify(vuelta))
ok('y con la llave vuelve entera', vuelta?.vuelveEntera, `${subCif?.bytes} bytes subidos`)

// Con candado, pero quien recibe no tiene NINGÚN aparato con llave (el relevo
// no devuelve llaves): la nota no se cierra, porque la llave no podría viajar y
// el archivo quedaría imposible de oír. Hallazgo de Codex en el PR #31.
const sinAparatos = await pag.evaluate(async () => {
  const hayAntes = CANDADO.hay
  CANDADO.hay = () => true
  try {
    const crudos = new Uint8Array(4096).map((_, i) => (i * 37) & 255)
    const adj = await CHAT.subirVoz(new Blob([crudos], { type: 'audio/webm' }), 3, 'ana@ordenglobal.link')
    const subido = Uint8Array.from(atob(window.__ultimaSubida), c => c.charCodeAt(0))
    return { llave: !!adj.llave, enClaro: subido.length === crudos.length && subido.every((b, i) => b === crudos[i]) }
  } finally { CANDADO.hay = hayAntes }
})
ok('sin aparatos del otro lado, la nota sube en claro y se puede oír', !sinAparatos.llave && sinAparatos.enClaro, JSON.stringify(sinAparatos))

// Y si el archivo YA subió cerrado (la consulta de aparatos falló y se asumió
// que sí había) pero al enviar resulta que no hay a quién darle la llave, no se
// manda un mensaje que apunte a bytes que nadie puede abrir: se corta con error.
// Segunda revisión de Codex en el PR #31.
const enviadosAntes = subidas.filter(s=>s.enviado).length
const corte = await pag.evaluate(async () => {
  const hayAntes = CANDADO.hay
  CANDADO.hay = () => true
  try {
    const adj = { id: 'arch9', tipo: 'voz', nombre: 'voz-3s', llave: 'AAAA', iv: 'BBBB' }
    try { await CHAT.enviarAdjunto('ana@ordenglobal.link', adj, ''); return { lanzo: false } }
    catch (e) { return { lanzo: true, motivo: e.motivo } }
  } finally { CANDADO.hay = hayAntes }
})
ok('un adjunto cerrado sin nadie a quien darle la llave no se manda', corte.lanzo && subidas.filter(s=>s.enviado).length === enviadosAntes, JSON.stringify(corte))

// Un mensaje con adjunto que este aparato NO pudo abrir (llegó cerrado para
// otro aparato): se dice con su aviso, pero no se pinta el adjunto con la
// dirección del relevo, que serían bytes cerrados como una imagen rota.
// Tercera revisión de Codex en el PR #31.
const sinAbrir = await pag.evaluate(async () => {
  window.__bandejaOrig = CHAT.bandeja
  CHAT.bandeja = async () => ({ mensajes: [{ id: 'mx1', de: 'ana@ordenglobal.link', para: 'jose@ordenglobal.link',
    cuando: Date.now(), tipo: 'imagen', archivo: 'arch7', nombre: 'foto.jpg', cerrado: true, e2e: true, texto: '' }],
    enLinea: false, leidoHasta: 0 })
  CHAT.listo = () => true
  VETA.vista('chat')
  await VETA.chatAbrir('ana@ordenglobal.link')
  await new Promise(r => setTimeout(r, 800))
  return { aviso: !!document.querySelector('.cha-cerrado'),
    roto: !!document.querySelector('img[src*="arch7"], a[href*="arch7"], video[src*="arch7"], audio[src*="arch7"]') }
})
ok('un adjunto que este aparato no pudo abrir se avisa y no se pinta roto', sinAbrir.aviso && !sinAbrir.roto, JSON.stringify(sinAbrir))

// Y SIN CANDADO (navegación privada con el cajón bloqueado): un mensaje con
// sobre no se puede ni intentar abrir. Tiene que avisarse igual y no pintar su
// adjunto con los bytes cerrados. Cuarta revisión de Codex en el PR #31.
bandejaFalsa = { mensajes: [{ id: 'mx2', de: 'ana@ordenglobal.link', para: 'jose@ordenglobal.link',
  cuando: Date.now(), tipo: 'imagen', archivo: 'arch8', nombre: 'foto.jpg', cif: { v: 1 } }] }
const sinCandado = await pag.evaluate(async () => {
  // Por el camino de verdad: el relevo contesta y `bandeja` pasa por abrirTodos.
  CHAT.bandeja = window.__bandejaOrig
  const hayAntes = CANDADO.hay
  CANDADO.hay = () => false
  try {
    await VETA.chatAbrir('ana@ordenglobal.link')
    await new Promise(r => setTimeout(r, 800))
    return { aviso: !!document.querySelector('.cha-cerrado'),
      roto: !!document.querySelector('img[src*="arch8"], a[href*="arch8"], video[src*="arch8"], audio[src*="arch8"]') }
  } finally { CANDADO.hay = hayAntes }
})
bandejaFalsa = null
ok('sin candado, un adjunto cerrado se avisa y no se pinta roto', sinCandado.aviso && !sinCandado.roto, JSON.stringify(sinCandado))

ok('sin errores de javascript', err.length===0)
if(err.length) console.log(err.slice(0,3))
await nav.close()
console.log(f?`\n${f} en rojo\n`:'\nTodo en verde\n')
process.exit(f?1:0)
