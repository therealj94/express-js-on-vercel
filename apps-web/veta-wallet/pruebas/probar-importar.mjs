/* El flujo entero de traer una billetera, con los archivos DE PRODUCCION y
   contra el backend DE PRODUCCION. La unica cuenta que se crea usa una llave
   recien inventada y un correo del dominio; se borra despues. */
import { chromium } from 'playwright'
const API = 'https://vetawallet-1a2e38ac52b1.herokuapp.com'
const FRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-sandbox','--disable-dev-shm-usage'] })
const ctx = await nav.newContext({ locale:'es-HN', viewport:{width:430,height:1100}, deviceScaleFactor:2 })
const pag = await ctx.newPage()
const err=[], salieron=[]
pag.on('pageerror', e=>err.push(String(e)))
await pag.route('**/*', async (route) => {
  const req = route.request(), u = req.url()
  if (u.startsWith('http://127.0.0.1:8793')) return route.continue()
  if (u.startsWith(API) || u.startsWith('https://rpc.ordenglobal-rpc.com')) {
    if (u.startsWith(API)) salieron.push({ ruta: u.replace(API,''), cuerpo: req.postData() })
    const r = await fetch(u, { method: req.method(), headers:{'content-type':'application/json'}, body: req.postData() })
    return route.fulfill({ status:r.status, contentType:'application/json', body: await r.text() })
  }
  return route.fulfill({ status:200, contentType:'application/json', body:'{}' })
})
await pag.goto('http://127.0.0.1:8793/index.html', { waitUntil:'domcontentloaded' })
await pag.waitForTimeout(2800)

let f=0; const ok=(q,c,x='')=>{console.log(`${c?'  ok  ':' FALLA'}  ${q}${x?'  · '+x:''}`); if(!c)f++}

await pag.evaluate(()=>{ VETA.ir('acceso'); VETA.llaveAbrir() })
await pag.waitForTimeout(500)
await pag.evaluate((fr)=>{
  const c=document.querySelector('#llv-rejilla input[data-i="0"]'); c.focus()
  const dt=new DataTransfer(); dt.setData('text/plain', fr)
  c.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))
}, FRASE)
await pag.waitForTimeout(400)
await pag.click('#btn-llave'); await pag.waitForTimeout(6000)

console.log('\nCuando la frase no tiene cuenta, se ofrece traerla\n')
ok('avisa de que no hay cuenta', /no corresponde a ninguna cuenta/i.test(await pag.textContent('#llv-aviso')||''))
ok('aparece el boton de traerla', await pag.isVisible('.imp-ofrecer'))
await pag.screenshot({path:'/tmp/imp-1.png'})

await pag.click('.imp-ofrecer'); await pag.waitForTimeout(5000)
console.log('\nElegir cual es tu billetera\n')
ok('el aviso de custodia esta arriba', /necesita guardar tu llave/i.test(await pag.textContent('.imp-alerta')||''))
const dirs = await pag.$$('.imp-dir')
ok('lista las candidatas', dirs.length === 5, `${dirs.length} direcciones`)
// La direccion va acortada en la lista (entera no cabe en un telefono).
ok('la primera es la de MetaMask',
   (await pag.textContent('.imp-dir:first-child .d b'))?.trim() === '0x58a57e…bb1b25')
ok('la ultima es la de la casa', /Veta Wallet/.test(await pag.textContent('.imp-dir:last-child .d small')||''))
await pag.screenshot({path:'/tmp/imp-2.png'})

const anchos = await pag.evaluate(() => ({ doc: document.documentElement.scrollWidth, vista: window.innerWidth }))
ok('la pantalla no desborda a lo ancho', anchos.doc <= anchos.vista, `${anchos.doc} vs ${anchos.vista}`)

console.log('\nLa frase nunca viajo\n')
const todo = salieron.map(s=>s.cuerpo||'').join(' ')
ok('la frase NO salio', !todo.includes('legal winner'))
ok('sin errores de javascript', err.length===0)
if(err.length) console.log(err.slice(0,2))
await nav.close()
console.log(f?`\n${f} en rojo\n`:'\nTodo en verde\n')
process.exit(f?1:0)
