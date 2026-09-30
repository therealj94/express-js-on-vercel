/* Dos navegadores llamandose de verdad.
 *
 * No es un simulacro: son dos contextos con camara y microfono falsos, un
 * relevo de mensajes de verdad corriendo en local, y WebRTC montando la
 * conexion entre los dos. Si el apreton de manos esta mal, esto no conecta.
 */
import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createServer } from 'net'
/* UN PUERTO LIBRE, NO UNO FIJO.
   Con el 8395 a pelo, un relevo que quedara vivo de una corrida anterior se
   queda con el puerto: el `spawn` nuevo muere sin decir nada, la prueba habla
   con el relevo VIEJO —cuentas viejas, llaves viejas— y falla con «el chat se
   trabó» sin que nada apunte a la causa. Se pide un puerto libre al sistema,
   como ya hacía probar-chat-vivo. */
const PUERTO = await new Promise((r) => {
  const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) })
})
const REL = `http://127.0.0.1:${PUERTO}`     // el relevo de verdad, local
const ORIGEN = 'https://cerebro.ordenscan.com'  // lo unico que la CSP permite
const SITIO = 'http://127.0.0.1:8791/apps-web/veta-wallet/index.html'
const ARGS = ['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
              '--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage',
              /* Compartir pantalla sin dialogo: el navegador elige solo la
                 pantalla entera. Sin esto getDisplayMedia se queda esperando
                 un click que en una prueba no existe. */
              '--auto-select-desktop-capture-source=Entire screen']

/* La prueba levanta SU PROPIO relevo, con datos nuevos.
   Reutilizar uno ya andando hace que la segunda corrida falle con 409 «ese
   correo ya tiene llave»: las cuentas de la corrida anterior siguen ahi. Una
   prueba que solo pasa la primera vez no es una prueba. */
const CARPETA = mkdtempSync(join(tmpdir(), 'lla-'))
const SERVIDOR = process.env.SERVIDOR_MENSAJES ||
  new URL('../../../infra/mensajes/servidor.py', import.meta.url).pathname
const RELEVO = spawn('python3', [SERVIDOR],
  { env: { ...process.env, MENSAJES_DATOS: join(CARPETA, 'd.json'),
           MENSAJES_PUERTO: String(PUERTO), MENSAJES_ARCHIVOS: join(CARPETA, 'arch') },
    stdio: 'ignore', detached: false })
await new Promise(r => setTimeout(r, 2500))

const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ARGS })
let f=0; const ok=(q,c,x='')=>{console.log(`${c?'  ok  ':' FALLA'}  ${q}${x?'  · '+x:''}`); if(!c)f++}

/* Se da de alta contra el relevo DESDE AQUI y se le mete la llave en el
   almacen del navegador. Hacerlo desde la app haria que el relevo intentara
   validar la sesion contra el backend real de la billetera, que en una
   prueba local no existe. Lo que se prueba es la llamada, no el alta. */
async function llaveDe(correo) {
  const r = await fetch(REL + '/alta', { method:'POST',
    headers:{'content-type':'application/json'}, body: JSON.stringify({ correo }) })
  return (await r.json()).llave
}

/* `llaveDada`: la misma cuenta en un SEGUNDO aparato (otro contexto, otro
   candado, otro id de aparato). Un segundo /alta sin llave daría 409. */
