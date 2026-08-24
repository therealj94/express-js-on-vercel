/* EL NEGRO ES NEGRO, Y LA LUZ SALE DE AU-RA.
 *
 *   node pruebas/apertura.mjs      (sirve la carpeta en 8893 él solo)
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * «Empecemos con todo apagado, todo oscuro» es una de las pocas cosas de esta
 * película que no admiten un «casi» — y durante todo este tiempo no se cumplía.
 * Ninguna prueba lo veía porque todas preguntaban por VALORES: la noche estaba
 * en 1, el vacío en 1, y las dos daban verde. Pero tres piezas del sol tenían
 * la opacidad escrita a mano en el JSX (0,9 el corazón, 0,3 la cromosfera, 0,55
 * el aro) y ninguna perilla las tocaba, y la retícula de la galaxia se quedaba
 * con un ocho por ciento encendido. En una pantalla grande y a oscuras eso no
 * es negro: es una bola con un anillo flotando en medio de la nada.
 *
 * Un valor no lo iba a decir nunca. Hay que MIRAR LOS PÍXELES. Esta prueba
 * fotografía el arranque y mide el brillo de lo que no es texto.
 *
 * Y de paso comprueba lo que sigue: que en la tiniebla AU-RA se vea —una brasa
 * latiendo, sin la cual el destello sale de la nada en vez de salir de
 * alguien—, y que el fogonazo sea de verdad un fogonazo.
 *
 * Deja las capturas en /tmp para poder mirarlas con los ojos, que para esto
 * siguen siendo el mejor instrumento.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const RAIZ='/home/user/express-js-on-vercel/apps-web/veta-wallet';
let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };

/* EL MEDIDOR. Un PNG se lee sin librerías: se descomprime con zlib y se
   recorren las filas deshaciendo los filtros. Se devuelven tres números — el
   brillo medio, el del centro exacto de la pantalla, y el más alto FUERA de la
   banda donde vive el texto, que es el que dice si el negro es negro. */
async function medir(ruta) {
  const { readFileSync } = await import('node:fs');
  const zlib = await import('node:zlib');
  const buf = readFileSync(ruta);
  let i = 8, w = 0, h = 0, prof = 0, tipo = 0;
  const trozos = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const nom = buf.toString('ascii', i + 4, i + 8);
    if (nom === 'IHDR') {
      w = buf.readUInt32BE(i + 8); h = buf.readUInt32BE(i + 12);
      prof = buf[i + 16]; tipo = buf[i + 17];
    } else if (nom === 'IDAT') trozos.push(buf.subarray(i + 8, i + 8 + len));
    else if (nom === 'IEND') break;
    i += 12 + len;
  }
  if (prof !== 8 || (tipo !== 6 && tipo !== 2)) throw new Error('PNG inesperado');
  const canales = tipo === 6 ? 4 : 3;
  const cruda = zlib.inflateSync(Buffer.concat(trozos));
  const linea = w * canales;
  const px = Buffer.alloc(h * linea);
  for (let y = 0; y < h; y++) {
    const filtro = cruda[y * (linea + 1)];
    const ent = cruda.subarray(y * (linea + 1) + 1, y * (linea + 1) + 1 + linea);
    const sal = px.subarray(y * linea, (y + 1) * linea);
    for (let x = 0; x < linea; x++) {
      const a = x >= canales ? sal[x - canales] : 0;
      const b = y > 0 ? px[(y - 1) * linea + x] : 0;
      const c = (x >= canales && y > 0) ? px[(y - 1) * linea + x - canales] : 0;
      let v = ent[x];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      sal[x] = v & 255;
    }
  }
  const luz = (x, y) => {
    const o = y * linea + x * canales;
    return (px[o] * 0.299 + px[o + 1] * 0.587 + px[o + 2] * 0.114);
  };
  let suma = 0, n = 0, maxFuera = 0;
  /* La banda del texto. El titulo vive en el medio vertical, es oro y lleva un
     resplandor de ochenta pixeles a proposito — ese halo llega bastante mas
     lejos que las letras. Excluir solo el renglon daba 96/255 y era el propio
     titulo acusandose a si mismo. Se excluye el medio entero: lo que se
     pregunta es si hay algo ENCENDIDO donde no deberia haber nada. */
  const y0 = Math.floor(h * 0.26), y1 = Math.floor(h * 0.74);
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const v = luz(x, y);
      suma += v; n++;
      if (y < y0 || y > y1) maxFuera = Math.max(maxFuera, v);
    }
  }
  return {
    medio: Math.round(suma / n),
    centro: Math.round(luz(w >> 1, h >> 1)),
    maxFuera: Math.round(maxFuera),
  };
}
spawn('fuser',['-k','8893/tcp']).on('close',()=>{});
await new Promise(r=>setTimeout(r,400));
const sv=spawn('python3',['-m','http.server','8893','--bind','127.0.0.1','--directory',RAIZ],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,900));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader',
        '--disable-background-timer-throttling','--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows']});
