/* LA VOZ EN VIVO: que suene ANTES de que termine de bajar.
 *
 * «por qué se tarda tanto en contestar, por eso hicimos lo de los nodos para
 *  que esto no pasara» — y antes de eso: «le hablo y me envía una nota de voz,
 *  eso no funciona».
 *
 * Las dos quejas son la misma pieza. La respuesta ya no viaja como archivo
 * grabado: baja por trozos según se fabrica y suena con el primero. Lo que se
 * prueba acá es exactamente eso y en este orden:
 *
 *   1. que empiece a sonar con el PRIMER trozo, no con el último;
 *   2. que los trozos se toquen todos y en orden;
 *   3. que en modo voz NO aparezca ninguna nota de voz en el hilo;
 *   4. que callar calle de verdad —lo que suena y lo que venía detrás—;
 *   5. y que si la voz en vivo falla, no se quede muda: vuelve a la nota.
 *
 * ── POR QUE LOS BYTES SON DE VERDAD ──────────────────────────────────────
 *
 * El cuerpo que sirve esta prueba NO está inventado: son los bytes que
 * devolvió el nodo con la GPU, capturados de una llamada real y guardados en
 * `pruebas/datos/voz-trama.bin`. Un mp3 falso probaría el andamio y no el
 * decodificador, que es justo donde esto se puede romper —un trozo mal
 * cortado es un trozo que no suena—.
 *
 * El servidor de prueba se pone en medio igual que el Caddy en producción:
 * todo va al relevo de verdad menos /hablar, que lo contesta él. Y lo sirve
 * con las MISMAS pausas que tuvo la llamada real, para que «suena con el
 * primero» signifique algo.
 *
 * Lo que NO se puede probar acá: que se OIGA. Un navegador sin tarjeta de
 * sonido no hace ruido. Se mide lo verificable —cuándo se programa cada
 * pedazo de audio en el reloj del contexto— espiando AudioBufferSourceNode.
 */
import { chromium } from 'playwright';
import { createServer, request as httpPeticion } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

/* Los trozos reales, y CUANDO LLEGO CADA UNO de verdad. Capturado contra
   cerebro.ordenscan.com: 2,81s / 6,49s / 11,67s desde que se pidió.
   Ojo con estos tres números, que ya me engañaron una vez: son tiempos de
   LLEGADA, no duraciones de audio. Puestas las duraciones por error, el
   servidor de prueba parecía mucho más lento de lo que es y los huecos salían
   del doble. */
const TRAMA = readFileSync(join(AQUI, 'datos', 'voz-trama.bin'));
const PAUSAS = [2808, 3683, 5178];

const puertoLibre = () => new Promise((ok) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); });
});