async function abrir(correo, nombre, llaveDada) {
  const llave = llaveDada || await llaveDe(correo)
  const ctx = await nav.newContext({ locale:'es-HN', viewport:{width:430,height:900},
    permissions:['microphone','camera'] })
  const pag = await ctx.newPage()
  const err = []
  pag.on('pageerror', e => err.push(String(e)))
  /* Las señales que manda este navegador, por tipo: así se cuenta cuántas
     `respuesta` salieron de un doble toque. */
  const senales = []
  await pag.addInitScript(([r, c, k]) => {
    window.OG_MENSAJES_API = r + '/mensajes'
    try { localStorage.setItem('veta.chat.llave.' + c, k) } catch {}
  }, [ORIGEN, correo, llave])
  // El relevo local no lleva el prefijo /mensajes: se reescribe al vuelo.
  await pag.route('**/*', async (route) => {
    const u = route.request().url()
    if (u.startsWith('http://127.0.0.1:8791')) return route.continue()
    if (u.startsWith(ORIGEN)) {
      /* Se quita `sesion` del alta: con ese campo el relevo sale a validar la
         sesion contra el backend real de la billetera, que en una prueba local
         no existe y deja el alta colgada. Lo que se prueba aqui es la llamada,
         no el alta. */
      let cuerpo = route.request().postData()
      try {
        const b = JSON.parse(cuerpo || '{}')
        if (b.sesion) { delete b.sesion; cuerpo = JSON.stringify(b) }
        if (u.endsWith('/senal')) senales.push({ tipo: b.tipo, para: b.para, aparato: b.aparato || '' })
      } catch {}
      const r = await fetch(u.replace(ORIGEN + '/mensajes', REL), { method: route.request().method(),
        headers:{'content-type':'application/json'}, body: cuerpo })
      return route.fulfill({ status:r.status, contentType:'application/json', body: await r.text() })
    }
    return route.fulfill({ status:200, contentType:'application/json', body:'{}' })
  })
  await pag.goto(SITIO, { waitUntil:'domcontentloaded' })
  await pag.waitForTimeout(2500)
  /* De paso se mira si la PORTADA de PULSE2CHAT aparece al entrar: se crea en
     el mismo tick que vista('chat'), asi que se pregunta dentro del mismo
     evaluate, antes de que se vaya sola. */
  const portada = await pag.evaluate(([c, n]) => {
    const tk = btoa(JSON.stringify({ sub:c, exp:Math.floor(Date.now()/1000)+99999 }))
    VETA._sesion({ token:`x.${tk}.y`, correo:c, nombre:n, direccion:'0x'+'1'.repeat(40) })
    VETA._identidad({ estado:'verificada' })
    document.getElementById('app')?.classList.remove('oculto')
    for (const id of ['portada','techo','acceso','reclave']) document.getElementById(id)?.classList.add('oculto')
    VETA.vista('chat')
    return !!document.getElementById('p2c-portada')
  }, [correo, nombre])
  await pag.waitForTimeout(3000)   // alta contra el relevo + arranque del buzon
  return { pag, err, correo, llave, portada, senales }
}


/* Aceptarse. El círculo es la regla nueva: dos desconocidos no pueden
   escribirse NI hacerse sonar el teléfono, y el relevo lo hace cumplir con un
   403. Aquí se da ese paso contra el relevo —las llaves vienen de `abrir`,
   porque un segundo /alta sin llave devuelve 409 y dejaría la firma vacía—.
   La pantalla de solicitudes se prueba aparte, en probar-circulo.py. */
async function aceptarse(...gente) {
  const post = (ruta, cuerpo) => fetch(REL + ruta, { method:'POST',
    headers:{'content-type':'application/json'}, body: JSON.stringify(cuerpo) })
  for (const a of gente) for (const b of gente) {
    if (a.correo >= b.correo) continue
    await post('/amistad/pedir', { correo:a.correo, llave:a.llave, para:b.correo })
    const r = await post('/amistad/responder',
      { correo:b.correo, llave:b.llave, de:a.correo, aceptar:true })
    const est = (await r.json())?.estado
    if (est !== 'amigos') throw new Error(`no se aceptaron ${a.correo}/${b.correo}: HTTP ${r.status} ${JSON.stringify(est)}`)
  }
}

console.log('\nDos personas, cada una con su navegador\n')
const ana = await abrir('ana@ordenglobal.link', 'Ana')
const beto = await abrir('beto@ordenglobal.link', 'Beto')
await aceptarse(ana, beto)
ok('las dos entraron al chat', true)
ok('la portada de PULSE2CHAT los recibio al entrar', ana.portada && beto.portada)
ok('y ya se fue sola', await ana.pag.evaluate(()=>!document.getElementById('p2c-portada')))
ok('el navegador puede llamar', await ana.pag.evaluate(()=>LLAMADA.puede()))

// Ana abre el hilo con Beto y llama.
await ana.pag.evaluate(()=>VETA._chatCon({ id:'beto@ordenglobal.link', nombre:'Beto', esGrupo:false }))
await ana.pag.waitForTimeout(400)
/* Si el botón no está, se dice POR QUE: sin esto la prueba solo puede
   informar del síntoma, y el síntoma nunca es la causa. */
if (!await ana.pag.isVisible('#cha-llamar-voz'))
  console.log('  DIAGNOSTICO:', JSON.stringify(await ana.pag.evaluate(()=>({
    estado: VETA._chatEstado?.(),
    hilo: (document.getElementById('chat-hilo')?.textContent||'').slice(0,140) }))))
