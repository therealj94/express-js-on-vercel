import { chromium } from 'playwright'
const FRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] })
const ctx = await nav.newContext({ locale:'es-HN', viewport:{width:430,height:1000}, deviceScaleFactor:2 })
const pag = await ctx.newPage()
const err=[]; pag.on('pageerror', e=>err.push(String(e)))
await pag.route('**/*', r => r.request().url().startsWith('http://127.0.0.1:8791')
  ? r.continue() : r.fulfill({status:200,contentType:'application/json',body:'{}'}))
await pag.goto('http://127.0.0.1:8791/apps-web/veta-wallet/index.html',{waitUntil:'domcontentloaded'})
await pag.waitForTimeout(2600)
await pag.evaluate(()=>{ VETA.ir('acceso'); VETA.llaveAbrir() })
await pag.waitForTimeout(500)

let f=0; const ok=(q,c)=>{console.log(`${c?'  ok  ':' FALLA'}  ${q}`); if(!c)f++}
ok('dibuja 12 recuadros', (await pag.$$('#llv-rejilla input')).length === 12)
ok('el marcador arranca en 0 / 12', (await pag.textContent('#llv-marcador')) === '0 / 12')
ok('arrancan tapadas', await pag.evaluate(()=>document.getElementById('llv-rejilla').classList.contains('tapada')))
await pag.screenshot({path:new URL('..', import.meta.url).pathname.replace(/\/$/,'')+'/rej-1.png'})

// cambiar la cuenta
await pag.click('.llv-cuenta button[data-n="24"]'); await pag.waitForTimeout(250)
ok('cambia a 24 recuadros', (await pag.$$('#llv-rejilla input')).length === 24)
await pag.click('.llv-cuenta button[data-n="12"]'); await pag.waitForTimeout(250)

// una palabra que no existe
await pag.fill('#llv-rejilla input[data-i="0"]', 'zzzzzz')
await pag.waitForTimeout(250)
ok('marca en rojo la palabra que no existe',
   await pag.evaluate(()=>document.querySelector('.llv-slot').classList.contains('mal')))
await pag.fill('#llv-rejilla input[data-i="0"]', 'abandon'); await pag.waitForTimeout(250)
ok('marca en oro la que sí existe',
   await pag.evaluate(()=>document.querySelector('.llv-slot').classList.contains('bien')))

// pegar la frase entera
await pag.evaluate((fr)=>{
  const c = document.querySelector('#llv-rejilla input[data-i="0"]')
  c.focus()
  const dt = new DataTransfer(); dt.setData('text/plain', fr)
  c.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))
}, FRASE)
await pag.waitForTimeout(400)
ok('pegar reparte las doce palabras',
   (await pag.evaluate(()=>[...document.querySelectorAll('#llv-rejilla input')].filter(c=>c.value).length)) === 12)
ok('el marcador llega a 12 / 12', (await pag.textContent('#llv-marcador')) === '12 / 12')
ok('las doce quedan en oro',
   (await pag.$$('.llv-slot.bien')).length === 12)

// mostrar
await pag.click('#llv-ojo'); await pag.waitForTimeout(250)
ok('el ojo destapa', !(await pag.evaluate(()=>document.getElementById('llv-rejilla').classList.contains('tapada'))))
await pag.screenshot({path:new URL('..', import.meta.url).pathname.replace(/\/$/,'')+'/rej-2.png'})

// llave privada
await pag.click('#llv-cambiar'); await pag.waitForTimeout(300)
ok('cambia a llave privada', await pag.isVisible('#llv-privada'))
ok('esconde la rejilla', !(await pag.isVisible('#llv-frase')))
await pag.screenshot({path:new URL('..', import.meta.url).pathname.replace(/\/$/,'')+'/rej-3.png'})
await pag.click('#llv-cambiar'); await pag.waitForTimeout(300)
ok('vuelve a la frase', await pag.isVisible('#llv-frase'))

ok('sin errores de javascript', err.length===0)
if(err.length) console.log(err.slice(0,2))
await nav.close()
console.log(f?`\n${f} en rojo\n`:'\nTodo en verde\n')
process.exit(f?1:0)
