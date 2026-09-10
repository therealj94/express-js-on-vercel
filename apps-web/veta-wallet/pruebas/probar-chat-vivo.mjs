/* Responder citando, reacciones y «esta escribiendo», con DOS navegadores.
 *
 * Con uno solo no se puede probar nada de esto: el aviso de que alguien
 * teclea solo existe si hay alguien del otro lado, y una reaccion tiene que
 * llegarle al que escribio el mensaje.
 */
import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
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

/* Ana entra con DEDO y Beto con puntero. No es un detalle: los botones de
   cada burbuja se comportan distinto en los dos, y el fallo que se arreglo
   —cinco fantasmas flotando encima de cada mensaje— solo existia con dedo.
   Probar las dos cosas cuesta un parametro. */
async function abrir(correo, nombre, conDedo = false) {
  const llave = await llaveDe(correo)
  const pag = await (await nav.newContext({ locale:'es-HN', viewport:{width:430,height:900},
    deviceScaleFactor:2, ...(conDedo ? { hasTouch:true, isMobile:true } : {}) })).newPage()
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
  return { pag, err, correo, llave }
}

/* Aceptarse. Desde que existe el círculo, dos desconocidos no pueden
   escribirse: el relevo contesta 403 y ese es el punto de la función. Se hace
   contra el relevo directamente porque lo que esta prueba mide es el chat en
   vivo, no la pantalla de solicitudes —esa la mide probar-circulo.py—. */
async function aceptarse(a, b) {
  /* Las llaves se reciben de `abrir`, NO se vuelven a pedir: un segundo /alta
     del mismo correo sin llave devuelve 409 y `.llave` sale undefined, con lo
     que la solicitud se manda sin firmar y el relevo contesta 401. */
  const post = (ruta, cuerpo) => fetch(REL + ruta, { method:'POST',
    headers:{'content-type':'application/json'}, body: JSON.stringify(cuerpo) })
  const r1 = await post('/amistad/pedir', { correo:a.correo, llave:a.llave, para:b.correo })
  const r2 = await post('/amistad/responder', { correo:b.correo, llave:b.llave, de:a.correo, aceptar:true })
  const est = (await r2.json())?.estado
  if (est !== 'amigos') throw new Error('no se pudieron aceptar: ' + r1.status + '/' + r2.status + ' ' + est)
}

console.log('\nLa marca\n')
const A = await abrir('ana@ordenglobal.link','Ana', true)   /* con dedo, como un iPad */
const B = await abrir('beto@ordenglobal.link','Beto')
await aceptarse(A, B)
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
/* Si no llega, se dice QUE se vio en cada lado: «no llega» a secas obliga a
   repetir la corrida a mano para averiguar de que lado se rompio. */
if (!/hola beto/.test(await B.pag.evaluate(()=>document.getElementById('chat-msgs')?.innerText||'')))
  console.log('  DIAGNOSTICO · errores de Ana:', JSON.stringify(A.err),
              '\n  errores de Beto:', JSON.stringify(B.err),
              '\n  hilo de Beto:', JSON.stringify((await B.pag.evaluate(()=>document.getElementById('chat-msgs')?.innerText||'')).slice(0,160)),
              '\n  hilo de Ana:', JSON.stringify((await A.pag.evaluate(()=>document.getElementById('chat-msgs')?.innerText||'')).slice(0,160)))
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

/* LA PRUEBA DEL CANDADO, MIRADA DESDE EL DISCO.
   Las dos pantallas dicen «hola beto», y aun asi hay que abrir el archivo del
   relevo y comprobar que ahi NO esta. Es la unica forma de saber que el
   cifrado esta puesto de verdad y no solo que el chat funciona: si un dia
   alguien rompiera el candado sin querer, todo lo de arriba seguiria en
   verde. */
