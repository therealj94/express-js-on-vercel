/* UNA SOLA AU-RA, UNA SOLA VOZ — Y SE CONVERSA SIN TOCAR NADA.
 *
 * «tenemos voces cruzadas: pregunté MyTokenPay y me contestó la voz vieja
 *  robótica. Tenemos una AI propia, tenemos que usarla en todo momento.»
 * «que pueda hablar desde el chat burbuja con voz, no con notas de voz, sino
 *  fluido, hablar sin tener que tocar un botón para que me escuche.»
 *
 * Eran dos cosas y las dos estaban:
 *
 *   1. LA BURBUJA HABLABA CON OTRA VOZ. Usaba `AURA.hablar`, que toca una
 *      frase GRABADA si la conoce y, si no, se cae al sintetizador del
 *      navegador — la voz de contestador. Las cuatro frases de siempre sonaban
 *      bien y todo lo demás sonaba a máquina.
 *
 *   2. EL MICRÓFONO ERA DE UN SOLO TIRO. Tocabas, decías una cosa, se apagaba.
 *      Para la segunda frase, a tocar otra vez.
 *
 * Se prueba con el motor de voz de mentira —lo que importa acá es A QUIÉN se
 * le pide la voz, no cómo suena— y con un reconocedor de mentira que se puede
 * hacer «oír» a voluntad, porque un navegador de escritorio no tiene ninguno
 * de los dos.
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
const TRAMA = readFileSync(join(AQUI, 'datos', 'voz-trama.bin'));

const puertoLibre = () => new Promise((ok) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); });
});

const P_RELEVO = await puertoLibre();
const relevo = spawn('python3', [join(RAIZ, '../../infra/mensajes/servidor.py')], {
  env: { ...process.env,
         MENSAJES_DATOS: join(mkdtempSync(join(tmpdir(), 'burbvoz-')), 'datos.json'),
         MENSAJES_PUERTO: String(P_RELEVO),
         HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1400));

/* El de en medio, como el Caddy: /hablar lo contesta él con los bytes reales
   del nodo, y todo lo demás pasa al relevo. Cuenta los pedidos, que es la
   comprobación de «¿a quién le pidió la voz?». */
let pedidosHablar = 0;
const P_PUERTA = await puertoLibre();
const puerta = createServer(async (q, r) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
                 'Access-Control-Allow-Methods': '*',
                 'Access-Control-Expose-Headers': 'X-Formato, X-Duracion' };
  if (q.method === 'OPTIONS') { r.writeHead(204, cors); return r.end(); }
  if (q.url.split('?')[0] === '/hablar') {
    pedidosHablar++;
    await new Promise((ok) => { let b = ''; q.on('data', (c) => { b += c; }); q.on('end', () => ok(b)); });
    r.writeHead(200, { ...cors, 'Content-Type': 'application/octet-stream',
                       'X-Formato': 'trozos-mp3-v1', 'Cache-Control': 'no-store' });
    // el primer trozo y nada más: alcanza para que suene y la prueba no espera
    const largo = parseInt(TRAMA.subarray(0, 8).toString(), 16);
    r.write(TRAMA.subarray(0, 8 + largo));
    return r.end();
  }
  const cuerpoQ = await new Promise((ok) => {
    const t = []; q.on('data', (c) => t.push(c)); q.on('end', () => ok(Buffer.concat(t)));
  });
  const arriba = httpPeticion({ host: '127.0.0.1', port: P_RELEVO, path: q.url, method: q.method,
    headers: { 'Content-Type': 'application/json', 'Content-Length': cuerpoQ.length } }, (res) => {
      r.writeHead(res.statusCode, { ...cors, 'Content-Type': 'application/json' });
      res.pipe(r);
    });
  arriba.on('error', () => { try { r.writeHead(502, cors); r.end('no'); } catch { /* ya cerró */ } });
  arriba.end(cuerpoQ);
});
await new Promise((ok) => puerta.listen(P_PUERTA, '127.0.0.1', ok));

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
await new Promise((ok) => api.listen(0, ok));
const API = `http://127.0.0.1:${api.address().port}`;

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(8899, '127.0.0.1', ok));
const WEB = 'http://127.0.0.1:8899/index.html';

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