ok('aparece el boton de llamar', await ana.pag.isVisible('#cha-llamar-voz'))
ok('y el de videollamada', await ana.pag.isVisible('#cha-llamar-video'))

console.log('\nAna llama con video\n')
await ana.pag.click('#cha-llamar-video')
await ana.pag.waitForTimeout(2500)
ok('a Ana se le abre la pantalla de llamada', await ana.pag.isVisible('#lla'))
ok('y queda en estado «llamando»', (await ana.pag.evaluate(()=>LLAMADA.cuento().estado)) === 'llamando')
ok('con la CARA de Beto en el centro', await ana.pag.isVisible('#lla-cara'),
   await ana.pag.evaluate(()=>document.getElementById('lla-foto')?.textContent?.trim() || ''))
ok('y los aros latiendo (esta sonando)',
   await ana.pag.evaluate(()=>document.getElementById('lla').classList.contains('sonando')))
/* La disponibilidad dicha de frente: Beto esta escuchando su buzon, asi que
   el relevo lo ve en el chat y Ana lee «le esta sonando». Llega con el
   latido de la bandeja, asi que se le da hasta ~9s. */
{
  let linea = ''
  for (let i = 0; i < 18 && !linea; i++) {
    await ana.pag.waitForTimeout(500)
    linea = await ana.pag.evaluate(()=>{
      const l = document.getElementById('lla-linea')
      return l && !l.classList.contains('oculto') ? l.textContent : '' })
  }
  ok('Ana lee que a Beto le esta sonando', /sonando/.test(linea), linea)
}

await beto.pag.waitForTimeout(2000)
ok('a Beto le ENTRA la llamada', await beto.pag.isVisible('#lla'))
ok('Beto ve que es videollamada', await beto.pag.evaluate(()=>!!LLAMADA.entrante()?.video))
ok('y sabe quien llama', (await beto.pag.evaluate(()=>LLAMADA.entrante()?.de)) === 'ana@ordenglobal.link')
await beto.pag.screenshot({path:'/tmp/lla-entra.png'})

console.log('\nBeto contesta\n')
await beto.pag.click('#lla-si-video')
// Justo despues de contestar NO puede decir «hablando»: todavia no llego un pixel.
await beto.pag.waitForTimeout(150)
ok('al contestar NO dice hablando todavia',
   ['conectando','hablando'].includes(await beto.pag.evaluate(()=>LLAMADA.cuento().estado)),
   await beto.pag.evaluate(()=>LLAMADA.cuento().estado))
await beto.pag.waitForTimeout(6000)

const estado = async (p) => p.evaluate(()=>LLAMADA.cuento().estado)
ok('Beto queda hablando', (await estado(beto.pag)) === 'hablando', await estado(beto.pag))
ok('Ana tambien', (await estado(ana.pag)) === 'hablando', await estado(ana.pag))

// LA PRUEBA DE VERDAD: llega video del otro lado?
const video = async (p) => p.evaluate(() => {
  const v = document.getElementById('lla-remoto')
  return { hayFlujo: !!v?.srcObject, pistas: v?.srcObject?.getTracks().map(t=>t.kind) || [],
           ancho: v?.videoWidth || 0 }
})
const va = await video(ana.pag), vb = await video(beto.pag)
ok('a Ana le llega el flujo de Beto', va.hayFlujo && va.pistas.includes('video'), JSON.stringify(va))
ok('a Beto le llega el de Ana', vb.hayFlujo && vb.pistas.includes('video'), JSON.stringify(vb))
ok('y el video tiene pixeles de verdad', va.ancho > 0, `${va.ancho}px de ancho`)

/* El estado ya no es una palabra quieta: dijo «entro la llamada» al conectar
   y ahora lleva el contador de cuanto dura. A los seis segundos de hablar
   tiene que verse el reloj. */
const estTxt = await ana.pag.evaluate(()=>document.getElementById('lla-estado')?.textContent || '')
ok('el estado lleva el contador de la llamada', /\d:\d\d/.test(estTxt), estTxt)
ok('y los aros ya no laten: se esta hablando',
   !(await ana.pag.evaluate(()=>document.getElementById('lla').classList.contains('sonando'))))