console.log('\nEl candado, visto desde el servidor\n')
const enDisco = readFileSync(join(CARPETA,'d.json'),'utf8')
ok('el relevo NO guarda el texto del mensaje', !enDisco.includes('hola beto'))
ok('ni el de la respuesta', !enDisco.includes('te respondo a eso'))
ok('lo que guarda es un bulto cerrado', /"cif":\s*\{/.test(enDisco))

console.log('\nMi perfil y el timbre\n')
// El boton vive en la BARRA de la casa: con un hilo abierto, en pantalla
// angosta la casa se esconde. Se vuelve atras primero, que es lo que hace la
// persona.
await A.pag.evaluate(()=>{ VETA._chatCon(null); VETA.vista('chat') })
await A.pag.waitForTimeout(700)
/* Hay DOS botones con la clase .p2c-yo: la campana de avisos la comparte
   para heredar el tamaño. La persona toca SU CARA, que es el que no es la
   campana — y la prueba toca exactamente ese. */
ok('mi cara es el boton de perfil', await A.pag.isVisible('.p2c-yo:not(.p2c-campana)'))
await A.pag.click('.p2c-yo:not(.p2c-campana)'); await A.pag.waitForTimeout(900)
const perfil = await A.pag.evaluate(()=>document.getElementById('lienzo')?.innerText||'')
ok('se abre «Mi perfil»', /Mi perfil/i.test(perfil))
ok('se puede poner nombre', /Nombre/i.test(perfil))
ok('y foto', /foto/i.test(perfil), perfil.slice(0,80).replace(/\n+/g,' | '))
await A.pag.screenshot({path:'/tmp/p2c-perfil.png'})

ok('el modulo de timbre existe', await A.pag.evaluate(()=>typeof TONO?.sonar === 'function'))
const t1 = await A.pag.evaluate(async () => {
  TONO.sonar('entrando'); const a = TONO.sonando()
  TONO.parar(); return { sono: a, tras: TONO.sonando() }
})
ok('suena y se calla', t1.sono === 'entrando' && t1.tras === null, JSON.stringify(t1))

/* ══════════════════════════════════════════════════════════════════════════
   LO QUE SE LEE MIENTRAS SE CONVERSA
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\nLo que se lee mientras se conversa\n')

/* De vuelta al hilo: la seccion del perfil dejo a Ana en otra pantalla. */
await A.pag.evaluate((c)=>VETA.chatAbrir(c), B.correo)
await A.pag.waitForTimeout(1200)
const hilo = await A.pag.evaluate(()=>document.getElementById('chat-msgs')?.innerText||'')

/* ── EL AVISO DE FIRMA, UNA VEZ ─────────────────────────────────────────────
   Estaba DEBAJO DE CADA BURBUJA. En una conversacion de verdad eso son diez
   renglones diciendo «no se pudo comprobar quien lo escribio», y lo unico que
   queda al enseñarla es que la app esta rota. Se dice una vez, arriba. */
const cuantas = (hilo.match(/No se pudo comprobar/gi)||[]).length
ok('el aviso de firma no se repite en cada mensaje', cuantas === 0,
   `${cuantas} veces bajo las burbujas`)
const arriba = await A.pag.evaluate(()=>
  document.querySelectorAll('#chat-msgs .cha-nota-hilo').length)
ok('y cuando hace falta se dice UNA vez arriba del hilo', arriba <= 1, `${arriba}`)

/* ── FUERA EL PARRAFO DE LOS ADJUNTOS ───────────────────────────────────────
   Un parrafo de letra chica sobre lo que NO esta cifrado, debajo de la caja de
   escribir y en cada pantalla, le quitaba el sitio al sello que dice lo que SI
   esta cifrado — y es lo primero que se aprende a saltar. */
const pie = await A.pag.evaluate(()=>document.querySelector('.cha-hilo')?.innerText
  || document.getElementById('lienzo')?.innerText || '')
ok('no queda el parrafo de «las fotos y los videos todavia no»',
   !/fotos, los videos|se guardan como est/i.test(pie))
ok('pero el sello de cifrado sigue puesto', /cifrados de punta a punta/i.test(pie))

/* ── LOS BOTONES DE LA BURBUJA ──────────────────────────────────────────────
   En pantalla tactil estaban SIEMPRE puestos, al medio de opacidad, encima del
   texto: cinco fantasmas por mensaje. Ahora se piden tocando la burbuja. */
/* Ojo con el reloj: los botones entran con una transicion de siglo y medio de
   milisegundo, asi que leer la opacidad en el MISMO instante del toque da cero
   —el valor de partida— y parece que no pasa nada. Se mira antes, se toca, se
   espera a que la transicion termine, y recien entonces se mira otra vez. */
const antesDeTocar = await A.pag.evaluate(()=>{
  const b = document.querySelector('#chat-msgs .cha-b')
  if (!b) return null
  const g = b.querySelector('.cha-gestos')
  if (!g) return { hay:false }
  return { hay:true, antes:+getComputedStyle(g).opacity,
    tactil: !matchMedia('(hover:hover)').matches }
})
await A.pag.evaluate(()=>document.querySelector('#chat-msgs .cha-b')?.click())
await A.pag.waitForTimeout(450)
const gestos = { ...(antesDeTocar||{}), ...(await A.pag.evaluate(()=>{
  const b = document.querySelector('#chat-msgs .cha-b')
  const g = b?.querySelector('.cha-gestos')
  return { tras: g ? +getComputedStyle(g).opacity : -1, clase: b?.className || '' }
})) }
ok('cada mensaje tiene sus botones', gestos && gestos.hay !== false)
if (gestos?.tactil) {
  ok('con el dedo NO se ven hasta que se toca la burbuja', gestos.antes < 0.05,
     `opacidad en reposo ${gestos.antes}`)
  ok('y al tocarla aparecen', gestos.tras > 0.9,
     `opacidad ${gestos.antes} → ${gestos.tras}`)
} else {
  ok('con puntero se esconden hasta pasar por encima', gestos.antes < 0.05,
     `opacidad en reposo ${gestos.antes}`)
}

/* ── EL NOMBRE ──────────────────────────────────────────────────────────────
   La cabecera enseñaba el identificador —`morenoedwardortiz`— porque el relevo
   no siempre trae el nombre. Ahora, antes de rendirse, se mira la libreta. */
const cab = await A.pag.evaluate(()=>
  document.querySelector('.cha-quien b')?.textContent?.trim() || '')
ok('la cabecera enseña a quien se le escribe', !!cab, cab)
ok('y no es un «undefined» ni un vacio',
   !!cab && !/^(null|undefined)$/i.test(cab), cab)

await A.pag.screenshot({path:'/tmp/p2c-hilo.png'})

await A.pag.screenshot({path:'/tmp/p2c.png'})
for (const p of [A,B]) ok(`sin errores de javascript (${p.correo.split('@')[0]})`, p.err.length===0)
if (A.err.length) console.log(A.err.slice(0,2))
await nav.close(); RELEVO.kill()
try { rmSync(CARPETA,{recursive:true,force:true}) } catch {}
console.log(f?`\n${f} en rojo\n`:'\nTodo en verde\n')
process.exit(f?1:0)
