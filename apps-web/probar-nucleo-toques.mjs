/* ¿Se puede TOCAR cada app del Núcleo, en cualquier teléfono?
 *
 * Esta prueba existe porque el fallo que arregló no se ve en una captura: el
 * sello de la cadena se posaba encima de la esfera de PULSE CHAT y se comía el
 * toque. La esfera estaba ahí, con su brillo y su nombre, y no abría nada.
 * Mirando la pantalla no se nota; preguntándole al navegador QUÉ HAY en el
 * centro exacto de cada botón, sí.
 *
 * Comprueba tres cosas en cuatro tamaños reales:
 *   1. en el centro de cada esfera hay ESA esfera y no otra cosa encima;
 *   2. el nombre de cada app se lee entero y no queda tapado ni fuera;
 *   3. el pie —el sello y los dos botones— se alcanza, deslizando si hace falta.
 *
 * No mide belleza. Mide si se puede usar.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const RAIZ='/home/user/express-js-on-vercel/apps-web/veta-wallet';
const T={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg'};
const sv=createServer(async(q,r)=>{try{const p=join(RAIZ,decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html'));const d=await readFile(p);r.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});r.end(d)}catch{r.writeHead(404);r.end('no')}});
await new Promise(ok=>sv.listen(0,ok));
const base='http://127.0.0.1:'+sv.address().port+'/index.html';
const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});

// EL NUCLEO DE ESFERAS ES EL RESPALDO, no la pantalla principal. Desde que
// AETHERION monta la escena 3D en el Inicio, `nucleo()` solo se pinta cuando
// ese bundle no carga. Sin forzarlo, este archivo media sobre una pantalla que
// ya no aparece: encontraba CERO esferas y no lo decia.
//
// Se corta el BUNDLE, no se sustituye AETHERION: la app trata «no cargo el
// bundle» como un camino previsto y cae al cerebro clasico entero. Dejar un
// AETHERION a medias rompe ademas la entrada por la esfera, y entonces la
// prueba estaria midiendo el remiendo en vez de la app.
const SIN_AETHERION = async (pag) => {
  await pag.route('**/aetherion/assets/aetherion.js*', (r) => r.abort());
};

let vacias = 0;
for (const [w,h] of [[1280,860],[390,844],[360,740],[320,568]]) {
  const p=await nav.newPage({viewport:{width:w,height:h},deviceScaleFactor:1,reducedMotion:'reduce',bypassCSP:true});
  await SIN_AETHERION(p);
  await p.goto(base); await p.waitForTimeout(700);
  await p.evaluate(()=>{localStorage.setItem('veta.bienvenida.v1','1');localStorage.setItem('veta.aura.presentada','1');
    VETA.idioma('es');VETA._sembrar([{s:'ORIGEN',n:'Origen',cant:10,precio:.4,nativo:true}]);
    VETA._sesion({correo:'a@b.c',nombre:'José',direccion:'0xaaa'});
    VETA._identidad({estado:'verificada',gid:'OG-1-1'});VETA.ir('app');VETA.vista('nucleo');});
  await p.waitForTimeout(1500);
  // en una pantalla muy baja el pie queda debajo del pliegue A PROPOSITO: la
  // pagina se desliza. Lo que no puede pasar es que sea INALCANZABLE, asi que
  // se baja del todo antes de medir, igual que haria un dedo.
  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
    const fuera=[];
    // el pie entero tiene que caber: si un boton queda debajo de las pestanas
    // no existe, por mucho que este en el DOM
    document.querySelectorAll('.cerebro-pie .btn, .cerebro-pie .nu-power').forEach(e=>{
      const b=e.getBoundingClientRect();
      const t=document.querySelector('.tabs');
      const tope = t && getComputedStyle(t).display!=='none' ? t.getBoundingClientRect().top : innerHeight;
      if (b.bottom > tope + 1) fuera.push({app:'pie:'+e.textContent.trim().slice(0,18), centro:'tapado por las pestanas', etiqueta:''});
    });
    document.querySelectorAll('.nu-mundo[data-mundo]').forEach(e=>{
      const b=e.getBoundingClientRect();
      const centro=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2);
      const eti=e.querySelector('.nu-nombre, b, .nu-tit');
      let tapaEti=null;
      if (eti){const q=eti.getBoundingClientRect();
        const x=q.left+q.width/2, y=q.top+q.height/2;
        const enc=document.elementFromPoint(x,y);
        tapaEti = enc && !e.contains(enc) ? (enc.className||enc.tagName) : null;
        if (q.bottom > innerHeight || q.right > innerWidth || q.left < 0) tapaEti = 'fuera del cuadro';
      }
      const ok = centro && e.contains(centro);
      if (!ok || tapaEti) fuera.push({app:e.dataset.mundo, centro: ok?'ok':(centro?.className||'?'), etiqueta: tapaEti||'ok'});
    });
    return fuera;
  });
  // Un forEach sobre una lista vacia no comprueba nada y sale en verde. Este
  // archivo estuvo diciendo "todas libres" mientras encontraba CERO esferas,
  // que es la peor manera de fallar: en silencio y con buena cara.
  const cuantas = await p.evaluate(()=>document.querySelectorAll('.nu-mundo[data-mundo]').length);
  if (cuantas < 6) { console.log(`${w}x${h}: SIN ESFERAS (${cuantas}) — no se midio nada`); vacias++; }
  else console.log(`${w}x${h}:`, r.length? JSON.stringify(r) : `todas libres (${cuantas} esferas)`);
  await p.close();
}
await nav.close(); sv.close();
if (vacias) { console.log(`\n${vacias} pantalla(s) sin esferas`); process.exit(1); }