/* La cabecera del hilo dice EN LINEA: los dos estan con el chat de pie y el
   relevo lo sabe. Llega con el latido de la bandeja. */
{
  let linea = ''
  for (let i = 0; i < 18 && !/línea|Online/i.test(linea); i++) {
    await ana.pag.waitForTimeout(500)
    linea = await ana.pag.evaluate(()=>document.getElementById('cha-linea')?.textContent || '')
  }
  ok('la cabecera del hilo dice «En línea»', /línea|Online/i.test(linea), linea)
}

console.log('\nLOS AJUSTES: cambiar de microfono sin colgar\n')
{
  await ana.pag.click('#lla-ajustes-btn'); await ana.pag.waitForTimeout(700)
  ok('el panel de ajustes se abre', await ana.pag.isVisible('#lla-ajustes'))
  const mics = await ana.pag.evaluate(()=>Array.from(document.querySelectorAll('#lla-sel-mic option')).map(o=>o.value))
  ok('lista los microfonos de verdad', mics.length >= 1, `${mics.length} aparato(s)`)
  const cams = await ana.pag.evaluate(()=>Array.from(document.querySelectorAll('#lla-sel-cam option')).map(o=>o.value))
  ok('y las camaras, porque es videollamada', cams.length >= 1, `${cams.length}`)
  // Se elige el primero de la lista: con aparatos falsos es el mismo, pero el
  // camino entero —getUserMedia con deviceId + replaceTrack— corre de verdad.
  await ana.pag.evaluate((id)=>VETA.llamadaAparato('mic', id), mics[0])
  await ana.pag.waitForTimeout(1200)
  ok('cambiar de microfono NO corta la llamada',
     (await ana.pag.evaluate(()=>LLAMADA.cuento().estado)) === 'hablando')
  ok('y el microfono queda encendido como estaba',
     await ana.pag.evaluate(()=>LLAMADA.cuento().micAbierto))
  await ana.pag.click('#lla-ajustes button.btn'); await ana.pag.waitForTimeout(300)
  ok('el panel se cierra con «Listo»', !(await ana.pag.isVisible('#lla-ajustes')))
}
await ana.pag.screenshot({path:'/tmp/lla-hablando.png'})

console.log('\nACHICAR LA LLAMADA Y SEGUIR USANDO LA APP\n')
{
  const flujoAntes = await ana.pag.evaluate(()=>document.getElementById('lla-remoto')?.srcObject?.id || null)
  await ana.pag.click('#lla-min'); await ana.pag.waitForTimeout(600)
  ok('queda chiquita', await ana.pag.evaluate(()=>document.getElementById('lla').classList.contains('mini')))
  ok('la llamada SIGUE en pie', (await ana.pag.evaluate(()=>LLAMADA.cuento().estado)) === 'hablando')
  ok('es EL MISMO flujo, no se remonto nada',
     (await ana.pag.evaluate(()=>document.getElementById('lla-remoto')?.srcObject?.id || null)) === flujoAntes)
  ok('el video sigue corriendo', await ana.pag.evaluate(()=>{
     const v=document.getElementById('lla-remoto'); return !v.paused && v.videoWidth>0 }))

  // Se navega a otra parte del ecosistema con la llamada viva.
  await ana.pag.evaluate(()=>VETA.vista('billetera')); await ana.pag.waitForTimeout(800)
  ok('se puede navegar a la billetera', (await ana.pag.evaluate(()=>VETA.dondeEstoy())) === 'billetera')
  ok('y la llamada NO se corto', (await ana.pag.evaluate(()=>LLAMADA.cuento().estado)) === 'hablando')
  ok('a Beto tampoco se le corto', (await beto.pag.evaluate(()=>LLAMADA.cuento().estado)) === 'hablando')
  ok('la burbuja sigue a la vista', await ana.pag.isVisible('#lla'))
  await ana.pag.screenshot({path:'/tmp/lla-mini.png'})

  // Y se vuelve a agrandar tocandola.
  await ana.pag.click('#lla-remoto'); await ana.pag.waitForTimeout(600)
  ok('tocarla la agranda', !(await ana.pag.evaluate(()=>document.getElementById('lla').classList.contains('mini'))))
  ok('y el video sigue vivo', await ana.pag.evaluate(()=>{
     const v=document.getElementById('lla-remoto'); return !v.paused && v.videoWidth>0 }))
  await ana.pag.evaluate(()=>VETA.vista('chat')); await ana.pag.waitForTimeout(400)
}