let fallos = 0;
const ok = (c, q, d = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${d && !c ? '\n           ' + d : ''}`);
  if (!c) fallos++;
};

const p = await nav.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true });
await p.addInitScript(({ u, m }) => {
  window.OG_API = u; window.OG_MENSAJES_API = m;
  /* EL RECONOCEDOR DE MENTIRA. Guarda sus manejadores y expone `__oir(txt)`
     para simular que alguien habló. Un navegador de escritorio no tiene
     micrófono, y lo que se prueba acá es el CICLO, no el dictado. */
  window.__oidos = 0;
  class Oyente {
    start() { window.__oidos++; window.__ultimoOyente = this; }
    stop() { this.onend?.(); }
    abort() {}
    addEventListener() {} removeEventListener() {}
  }
  window.SpeechRecognition = Oyente;
  window.webkitSpeechRecognition = Oyente;
  /* Con `resultIndex`, como lo emite el navegador de verdad: el oído único
     lee SOLO desde ahí —es lo que arregló el «salen cosas random»— y un
     evento sin ese campo se lee como si nada hubiera cambiado. */
  window.__oir = (txt) => {
    const o = window.__ultimoOyente;
    if (!o || !o.onresult) return false;
    const res = Object.assign([{ transcript: txt }], { isFinal: true });
    o._rs = o._rs || [];
    o._rs.push(res);
    o.onresult({ results: o._rs, resultIndex: o._rs.length - 1 });
    return true;
  };
  /* Y se cuenta si alguien llama al sintetizador del navegador — la voz vieja.
     Que no lo llame nunca (estando dentro de la sesión) es media prueba. */
  window.__robotica = 0;
  if (window.speechSynthesis) {
    const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => { window.__robotica++; return orig(u); };
  }
}, { u: API, m: `http://127.0.0.1:${P_PUERTA}` });

await p.goto(WEB);
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  localStorage.setItem('veta.aura.presentada.jose@ordenglobal.org', '1');
  const tk = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: tk, correo: 'jose@ordenglobal.org', nombre: 'José Ordóñez', direccion: '0xaaaa' }));
});
await p.goto(WEB);
await p.waitForTimeout(2200);
await p.evaluate(() => VETA.ir('app'));
await p.waitForTimeout(2600);

const burbujas = () => p.evaluate(() =>
  [...document.querySelectorAll('#aura-panel .aura-b:not(.aura-pensando)')]
    .map((b) => b.textContent.trim()));

console.log('\nAl abrir te saluda por tu nombre\n');
await p.evaluate(() => VETA.auraToca());
await p.waitForTimeout(2000);
const b1 = await burbujas();
ok(b1.some((x) => x.includes('José')),
   'dice tu nombre, no un saludo de folleto',
   `las burbujas fueron: ${JSON.stringify(b1)}`);
ok(b1.some((x) => /Buenos días|Buenas tardes|Buenas noches|Good morning|Good afternoon|Good evening/.test(x)),
   'y con el momento del día que toca según el reloj del teléfono');

console.log('\nY te ofrece hablar, una sola vez\n');
ok(b1.some((x) => /micrófono|microphone/i.test(x)),
   'ofrece activar el micrófono',
   'nadie adivina que la burbuja escucha: hay que decirlo');
const botones = await p.evaluate(() =>
  [...document.querySelectorAll('#aura-panel .aura-b button')].map((b) => b.textContent.trim()));
ok(botones.some((x) => /Probar|Try/i.test(x)), 'con su botón para probarlo',
   `los botones fueron: ${JSON.stringify(botones)}`);

console.log('\nHabla con NUESTRA voz, no con la robótica\n');
await p.waitForTimeout(1200);
const vozUsada = await p.evaluate(() => window.__robotica);
ok(pedidosHablar >= 1,
   'el saludo se pidió al motor de la casa',
   `pedidos a /hablar: ${pedidosHablar}`);
ok(vozUsada === 0,
   'y el sintetizador del navegador no se usó ni una vez',
   `lo llamaron ${vozUsada} veces — esa es la voz vieja robótica`);

console.log('\nSe habla apretando, y se contesta al soltar\n');
/* ESTE BLOQUE DECÍA LO CONTRARIO. Comprobaba el modo manos libres: que al
 * encenderlo una vez el micrófono se quedara puesto, y que al terminar de
 * contestar volviera a escuchar SOLA. Era correcto mientras ese fue el modo,
 * y se cambió por lo que se sufrió con la app en la mano —«sigue crashing,
 * pésimo de escucha, está como loco»— con UNA sola persona usándola.
 *
 * El automatismo tenía cinco piezas y ninguna forma de saber cuál falló; el
 * reenganche, además, era `onend` llamando a `start()` en cadena, que es lo
 * que tumba la pestaña en el teléfono. Ahora manda el dedo. */