const JWT=()=>'x.'+Buffer.from(JSON.stringify({sub:'f',userId:'f',address:'0x'+'2'.repeat(40),exp:Math.floor(Date.now()/1000)+9999})).toString('base64url')+'.y';
const ctx=await b.newContext({viewport:{width:1280,height:800},locale:'es'});
const p=await ctx.newPage();
await p.addInitScript(`localStorage.setItem('veta.idioma','es');localStorage.setItem('veta.musica','no');localStorage.setItem('veta.genesis.visto','1');`);
await p.route(/herokuapp\.com/,r=>r.fulfill({status:200,json:{}}));
await p.route(/coingecko\.com/,r=>r.fulfill({json:{}}));
await p.route('**/auth/login',r=>r.fulfill({json:{token:JWT(),user:{email:'f@x.com',name:'José'}}}));
await p.goto('http://127.0.0.1:8893/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>!document.getElementById('velo-og'),null,{timeout:20000}).catch(()=>{});
const pu=await p.$('#bienvenida .btn-oro'); if(pu&&await pu.isVisible()) await pu.click();
await p.waitForSelector('#i-correo',{state:'visible',timeout:20000});
await p.fill('#i-correo','f@x.com'); await p.fill('#i-clave','c'); await p.click('#btn-acceso');
await p.waitForFunction(()=>!document.getElementById('app').classList.contains('oculto'),null,{timeout:30000});
await p.waitForFunction(()=>!!window.__AE_GENESIS,null,{timeout:45000});
await p.waitForTimeout(2500);
await p.evaluate(()=>{
  VETA.tourGenesis('prueba');
});

// EL TITULO — la foto se toma con el vacio COMPROBADO en 1, no a ojo de reloj
await p.waitForFunction(()=>!!document.querySelector('#gen-letra .gen-centro.titulo.ve'),null,{timeout:20000});
await p.waitForTimeout(1600);
const est = await p.evaluate(()=>({vacio:window.__AE_VACIO(), noche:window.__AE_NOCHE(),
  txt:document.querySelector('#gen-letra .gen-centro')?.textContent}));
await p.screenshot({path:'/tmp/f-titulo.png'});
ok('el título llega con el vacío puesto', est.vacio > 0.99 && est.noche > 0.99,
   `vacío ${est.vacio} · noche ${est.noche}`);
ok('y dice lo que tiene que decir', est.txt === 'EL ORIGEN DE TODO', est.txt);

/* ══ Y AHORA LOS PÍXELES ══════════════════════════════════════════════════
   Se mide el brillo MÁXIMO fuera de la banda del texto. El título es oro y
   brilla a propósito; lo que no puede haber es nada más encendido. */
const negrura = await medir('/tmp/f-titulo.png');
ok('el negro absoluto es negro de verdad', negrura.maxFuera <= 30,
   `lo más claro fuera del título: ${negrura.maxFuera}/255`);
/* Y EL BRILLO MEDIO. Es el numero que delata un fondo sucio: la reticula de la
   galaxia encendida al ocho por ciento no hace ningun pixel brillante, pero
   levanta la media de toda la pantalla. */
ok('y no hay fondo encendido por debajo', negrura.medio <= 6,
   `brillo medio ${negrura.medio}/255`);


// LA TINIEBLA: ¿se ve AU-RA esperando?
await p.waitForFunction(()=>window.__AE_NOCHE()>0.95,null,{timeout:20000});
await p.waitForTimeout(1200);
await p.screenshot({path:'/tmp/f-tiniebla.png'});
/* EN LA TINIEBLA SÍ HAY ALGO: AU-RA. Se mide el centro exacto de la pantalla,
   que es donde vive. Si estuviera apagada del todo, el destello de la luz
   saldría de la nada — y sale de ella. */
const tin = await medir('/tmp/f-tiniebla.png');
ok('en la tiniebla AU-RA se ve latiendo', tin.centro >= 18,
   `el centro está a ${tin.centro}/255`);
ok('pero la tiniebla sigue siendo tiniebla', tin.medio <= 70,
   `brillo medio ${tin.medio}/255`);

// EL DESTELLO: tres fotos mientras la onda cruza
await p.waitForFunction(()=>window.__AE_DESTELLO()>0.85,null,{timeout:30000});
const d1 = await p.evaluate(()=>window.__AE_DESTELLO());
await p.screenshot({path:'/tmp/f-onda1.png'});
await p.waitForFunction(()=>window.__AE_DESTELLO()<0.60,null,{timeout:9000});
const d2 = await p.evaluate(()=>window.__AE_DESTELLO());
await p.screenshot({path:'/tmp/f-onda2.png'});
await p.waitForFunction(()=>window.__AE_DESTELLO()<0.22,null,{timeout:9000});
const d3 = await p.evaluate(()=>window.__AE_DESTELLO());
await p.screenshot({path:'/tmp/f-onda3.png'});
/* EL FOGONAZO: en su pico la pantalla tiene que estar INUNDADA. Y después,
   ya no: si siguiera lavada, la onda estaría haciendo niebla en vez de luz. */
const o1 = await medir('/tmp/f-onda1.png');
const o3 = await medir('/tmp/f-onda3.png');
ok('el fogonazo inunda la vista', o1.medio >= 110, `brillo medio ${o1.medio}/255`);
ok('y sale del CENTRO', o1.centro >= 230, `el centro a ${o1.centro}/255`);
ok('y cuando pasa, la escena vuelve —no queda lavada—',
   o3.medio < o1.medio * 0.62, `de ${o1.medio} a ${o3.medio}`);
await b.close(); sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
console.log('capturas: /tmp/f-titulo.png /tmp/f-tiniebla.png /tmp/f-onda1..3.png');
process.exit(f ? 1 : 0);