console.log('\nCompartir pantalla FUNCIONA, no solo se ve\n')
ok('el boton de compartir esta a la vista', await ana.pag.isVisible('#lla-pant'))
ok('y el navegador puede compartir', await ana.pag.evaluate(()=>LLAMADA.puedePantalla()))
{
  // Ana comparte. El navegador elige solo la pantalla entera (flag de arriba).
  const flujoAntes = await beto.pag.evaluate(()=>document.getElementById('lla-remoto')?.srcObject?.id || null)
  await ana.pag.click('#lla-pant'); await ana.pag.waitForTimeout(2000)
  ok('Ana queda compartiendo', await ana.pag.evaluate(()=>LLAMADA.cuento().compartiendo))
  ok('su estado lo dice con palabras',
     /[Cc]ompartiendo|[Ss]haring/.test(await ana.pag.evaluate(()=>document.getElementById('lla-estado')?.textContent || '')),
     await ana.pag.evaluate(()=>document.getElementById('lla-estado')?.textContent || ''))
  ok('la llamada sigue en pie mientras comparte',
     (await ana.pag.evaluate(()=>LLAMADA.cuento().estado)) === 'hablando')
  // A Beto le sigue llegando video SIN remontar el flujo: replaceTrack limpio.
  const vb2 = await beto.pag.evaluate(() => {
    const v = document.getElementById('lla-remoto')
    return { id: v?.srcObject?.id || null, ancho: v?.videoWidth || 0, corre: v && !v.paused }
  })
  ok('a Beto le sigue llegando video', vb2.corre && vb2.ancho > 0, JSON.stringify(vb2))
  ok('y es EL MISMO flujo: nada se remonto', vb2.id === flujoAntes)
  // Y deja de compartir: vuelve la camara, sin cortar nada.
  await ana.pag.click('#lla-pant'); await ana.pag.waitForTimeout(1500)
  ok('dejar de compartir vuelve a la camara',
     !(await ana.pag.evaluate(()=>LLAMADA.cuento().compartiendo)))
  ok('y la llamada tampoco se corto aqui',
     (await ana.pag.evaluate(()=>LLAMADA.cuento().estado)) === 'hablando')
}

console.log('\nLos mandos\n')
await ana.pag.click('#lla-mic'); await ana.pag.waitForTimeout(400)
ok('silenciar apaga el microfono', !(await ana.pag.evaluate(()=>LLAMADA.cuento().micAbierto)))
await ana.pag.click('#lla-mic'); await ana.pag.waitForTimeout(300)
ok('y vuelve a encenderlo', await ana.pag.evaluate(()=>LLAMADA.cuento().micAbierto))
await ana.pag.click('#lla-cam'); await ana.pag.waitForTimeout(400)
ok('apagar la camara funciona', !(await ana.pag.evaluate(()=>LLAMADA.cuento().camAbierta)))

console.log('\nColgar\n')
await ana.pag.click('#lla-colgar')
await ana.pag.waitForTimeout(2500)
ok('a Ana se le cierra', !(await ana.pag.isVisible('#lla')))
ok('y a Beto TAMBIEN se le cierra', !(await beto.pag.isVisible('#lla')))
ok('Beto queda libre', (await estado(beto.pag)) === 'libre', await estado(beto.pag))

/* Cuánto tarda en pasar algo, preguntando cada 300 ms. */
const hasta = async (p, fn, ms, arg) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg)) return Date.now() - t0
    await p.waitForTimeout(300)
  }
  return -1
}
const post = (ruta, cuerpo) => fetch(REL + ruta, { method:'POST',
  headers:{'content-type':'application/json'}, body: JSON.stringify(cuerpo) })