const P_RELEVO = await puertoLibre();
const relevo = spawn('python3', [join(RAIZ, '../../infra/mensajes/servidor.py')], {
  env: { ...process.env,
         MENSAJES_DATOS: join(mkdtempSync(join(tmpdir(), 'voz-vivo-')), 'datos.json'),
         MENSAJES_PUERTO: String(P_RELEVO),
         HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
  stdio: 'ignore',
});
await new Promise(r => setTimeout(r, 1400));

/* ── EL DE EN MEDIO ───────────────────────────────────────────────────────
 * Igual que el Caddy de producción: /hablar lo sirve él, todo lo demás pasa
 * al relevo tal cual. `caiga` sirve para probar el camino de respaldo. */
let caiga = false;
let pedidosHablar = 0;
const P_PUERTA = await puertoLibre();
const puerta = createServer(async (q, r) => {
  /* `Expose-Headers` no es adorno: sin él el navegador BORRA X-Formato y la
     app cree que el nodo habla otro idioma. Es exactamente el fallo que esta
     prueba encontró —con curl no se ve, porque curl no hace CORS—, así que
     acá se sirve igual que en producción para que siga vigilado. */
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
                 'Access-Control-Allow-Methods': '*',
                 'Access-Control-Expose-Headers': 'X-Formato, X-Duracion' };
  if (process.env.VERBOSO) console.log('   [puerta]', q.method, q.url);
  if (q.method === 'OPTIONS') { r.writeHead(204, cors); return r.end(); }

  if (q.url.split('?')[0] === '/hablar') {
    pedidosHablar++;
    const cuerpo = await new Promise((ok) => {
      let b = ''; q.on('data', c => { b += c; }); q.on('end', () => ok(b));
    });
    let pide = {};
    try { pide = JSON.parse(cuerpo || '{}'); } catch { /* lo mira el assert */ }
    if (caiga) { r.writeHead(503, cors); return r.end('no'); }
    if (!pide.correo || !pide.llave) { r.writeHead(403, cors); return r.end('no'); }
    r.writeHead(200, { ...cors, 'Content-Type': 'application/octet-stream',
                       'X-Formato': 'trozos-mp3-v1', 'Cache-Control': 'no-store' });
    // Se manda trozo a trozo, con su pausa, como sale del nodo. Y adrede
    // partido por la mitad: así se comprueba que el que escucha junta los
    // pedazos en vez de suponer que cada lectura trae un trozo entero.
    let i = 0; let pos = 0;
    const siguiente = () => {
      if (pos >= TRAMA.length) return r.end();
      const largo = parseInt(TRAMA.subarray(pos, pos + 8).toString(), 16);
      const entero = TRAMA.subarray(pos, pos + 8 + largo);
      pos += 8 + largo;
      setTimeout(() => {
        const mitad = Math.floor(entero.length / 2);
        r.write(entero.subarray(0, mitad));
        r.write(entero.subarray(mitad));
        siguiente();
      }, PAUSAS[i++] ?? 400);
    };
    siguiente();
    return;
  }

  /* Todo lo demás, al relevo de verdad, con `http.request` y NO con `fetch`:
     en esta máquina `fetch` sale por el proxy de red de la casa, que no sabe
     nada de un 127.0.0.1 con puerto al azar. Se pierde una hora buscando el
     fallo en la app cuando estaba acá. */
  const cuerpoQ = await new Promise((ok) => {
    const trozos = [];
    q.on('data', c => trozos.push(c));
    q.on('end', () => ok(Buffer.concat(trozos)));
  });
  const arriba = httpPeticion({
    host: '127.0.0.1', port: P_RELEVO, path: q.url, method: q.method,
    headers: { 'Content-Type': q.headers['content-type'] || 'application/json',
               'Content-Length': cuerpoQ.length },
  }, (res) => {
    r.writeHead(res.statusCode, { ...cors, 'Content-Type': 'application/json' });
    res.pipe(r);
  });
  arriba.on('error', () => { try { r.writeHead(502, cors); r.end('no'); } catch { /* ya cerró */ } });
  arriba.end(cuerpoQ);
});
puerta.on('clientError', (e, sock) => { if (process.env.VERBOSO) console.log('   [puerta clientError]', e.code); try { sock.destroy(); } catch {} });
await new Promise(ok => puerta.listen(P_PUERTA, '127.0.0.1', ok));
const PUERTA = `http://127.0.0.1:${P_PUERTA}`;

/* La cuenta de AU-RA, para poder meterle un mensaje al hilo como lo haría
   ella. Va por el relevo de verdad: no hay atajo que valga acá, porque lo que
   se prueba es qué hace la app cuando LLEGA un mensaje suyo. */