await p.evaluate(() => VETA.auraPulsarEmpezar());
await p.waitForTimeout(600);
ok(await p.evaluate(() => window.__oidos >= 1), 'al apretar, abre el micrófono',
   `arrancó ${await p.evaluate(() => window.__oidos)} veces`);
ok(await p.evaluate(() => !!document.querySelector('#aura-panel .aura-mic.hablando')),
   'y mientras lo tenés apretado se ve que está escuchando');

const antesDeHablar = await p.evaluate(() => window.__oidos);
const pedidosAntes = pedidosHablar;
await p.evaluate(() => window.__oir('¿qué es ORIGEN?'));
await p.evaluate(() => VETA.auraPulsarSoltar());
await p.waitForTimeout(3000);
const trasHablar = await burbujas();
ok(trasHablar.some((x) => x.includes('ORIGEN')),
   'lo que dijiste entra en la conversación',
   `las burbujas fueron: ${JSON.stringify(trasHablar.slice(-3))}`);
ok(pedidosHablar > pedidosAntes,
   'y contesta con la voz de la casa',
   `pedidos a /hablar: ${pedidosAntes} antes, ${pedidosHablar} después`);

/* «Una respuesta, una petición de voz» NO se comprueba acá y no es un
 * olvido: en esta prueba no hay asistente detrás, así que «¿qué es ORIGEN?»
 * la contesta el cerebro local de la wallet en un solo mensaje ya completo.
 * Trocear o no trocear da lo mismo, y una comprobación que no puede fallar
 * es ruido que se lee como cobertura. Lo comprueba probar-globo-crece, que
 * sí simula un mensaje creciendo — y está verificado quitando el arreglo. */

/* LA COMPROBACIÓN QUE DEFINE EL MODO NUEVO, y es la contraria de la de
   antes: al soltar, el micrófono NO se vuelve a abrir solo. Si se abriera,
   estaría escuchando mientras ella suena en el altavoz — que es de donde
   salía que se transcribiera a sí misma. */
await p.waitForTimeout(3500);
const trasContestar = await p.evaluate(() => window.__oidos);
ok(trasContestar === antesDeHablar,
   'y al soltar NO se vuelve a abrir solo: manda el dedo',
   `el micrófono se abrió ${antesDeHablar} veces antes y ${trasContestar} después: `
   + 'si crece, volvió el reenganche automático');
ok(!await p.evaluate(() => !!document.querySelector('#aura-panel .aura-mic.hablando')),
   'y el botón ya no se ve apretado',
   'quedaría diciendo que escucha con el micrófono cerrado');

console.log('\nLa voz se elige en la burbuja, y se confirma OYÉNDOLA\n');
const sel = await p.evaluate(() =>
  [...document.querySelectorAll('#aura-panel .aura-voz-sel option')].map((o) => o.value));
ok(sel.join(',') === 'calida,sobria,agil',
   'el selector ofrece los tres registros', `ofreció: ${sel.join(',')}`);
const pedidosSel = pedidosHablar;
await p.evaluate(() => VETA.auraRegistroElegir('sobria'));
await p.waitForTimeout(1500);
ok(await p.evaluate(() => localStorage.getItem('veta.aura.registro')) === 'sobria',
   'la elección queda guardada');
ok(pedidosHablar > pedidosSel,
   'y se confirma diciéndola con la voz de la casa',
   'la única manera honesta de elegir una voz es oírla');

console.log('\nCerrar la burbuja apaga el micrófono\n');
await p.evaluate(() => VETA.auraToca());
await p.waitForTimeout(500);
const quieto = await p.evaluate(() => window.__oidos);
await p.waitForTimeout(1500);
ok((await p.evaluate(() => window.__oidos)) === quieto,
   'con la burbuja cerrada ya no se escucha',
   'seguir escuchando a alguien que acaba de cerrar la ventana no se hace');

await nav.close(); sv.close(); api.close(); puerta.close();
try { relevo.kill(); } catch { /* ya no estaba */ }
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