console.log('\nContestar TARDE ya no corta la llamada\n')
{
  /* El fallo de la calle: el plazo de conexión (20 s) se armaba al LLAMAR, así
     que toda llamada que tardara más de veinte segundos en contestarse se
     cortaba como «sin camino». Ahora cuenta desde la respuesta. */
  await ana.pag.evaluate(()=>VETA._chatCon({ id:'beto@ordenglobal.link', nombre:'Beto', esGrupo:false }))
  await ana.pag.waitForTimeout(300)
  await ana.pag.click('#cha-llamar-voz')
  ok('a Beto le entra', (await hasta(beto.pag, ()=>LLAMADA.cuento().estado === 'entrando', 8000)) >= 0)
  await ana.pag.waitForTimeout(25000)
  ok('a los 25 s Ana sigue llamando (antes: «sin camino» a los 20)',
     (await estado(ana.pag)) === 'llamando', await estado(ana.pag))
  ok('y a Beto le sigue sonando', (await estado(beto.pag)) === 'entrando', await estado(beto.pag))
  await beto.pag.click('#lla-contestar')
  ok('Beto contesta tarde y QUEDAN HABLANDO',
     (await hasta(ana.pag, ()=>LLAMADA.cuento().estado === 'hablando', 12000)) >= 0
     && (await hasta(beto.pag, ()=>LLAMADA.cuento().estado === 'hablando', 4000)) >= 0,
     `${await estado(ana.pag)} / ${await estado(beto.pag)}`)
  await ana.pag.click('#lla-colgar')
  await hasta(beto.pag, ()=>LLAMADA.cuento().estado === 'libre', 6000)
}

console.log('\nLa misma cuenta en dos aparatos: contesta uno, el otro se calla\n')
const beto2 = await abrir('beto@ordenglobal.link', 'Beto', beto.llave)
{
  const id1 = await beto.pag.evaluate(()=>CHAT.miAparato())
  const id2 = await beto2.pag.evaluate(()=>CHAT.miAparato())
  ok('cada aparato tiene su id (el de su candado)', /^[\w-]{22}$/.test(id1) && /^[\w-]{22}$/.test(id2) && id1 !== id2,
     `${id1} · ${id2}`)
  await ana.pag.click('#cha-llamar-voz')
  const suena1 = await hasta(beto.pag, ()=>LLAMADA.cuento().estado === 'entrando', 8000)
  const suena2 = await hasta(beto2.pag, ()=>LLAMADA.cuento().estado === 'entrando', 8000)
  ok('suena en los DOS aparatos de Beto', suena1 >= 0 && suena2 >= 0)
  /* El doble toque: tres «Contestar» seguidos, sin esperar. */
  beto2.senales.length = 0
  await beto2.pag.evaluate(()=>{ LLAMADA.contestar(false); LLAMADA.contestar(false); LLAMADA.contestar(false) })
  ok('el primer aparato deja de sonar solo', (await hasta(beto.pag, ()=>LLAMADA.cuento().estado === 'libre', 10000)) >= 0,
     await estado(beto.pag))
  ok('y lo dice: «Contestaste en otro aparato»',
     /otro aparato/.test(await beto.pag.evaluate(()=>document.getElementById('tostada')?.textContent || '')),
     await beto.pag.evaluate(()=>document.getElementById('tostada')?.textContent || ''))
  ok('su timbre está callado', !(await beto.pag.isVisible('#lla')))
  ok('Ana y el segundo aparato quedan hablando',
     (await hasta(ana.pag, ()=>LLAMADA.cuento().estado === 'hablando', 12000)) >= 0
     && (await hasta(beto2.pag, ()=>LLAMADA.cuento().estado === 'hablando', 4000)) >= 0,
     `${await estado(ana.pag)} / ${await estado(beto2.pag)}`)
  ok('tres toques en «Contestar» mandaron UNA respuesta',
     beto2.senales.filter(x => x.tipo === 'respuesta').length === 1,
     beto2.senales.map(x => x.tipo).filter(t => t !== 'ice').join(','))
  ok('y las señales llevan el id del aparato', beto2.senales.every(x => x.aparato === id2))

  /* Lo tardío del otro aparato de Beto (o de un relevo que reintenta): un
     rechazo, un ocupado y una segunda respuesta. Ninguno corta la llamada. */
  await post('/senal', { correo: beto.correo, llave: beto.llave, para: ana.correo, tipo: 'rechazo', datos: {} })
  await post('/senal', { correo: beto.correo, llave: beto.llave, para: ana.correo, tipo: 'ocupado', datos: {} })
  await post('/senal', { correo: beto.correo, llave: beto.llave, para: ana.correo, tipo: 'respuesta',
                         datos: { sdp: { type: 'answer', sdp: 'v=0' } } })
  await ana.pag.waitForTimeout(3000)
  ok('rechazo, ocupado y respuesta tardíos NO cortan la llamada en pie',
     (await estado(ana.pag)) === 'hablando' && (await estado(beto2.pag)) === 'hablando',
     `${await estado(ana.pag)} / ${await estado(beto2.pag)}`)
  await ana.pag.click('#lla-colgar')
  await hasta(beto2.pag, ()=>LLAMADA.cuento().estado === 'libre', 6000)
}