const post = (ruta, cuerpo) => new Promise((ok) => {
  const d = Buffer.from(JSON.stringify(cuerpo));
  const q = httpPeticion({ host: '127.0.0.1', port: P_RELEVO, path: ruta, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': d.length } }, (res) => {
      let b = ''; res.on('data', c => { b += c; });
      res.on('end', () => { try { ok(JSON.parse(b)); } catch { ok({}); } });
    });
  q.on('error', () => ok({}));
  q.end(d);
});
const altaAura = await post('/alta', { correo: 'aura@ordenglobal.org', nombre: 'AU-RA' });
const LLAVE_AURA = altaAura.llave;

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const api = createServer((q, r) => {
  const j = (c, b) => { r.writeHead(c, { 'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*' }); r.end(JSON.stringify(b)); };
  if (q.method === 'OPTIONS') return j(204, {});
  const u = q.url.split('?')[0];
  if (u === '/genesis/estado') return j(200, { identidad: { id: 'i1',
    email: 'jose@ordenglobal.org', estado: 'verificada', gid: 'OG-1', faltanDatos: [] } });
  return j(200, u === '/wallet/deposits' || u === '/cards/transactions' ? [] : {});
});
await new Promise(ok => api.listen(0, ok));
const API = `http://127.0.0.1:${api.address().port}`;

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise(ok => sv.listen(8899, '127.0.0.1', ok));
const WEB = 'http://127.0.0.1:8899/index.html';

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  // sin esto el navegador sin tarjeta de sonido no crea el contexto de audio
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

