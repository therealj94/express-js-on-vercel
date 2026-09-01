/* ¿SE LEEN LOS NOMBRES DEL NÚCLEO EN UN TELÉFONO?
 *
 * En una captura de producción a 390 px, «ORDENSCAN» y «PULSE2CHAT» se leían
 * como una sola palabra, y «GENESIS ID» caía encima de «MINAS» y de
 * «MYTOKENPAY». Es la primera pantalla que ve cualquiera.
 *
 * Los rótulos son texturas 3D dentro de Aetherion, así que NO hay elemento
 * del DOM que medir — eso me costó varias vueltas. Aetherion publica la
 * opacidad y la distancia de cada uno (__AE_ROTULO_OP / _D) justo para esto.
 *
 *     node medir-rotulos-nucleo.mjs ../..  <carpeta-fotos>  <etiqueta>
 *
 * Y hay dos trampas que cuestan una medición en blanco: los nombres están
 * apagados a propósito ANTES de entrar (__AE_PUERTA), y la sesión de mentira
 * necesita una dirección de 40 caracteres o la app se queda en el acceso.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const RAIZ = process.argv[2], SALIDA = process.argv[3], ETIQ = process.argv[4];
const T={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
         '.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const sv=createServer(async(q,r)=>{try{
  const p=join(RAIZ,decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html'));
  const d=await readFile(p);r.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});r.end(d);
}catch{r.writeHead(404);r.end('no');}});
await new Promise(ok=>sv.listen(0,ok));
const base=`http://127.0.0.1:${sv.address().port}`;
const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const p=await nav.newPage({viewport:{width:390,height:844},locale:'es-HN'});
await p.goto(base,{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.setItem('veta.sesion',JSON.stringify({
  token:'x.'+btoa(JSON.stringify({address:'0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2',exp:2e9}))+'.y',
  correo:'jose@ordenglobal.org',nombre:'José Enamorado',
  direccion:'0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2'})));
await p.goto(base,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(3000);
// que se vea el Nucleo, y esperar a que las esferas existan de verdad
await p.evaluate(()=>{try{(0,eval)('VETA').vista('nucleo');}catch(e){}});
/* Se espera al gancho de Aetherion, no a un elemento del DOM: los rotulos
   son texturas 3D y no hay nodo que esperar. */
/* Y se espera a estar DENTRO. Los nombres estan apagados a proposito en la
   puerta («aparecen recien cuando la persona entra»), asi que medir ahi da
   once ceros que no dicen nada de lo que se vino a medir. */
await p.waitForFunction(()=>!window.__AE_PUERTA
    && Object.keys(window.__AE_ROTULO_OP||{}).length>5,
  null,{timeout:30000}).catch(()=>console.log('  NO SE ENTRO: sigue en la puerta'));
await p.waitForTimeout(1500);
/* La burbuja de bienvenida tapa justo la zona que se viene a juzgar. */
await p.evaluate(()=>{ try{ const V=(0,eval)('VETA'); if (V._estado?.().auraAbierta!==false) V.auraToca?.(); }catch(e){} });
await p.evaluate(()=>document.querySelectorAll('#aura-panel .aura-x, .gen-x, [aria-label*="errar"]').forEach(b=>b.click()));
await p.waitForTimeout(1200);
/* Los rotulos viven en una textura 3D, asi que no hay elemento que medir:
   Aetherion publica su opacidad en __AE_ROTULO_OP justo para esto. */
const rot = await p.evaluate(()=>({...(window.__AE_ROTULO_OP||{})}));
const txt = await p.evaluate(()=>({...(window.__AE_ROTULO_TXT||{})}));
const dis = await p.evaluate(()=>({...(window.__AE_ROTULO_D||{})}));
const todos = Object.entries(rot).sort((a,b)=>b[1]-a[1]);
console.log(ETIQ, '· opacidad de cada rotulo:');
todos.forEach(([k,v])=>console.log(`   ${(txt[k]||k).padEnd(16)} op=${v.toFixed(2)}  d=${(dis[k]||0).toFixed(1)}`));
console.log('   legibles (>0.35):', todos.filter(([,v])=>v>0.35).length, 'de', todos.length);
await p.screenshot({path:`${SALIDA}/${ETIQ}.png`});
await nav.close(); sv.close();
