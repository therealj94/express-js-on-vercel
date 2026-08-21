/* El boton que confirma. Lo que se comprueba no es que se vea bonito: es que
   NO cante victoria antes de que el servidor conteste. */
import { chromium } from 'playwright'
const API = 'https://vetawallet-1a2e38ac52b1.herokuapp.com'
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] })
const ctx = await nav.newContext({ locale:'es-HN', viewport:{width:430,height:1000}, deviceScaleFactor:2 })
const pag = await ctx.newPage()
const err=[]; pag.on('pageerror', e=>err.push(String(e)))

let soltar = null   // el servidor no contesta hasta que yo quiera
await pag.route('**/*', async (route) => {
  const u = route.request().url()
  if (u.startsWith('http://127.0.0.1:8791')) return route.continue()
  if (u === API + '/auth/login') {
    await new Promise(r => { soltar = r })
    const carga = Buffer.from(JSON.stringify({ userId:'u1', address:'0x'+'1'.repeat(40),
      role:'user', verify:true, exp: Math.floor(Date.now()/1000)+9999 })).toString('base64url')
    return route.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ token:`x.${carga}.y`, refreshToken:'r',
                             user:{ email:'jose@ordenglobal.link', name:'José', address:'0x'+'1'.repeat(40) } }) })
  }
  return route.fulfill({ status:200, contentType:'application/json', body:'{}' })
})
await pag.goto('http://127.0.0.1:8791/apps-web/veta-wallet/index.html',{waitUntil:'domcontentloaded'})
await pag.waitForTimeout(2600)

let f=0; const ok=(q,c,x='')=>{console.log(`${c?'  ok  ':' FALLA'}  ${q}${x?'  · '+x:''}`); if(!c)f++}
const estado = () => pag.evaluate(() => {
  const b = document.getElementById('btn-acceso')
  return { trabaja: b.classList.contains('bc-trabaja'), hecho: b.classList.contains('bc-hecho'),
           apagado: b.disabled, texto: b.querySelector('.bc-txt')?.textContent }
})

await pag.evaluate(()=>{ VETA.ir('acceso'); VETA.pestana('entrar') })
await pag.waitForTimeout(400)
let e = await estado()
ok('en reposo no hay barra ni palomeo', !e.trabaja && !e.hecho && !e.apagado, e.texto)

await pag.fill('#i-correo','jose@ordenglobal.link'); await pag.fill('#i-clave','unaClaveLarga1')
pag.click('#btn-acceso').catch(()=>{})
await pag.waitForTimeout(700)
e = await estado()
ok('mientras espera: barra en marcha', e.trabaja, e.texto)
ok('mientras espera: NO hay palomeo', !e.hecho)
ok('mientras espera: el boton esta apagado', e.apagado)
await pag.screenshot({path:'/tmp/bc-1.png'})

// Se espera de sobra: si el palomeo dependiera de un reloj, ya habria salido.
await pag.waitForTimeout(2500)
e = await estado()
ok('DOS SEGUNDOS DESPUES y el servidor callado: sigue sin palomeo', !e.hecho && e.trabaja)

await pag.evaluate(()=>{})   // ahora si contesta el servidor
soltar && soltar()
await pag.waitForTimeout(420)
e = await estado()
ok('cuando el servidor dice que si: aparece el palomeo', e.hecho, JSON.stringify(e))
await pag.screenshot({path:'/tmp/bc-2.png'})
/* Se comprueba que el trazo tiene la animacion ENGANCHADA y que el palomeo
   esta visible, en vez de medir el dashoffset en un instante: el momento
   exacto depende de lo que tarde la red y un reloj fijo da falsos rojos. */
const dib = await pag.evaluate(() => {
  const p = document.querySelector('#btn-acceso .bc-check path')
  const svg = document.querySelector('#btn-acceso .bc-check')
  return { anim: getComputedStyle(p).animationName,
           dash: getComputedStyle(p).strokeDasharray,
           visible: getComputedStyle(svg).opacity }
})
ok('el trazo lleva la animacion enganchada', dib.anim === 'bcTrazo', dib.anim)
ok('la mascara cubre el largo del trazo', dib.dash === '42px', dib.dash)
ok('el palomeo esta a la vista', dib.visible === '1', `opacidad ${dib.visible}`)

await pag.waitForTimeout(900)
ok('despues entra a la app', await pag.evaluate(()=>!document.getElementById('app')?.classList.contains('oculto')))
ok('sin errores de javascript', err.length===0)
if(err.length) console.log(err.slice(0,2))
await nav.close()
console.log(f?`\n${f} en rojo\n`:'\nTodo en verde\n')
process.exit(f?1:0)