let fallos = 0;
const ok = (c, q, d = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${d && !c ? '\n           ' + d : ''}`);
  if (!c) fallos++;
};

const p = await nav.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true });
if (process.env.VERBOSO) { p.on('console', m => console.log('   [nav]', m.text().slice(0,220))); p.on('pageerror', e => console.log('   [ERR]', String(e).slice(0,220))); }

/* EL ESPÍA. No se puede oír, así que se mira cuándo se PROGRAMA cada pedazo
   en el reloj del contexto —que es el instante en que el navegador se
   compromete a sonarlo— y con qué duración. */
await p.addInitScript(({ u, m }) => {
  window.OG_API = u; window.OG_MENSAJES_API = m;
  /* UN RECONOCEDOR DE VOZ DE MENTIRA, porque el modo no se abre sin uno — y
     eso es a propósito: en Firefox o en un iOS viejo, abrir una pantalla negra
     con la pelotita quieta y nada que funcione es peor que no abrirla. Un
     teléfono de verdad sí lo tiene, así que aquí se pone uno que no escucha
     nada pero existe. No transcribe: lo que se prueba en este archivo es la
     VOZ DE ELLA, no el dictado. */
  class OyenteDeMentira {
    start() { this._vivo = true; }
    stop() { this._vivo = false; if (this.onend) this.onend(); }
    abort() { this._vivo = false; }
    addEventListener() {}
    removeEventListener() {}
  }
  /* Se REEMPLAZA, no se rellena si falta. Chromium sí trae reconocedor, y en
     una máquina sin micrófono falla con 'audio-capture' — que ahora apaga el
     modo y lo dice, como debe. Con `||` el de mentira no entraba nunca y esta
     prueba medía esa caída en vez de la voz. */
  window.SpeechRecognition = OyenteDeMentira;
  window.webkitSpeechRecognition = OyenteDeMentira;
  window.__sonado = [];
  const t0 = performance.now();
  window.__fallos = [];
  window.addEventListener('unhandledrejection', e => window.__fallos.push(String(e.reason)));
  const orig = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (cuando) {
    window.__sonado.push({ en: performance.now() - t0,
                           dura: this.buffer ? this.buffer.duration : 0,
                           programado: cuando });
    return orig.apply(this, arguments);
  };
}, { u: API, m: PUERTA });

await p.goto(WEB);
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  localStorage.setItem('veta.aura.presentada.jose@ordenglobal.org', '1');
  const tk = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: tk, correo: 'jose@ordenglobal.org', nombre: 'José', direccion: '0xaaaa' }));
});
await p.goto(WEB);
await p.waitForTimeout(1600);
await p.evaluate(() => { VETA.ir('app'); VETA.vista('chat'); });
await p.waitForTimeout(2500);
await p.evaluate(() => VETA.vista('chat'));
await p.waitForTimeout(1500);
/* Se abre con `chatAbrir`, la de verdad, y NO con el gancho `_chatCon` de las
   otras pruebas: ese solo pinta el hilo. Acá hace falta que el chat esté VIVO
   —trayendo mensajes— porque lo que se prueba es qué pasa cuando LLEGA uno.
   Con el gancho no llegaba ninguno y no se pedía la voz jamás. */
/* El relevo exige que te acepten antes de escribirte, así que se hace el
   lazo igual que lo haría la app: José pide, AU-RA acepta. */
await p.evaluate(() => CHAT.pedirAmistad('aura@ordenglobal.org'));
await post('/amistad/responder',
  { correo: 'aura@ordenglobal.org', llave: LLAVE_AURA, de: 'jose@ordenglobal.org', aceptar: true });
await p.evaluate(async () => {
  await CHAT.enviar('aura@ordenglobal.org', 'hola');   // para que exista el hilo
  await VETA.chatAbrir('aura@ordenglobal.org');
});
await p.waitForTimeout(1500);
ok(await p.evaluate(() => !!document.querySelector('.cha-aura-tira')),
   'el hilo de AU-RA está abierto y vivo',
   'sin hilo abierto, nada de lo de abajo significa nada');

const decir = (texto) => post('/enviar',
  { correo: 'aura@ordenglobal.org', llave: LLAVE_AURA, para: 'jose@ordenglobal.org', texto });

console.log('\nSuena con el PRIMER trozo, no con el último\n');
await p.evaluate(() => {
  // El motivo del fallo lo tapa el camino de respaldo, que es lo correcto en
  // producción y un estorbo acá: se guarda al pasar.
  const v = CHAT.vozEnVivo;
  CHAT.vozEnVivo = async (o) => {
    try { return await v(o); }
    catch (e) { window.__fallos.push(String(e && e.stack || e)); throw e; }
  };
});
/* `auraVozPantalla` y no `auraCharlarAlterna`: aquella hacía lo mismo,
   mejor, y no la llamaba nadie —el chip del hilo apunta acá—. Se borró y
   su lógica se mudó a esta. */
await p.evaluate(() => VETA.auraVozPantalla());
await p.waitForTimeout(600);
await p.evaluate(() => { window.__sonado.length = 0; window.__t = performance.now(); });
await decir('El Genesis ID es tu identidad única en todo el ecosistema. '
          + 'Con eso entrás a la billetera, al chat y a la tarjeta.');

// Se espera a que suene el primero, con techo generoso: lo que importa es que
// sea MUCHO antes del final, no un número al milímetro.
await p.waitForFunction(() => window.__sonado.length >= 1, null, { timeout: 20000 })
  .catch(() => null);
const primero = await p.evaluate(() => ({
  n: window.__sonado.length,
  desde: window.__sonado.length ? window.__sonado[0].en - window.__t : -1,
  dura: window.__sonado[0]?.dura || 0,
}));
if (process.env.VERBOSO) console.log('   DIAG estado:',
  JSON.stringify(await p.evaluate(() => ({
    pantalla: !!document.querySelector('.aura-voz'),
    est: document.querySelector('.aura-voz-est')?.textContent || null,
    suyo: document.querySelector('.aura-voz-suyo')?.textContent || null,
    burbujas: document.querySelectorAll('#chat-msgs .cha-b, .cha-b').length,
    vozEnVivo: typeof CHAT.vozEnVivo,
    ...VETA._auraVozEstado(),
  }))));
if (process.env.VERBOSO) console.log('   DIAG fallos:',
  JSON.stringify(await p.evaluate(() => window.__fallos)));
ok(primero.n >= 1, 'empieza a sonar sin esperar el resto',
   `no sonó nada (pedidos a /hablar: ${pedidosHablar})`);
ok(primero.desde > 0 && primero.desde < 9000,
   'y lo hace en los primeros segundos, no al final',
   `tardó ${Math.round(primero.desde)}ms`);
if (primero.n >= 1) {
  console.log(`         (primer sonido a los ${(primero.desde / 1000).toFixed(1)}s `
            + `desde que llegó el texto; el audio entero dura 13,4s)`);
}
ok(pedidosHablar === 1, 'y se pidió UNA sola vez, no una por frase',
   `se pidió ${pedidosHablar} veces`);

console.log('\nSe tocan los tres trozos, en orden y empalmados\n');
await p.waitForFunction(() => window.__sonado.length >= 3, null, { timeout: 30000 })
  .catch(() => null);
const todos = await p.evaluate(() => window.__sonado.slice());
ok(todos.length === 3, 'los tres trozos se programan', `se programaron ${todos.length}`);
const duras = todos.map(x => +x.dura.toFixed(1));
ok(duras.length === 3 && duras.every(d => d > 0.5),
   'y cada uno trae audio de verdad, decodificado', `duraciones: ${duras}`);
if (todos.length === 3) {
  // Cada uno arranca donde termina el anterior: eso es lo que hace que una
  // frase partida no suene partida.
  /* EMPALMAN LO QUE SE PUEDE, y lo que se puede está medido. El motor va algo
     más rápido que el tiempo real, así que mientras suena un trozo se fabrica
     el siguiente y casi alcanza — pero no del todo cuando el que viene es más
     largo. Medido de punta a punta contra el nodo: nueve décimas. Eso a oído
     es una pausa entre frases, y cae justo donde termina una.

     El listón está en segundo y medio: por encima ya no es una pausa, es un
     corte, y quiere decir que algo se rompió —el troceado, la red o el reloj del
     audio—. Pedir cero sería pedir que el motor fuese infinitamente rápido. */
  const h1 = todos[1].programado - (todos[0].programado + todos[0].dura);
  const h2 = todos[2].programado - (todos[1].programado + todos[1].dura);
  ok(h1 < 1.5 && h2 < 1.5,
     'y los huecos entre trozos son pausas, no cortes',
     `huecos de ${h1.toFixed(1)}s y ${h2.toFixed(1)}s`);
  ok(h1 >= -0.01 && h2 >= -0.01,
     'y ninguno se pisa con el anterior',
     `huecos de ${h1.toFixed(3)}s y ${h2.toFixed(3)}s`);
}

console.log('\nEn modo voz no aparece ninguna nota de voz\n');
const hilo = await p.evaluate(() => ({
  notas: document.querySelectorAll('.cha-voz').length,
  pantalla: !!document.querySelector('.aura-voz'),
}));
ok(hilo.notas === 0, 'el hilo no se llena de adjuntos que nadie va a tocar',
   `hay ${hilo.notas} nota(s) de voz`);

console.log('\nCallar calla, y no vuelve a hablar solo\n');
await decir('Otra cosa más que decir.');
await p.waitForTimeout(900);
await p.evaluate(() => { window.__sonado.length = 0; VETA.auraCallar(); });
await p.waitForTimeout(4000);
const trasCallar = await p.evaluate(() => window.__sonado.length);
ok(trasCallar === 0, 'después de callar no arranca nada de lo que venía detrás',
   `sonaron ${trasCallar} trozos más`);

console.log('\nSi la voz en vivo no sale, no se queda muda\n');
caiga = true;
const antes = pedidosHablar;
await p.evaluate(() => { window.__sonado.length = 0; });
await decir('Probando el camino de respaldo.');
await p.waitForTimeout(6000);
const respaldo = await p.evaluate(() => ({
  pidio: !!document.querySelector('.cha-aura-voz.on'),
  aviso: document.body.textContent.includes('voz en vivo')
      || document.body.textContent.includes('Live voice'),
}));
ok(pedidosHablar > antes, 'lo intentó', 'ni siquiera pidió la voz');
ok(respaldo.aviso || respaldo.pidio,
   'lo dice y se pasa a la nota de voz',
   'falló en silencio: la persona se queda esperando un sonido que no viene');

await p.screenshot({ path: '/tmp/voz-en-vivo.png' });

await nav.close(); sv.close(); api.close(); puerta.close();
try { relevo.kill(); } catch { /* ya no estaba */ }
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