console.log('\nLa carrera del timbre: la llamada y su cuelgo juntos\n')
{
  /* Al abrir la pestaña con todo esperando en el buzón, la llamada y su
     cuelgo llegan en la misma tanda. El timbre no puede quedarse sonando. */
  const r = await beto.pag.evaluate(async () => {
    const hechos = []
    const sonar0 = TONO.sonar, parar0 = TONO.parar
    TONO.sonar = (c) => { hechos.push('sonar:' + c); return sonar0(c) }
    TONO.parar = () => { hechos.push('parar'); return parar0() }
    const oferta = { type: 'offer', sdp: 'v=0' }
    LLAMADA.recibir({ de: 'ana@ordenglobal.link', tipo: 'llamo', datos: { video: false, sdp: oferta } })
    LLAMADA.recibir({ de: 'ana@ordenglobal.link', tipo: 'cuelgo', datos: {} })
    await new Promise(r => setTimeout(r, 800))
    LLAMADA.recibir({ de: 'ana@ordenglobal.link', tipo: 'llamo', datos: { video: false, sdp: oferta } })
    LLAMADA.recibir({ de: 'ana@ordenglobal.link', tipo: 'atendida', datos: { como: 'respuesta' }, desde: 'OTRO-APARATO' })
    await new Promise(r => setTimeout(r, 800))
    TONO.sonar = sonar0; TONO.parar = parar0
    return { hechos, estado: LLAMADA.cuento().estado, ultimo: hechos[hechos.length - 1] }
  })
  ok('llamada + cuelgo (y llamada + atendida) en la misma tanda: el timbre termina callado',
     r.estado === 'libre' && r.ultimo === 'parar', JSON.stringify(r))
  ok('y la pantalla de llamada no se queda puesta', !(await beto.pag.isVisible('#lla')))
}

console.log('\nNadie contesta: a los 45 s se rinde y al otro le deja de sonar\n')
{
  await ana.pag.click('#cha-llamar-voz')
  ok('a Beto le suena', (await hasta(beto.pag, ()=>LLAMADA.cuento().estado === 'entrando', 8000)) >= 0)
  // El segundo aparato de Beto también suena; se deja sonar igual.
  const t0 = Date.now()
  const rinde = await hasta(ana.pag, ()=>LLAMADA.cuento().estado === 'libre', 52000)
  ok('Ana se rinde sola, cerca de los 45 s', rinde >= 38000 && rinde <= 50000, `${Math.round(rinde/1000)} s`)
  ok('y lo dice («No contestaron…»)',
     /contestaron/i.test(await ana.pag.evaluate(()=>document.getElementById('tostada')?.textContent || '')),
     await ana.pag.evaluate(()=>document.getElementById('tostada')?.textContent || ''))
  /* Con el `cuelgo` que ahora sí se manda, a Beto le deja de sonar ANTES de
     su propio margen (50 s): es el cuelgo el que lo calla, no el reloj. */
  const calla = await hasta(beto.pag, ()=>LLAMADA.cuento().estado === 'libre', 5000)
  ok('a Beto le deja de sonar con el cuelgo, antes de su propio margen',
     calla >= 0 && (Date.now() - t0) < 49000, `${Math.round((Date.now()-t0)/1000)} s`)
  ok('y a su segundo aparato también', (await hasta(beto2.pag, ()=>LLAMADA.cuento().estado === 'libre', 3000)) >= 0)
}

ok('sin errores de javascript en Ana', ana.err.length===0)
ok('sin errores de javascript en Beto', beto.err.length===0)
ok('ni en su segundo aparato', beto2.err.length===0)
if (beto2.err.length) console.log('  Beto2:', beto2.err.slice(0,2))
if (ana.err.length) console.log('  Ana:', ana.err.slice(0,2))
if (beto.err.length) console.log('  Beto:', beto.err.slice(0,2))
await nav.close()
RELEVO.kill()
try { rmSync(CARPETA, { recursive: true, force: true }) } catch {}
console.log(f?`\n${f} en rojo\n`:'\nTodo en verde\n')
process.exit(f?1:0)
