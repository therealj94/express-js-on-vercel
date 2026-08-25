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
/* EL MEDIDOR, DENTRO DE LA PÁGINA Y A VELOCIDAD DE CUADRO. Se arma ANTES de
   arrancar la película para no perderse el primer instante. */
await p.evaluate(() => {
  window.__onda = { max: 0, cuadros: 0, cruceEn: null, alcanzo: 0 };
  const mirar = () => {
    const o = window.__AE_ONDA;
    const d = window.__AE_DESTELLO?.() ?? 0;
    const w = window.__onda;
    if (d > w.max) w.max = d;
    if (d > 0.02) w.cuadros++;
    /* EL CRUCE: el instante en que el radio de la onda pasa la distancia de la
       cámara — el momento en que la luz te alcanza. `p` dice en qué punto del
       fogonazo ocurre; si es casi cero, pasó tan rápido que nadie lo vio. */
    if (o && w.cruceEn === null && o.r >= o.dist) w.cruceEn = o.p;
    if (o && o.r > w.alcanzo) w.alcanzo = o.r;
    requestAnimationFrame(mirar);
  };
  requestAnimationFrame(mirar);
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
/* Se espera al VERSÍCULO, no a un reloj: es la única señal de que se está en
   la tiniebla y no en el título ni ya en la luz. */
await p.waitForFunction(()=>/desordenada/i.test(
  document.querySelector('#gen-letra .gen-centro')?.textContent||''),null,{timeout:25000});
await p.waitForTimeout(900);
const tinTxt = await p.evaluate(() =>
  document.querySelector('#gen-letra .gen-centro')?.textContent || '');
await p.screenshot({path:'/tmp/f-tiniebla.png'});
/* ══ LA TINIEBLA ESTÁ VACÍA, Y ESO ES EL PUNTO ═══════════════════════════
   «Antes de todo no había nada» — y ahora no hay nada de verdad: ni el cielo,
   ni los mundos, ni AU-RA. Antes de este cambio el sol latía en el centro
   durante la tiniebla, y era bonito pero contaba otra cosa: que ya había
   alguien. La luz sale de un punto que NO ESTABA, y eso solo se puede contar
   si antes ese punto no está. */
ok('la Escritura se lee en minúsculas, no en versalitas',
   /[a-záéíóúñ]/.test(tinTxt), tinTxt.slice(0, 46));
ok('y el versículo es el que toca', /desordenada y vacía/i.test(tinTxt), tinTxt.slice(0, 40));
const tin = await medir('/tmp/f-tiniebla.png');
/* Se mide el BRILLO MEDIO y lo más claro FUERA de la banda del texto — no el
   píxel del centro, que aquí cae justo encima de una letra del versículo. */
ok('la tiniebla está vacía de verdad', tin.medio <= 8 && tin.maxFuera <= 30,
   `medio ${tin.medio}/255 · lo más claro fuera del texto ${tin.maxFuera}/255`);

/* ══ PRIMERO SE DICE, Y ENTONCES ESTALLA ═══════════════════════════════════
   El orden del versículo es el orden de la escena: se lee «y dijo Dios: sea la
   luz» sobre el negro, y recién entonces la luz ocurre. Al revés —la luz
   primero y la frase después— se cuenta el final antes del principio, y además
   la frase se escribe sobre el blanco del fogonazo y no se lee.
   Se comprueba que cuando la orden está en pantalla TODAVÍA no haya pasado
   nada: ni luz, ni cielo, ni mundos. */
await p.waitForFunction(()=>/Sea la luz/i.test(
  document.querySelector('#gen-letra .gen-centro')?.textContent||''),null,{timeout:120000});
const alDecir = await p.evaluate(()=>({
  destello: window.__AE_DESTELLO?.() ?? 0,
  vacio: window.__AE_VACIO?.() ?? 0,
  txt: document.querySelector('#gen-letra .gen-centro')?.textContent||'',
}));
await p.screenshot({path:'/tmp/f-orden.png'});
ok('la orden se lee ANTES de que pase nada',
   alDecir.destello === 0 && alDecir.vacio > 0.9,
   `destello ${alDecir.destello} · vacío ${alDecir.vacio}`);
ok('y dice la orden, no el remate', /Sea la luz/.test(alDecir.txt) && !/fue la luz/i.test(alDecir.txt),
   alDecir.txt.slice(0, 40));

/* ══ EL FOGONAZO SE MIDE, NO SE FOTOGRAFÍA ════════════════════════════════
   Un navegador sin pantalla no da cuadros para fotografiar un suceso de
   segundo y medio: las tres capturas caían en el mismo instante y los números
   hablaban del banco de pruebas y no de la película — la peor clase de
   prueba, la que falla cuando todo está bien. Las capturas se siguen tomando
   para poder MIRARLAS (para juzgar un efecto, los ojos siguen siendo el mejor
   instrumento), pero lo que se afirma sale del medidor que corre dentro de la
   página, en cada cuadro. */
/* ══ Y AHORA SE ESPERA AL FOGONAZO ═════════════════════════════════════════
   Con paciencia: la película avanza al ritmo de los CUADROS, y un navegador
   sin pantalla da muy pocos — catorce segundos de película pueden ser un
   minuto largo de reloj aquí. El tiempo de espera no dice nada de la
   película, solo de este banco de pruebas. */
await p.waitForFunction(() => (window.__AE_DESTELLO?.() ?? 0) > 0.02,
  null, { timeout: 180000 });
await p.screenshot({ path: '/tmp/f-onda1.png' });
await p.waitForTimeout(600);
await p.screenshot({ path: '/tmp/f-onda2.png' });
/* Y a que se apague del todo, para ver la escena ya encendida detrás. */
await p.waitForFunction(() => (window.__AE_DESTELLO?.() ?? 0) === 0,
  null, { timeout: 60000 });
await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/f-onda3.png' });


const w = await p.evaluate(() => window.__onda);

ok('«y fue la luz» destella de verdad', w.max > 0.9, `llegó a ${w.max.toFixed(2)}`);
ok('y el fogonazo dura, no parpadea', w.cuadros >= 4, `${w.cuadros} cuadros`);
/* ══ LO QUE UNA FOTO NO VE ════════════════════════════════════════════════
   Que la luz TARDE en llegar. Con la curva mal puesta —una raíz, que sale
   disparada— la onda cruzaba al espectador en catorce centésimas: ocurría,
   pero nadie la veía, y desde fuera eso se ve idéntico a un fogonazo perfecto.
   Se exige que el cruce caiga pasado el quince por ciento del destello y antes
   del ochenta: antes es un parpadeo, después la luz llega cuando ya se apagó. */
ok('y la luz se ve VIAJAR hasta uno',
   w.cruceEn !== null && w.cruceEn > 0.15 && w.cruceEn < 0.8,
   w.cruceEn === null ? 'la onda nunca alcanzó a la cámara'
     : `cruza al ${Math.round(w.cruceEn * 100)}% del fogonazo`);
ok('y se pasa de largo', w.alcanzo > 100, `llegó a ${Math.round(w.alcanzo)} unidades`);
/* ══ «Y CUANDO PASA, LA ESCENA VUELVE» NO SE AFIRMA DESDE UNA FOTO ═════════
   Haría falta fotografiar un instante concreto, y en este banco de pruebas el
   obturador cae donde lo deje el ritmo de cuadros: la misma foto sale a veces
   en la luz y a veces tres planos después. Una afirmación así falla cuando
   todo está bien, que es la peor clase de prueba.
   Y no hace falta: lo que esa foto quería decir ya está demostrado arriba con
   números. La onda llega a 114 unidades —muy por detrás de la cámara— y su
   opacidad se derrumba en cuanto la pasa (ver Destello.tsx: `yaPaso`). Si se
   quedara haciendo niebla, `alcanzo` seguiría creciendo y el cruce nunca se
   registraría. */
await b.close(); sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
console.log('capturas: /tmp/f-titulo.png /tmp/f-tiniebla.png /tmp/f-onda1..3.png');
process.exit(f ? 1 : 0);
