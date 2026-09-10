/* LA VISITA TAMBIÉN HABLA CON LA AU-RA DE VERDAD.
 *
 * EL HUECO QUE ESTO TAPA
 *
 * `probar-aura-una-sola.mjs` cubre a quien YA ENTRÓ: con la sesión abierta la
 * bola habla con la AU-RA de verdad por PULSE2CHAT, y eso funciona.
 *
 * Quien no tiene cuenta no tiene por dónde. Sin sesión no hay PULSE2CHAT, así
 * que la visita se quedaba con las reglas escritas en `app.js`. Y la visita es
 * justo la persona del principio del embudo: la que llega, pregunta, y decide
 * si abre una billetera o se va. Le estábamos dando la AU-RA que no aprende.
 *
 * Ahora va por el buzón (`infra/aura/buzon`), que el nodo recoge saliendo.
 *
 * LO QUE SE PRUEBA, QUE ES EL REPARTO
 *
 *   · lo que las reglas SÍ saben se sigue contestando en el acto, sin red:
 *     mandar «hola» a dar la vuelta por Render para recibir lo mismo dos
 *     segundos después es peor producto.
 *   · lo que no saben va al buzón y vuelve.
 *   · con el buzón CAÍDO se contesta lo de siempre. Una AU-RA que enmudece
 *     cuando se cae un servicio es peor que una que sabe menos.
 *   · la sesión la reparte el nodo y el navegador solo la guarda.
 *
 * El buzón es de mentira —levantado acá— porque se prueba el CAMINO, no lo
 * que dice el modelo.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const RAIZ = '/home/user/express-js-on-vercel/apps-web/veta-wallet';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

const LA_FRASE = 'ESTO-VINO-DEL-BUZON, no de las reglas del navegador.';
const LA_SESION = 'web:AAAAAAAAAAAAAAAAAAAAAA';

/* Buzón de mentira. `caido` se enciende desde la prueba para comprobar que la
   respuesta de siempre sigue saliendo cuando el servicio no está. */
let caido = false;
let recibido = [];
const buzon = createServer((q, r) => {
  const j = (c, b) => { r.writeHead(c, { 'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*' }); r.end(JSON.stringify(b)); };
  if (q.method === 'OPTIONS') return j(204, {});
  if (caido) { r.writeHead(503); return r.end('no'); }
  const u = q.url.split('?')[0];
  if (u === '/decir') {
    let cuerpo = '';
    q.on('data', d => { cuerpo += d; });
    return q.on('end', () => {
      recibido.push(JSON.parse(cuerpo || '{}'));
      j(200, { ticket: 'tk-' + recibido.length });
    });
  }
  if (u.startsWith('/oir/')) {
    return j(200, { listo: true, texto: LA_FRASE, sesion: LA_SESION,
                    botones: [{ texto: 'Abrir mi billetera', id: 'empezar' }] });
  }
  return j(404, {});
});
await new Promise(ok => buzon.listen(0, '127.0.0.1', ok));
const BUZON = `http://127.0.0.1:${buzon.address().port}`;

const api = createServer((q, r) => {
  r.writeHead(200, { 'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
  r.end('{}');
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
await new Promise(ok => sv.listen(8897, '127.0.0.1', ok));

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

let fallos = 0;
const ok = (c, q, d = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${d && !c ? '\n           ' + d : ''}`);
  if (!c) fallos++;
};

const p = await nav.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true });
p.on('pageerror', e => console.log('   ⚠ error de página:', String(e).slice(0, 180)));

await p.addInitScript(({ u, b }) => { window.OG_API = u; window.OG_BUZON = b; },
  { u: API, b: BUZON });
await p.goto('http://127.0.0.1:8897/index.html');
await p.evaluate(() => localStorage.setItem('veta.bienvenida.v1', '1'));
await p.goto('http://127.0.0.1:8897/index.html');
await p.waitForTimeout(2200);

const hilo = () => p.evaluate(() => document.querySelector('#aura-hilo')?.textContent || '');

console.log('\nSin cuenta: la visita entra sin sesión\n');
ok(await p.evaluate(() => !localStorage.getItem('veta.sesion')),
   'no hay sesión de billetera: es una visita de verdad');

console.log('\nLo que las reglas SÍ saben no sale a la red\n');
recibido = [];
await p.evaluate(() => VETA.auraChip('¿qué es ORIGEN?'));
await p.waitForTimeout(1200);
ok(recibido.length === 0,
   '«¿qué es ORIGEN?» lo contesta el navegador, en el acto',
   'dar la vuelta por Render para decir lo que ya sabíamos es peor producto');
ok((await hilo()).length > 40, 'y contesta algo, no se queda muda');

console.log('\nLo que NO saben va al buzón y vuelve\n');
recibido = [];
await p.evaluate(() => VETA.auraChip('recomendame una receta de tamales para el domingo'));
await p.waitForTimeout(700);
ok(await p.evaluate(() => !!document.querySelector('.aura-pensando')),
   'mientras espera se ven los tres puntos',
   'unos segundos sin señal es indistinguible de una app colgada');

await p.waitForFunction(
  f => (document.querySelector('#aura-hilo')?.textContent || '').includes(f),
  LA_FRASE, { timeout: 15000 }).catch(() => null);
ok((await hilo()).includes(LA_FRASE),
   'lo que no sabían las reglas lo contestó la AU-RA de verdad');
ok(recibido.length === 1 && recibido[0].texto.includes('tamales'),
   'y le llegó la pregunta tal cual, sin recortar');

console.log('\nLa sesión la reparte el NODO; el navegador solo la guarda\n');
ok(recibido[0].sesion === null || recibido[0].sesion === undefined,
   'la primera vez se pregunta sin sesión: no se inventa ninguna',
   'una sesión inventada desde el navegador sería el visitante eligiendo '
   + 'su propio nombre, que es lo que portal.py existe para impedir');
ok(await p.evaluate(() => localStorage.getItem('og.aura.sesion')) === LA_SESION,
   'y se guarda la que devolvió el nodo');

recibido = [];
await p.evaluate(() => VETA.auraChip('y de postre qué me recomendás'));
await p.waitForTimeout(2500);
ok(recibido[0]?.sesion === LA_SESION,
   'la segunda pregunta ya va con la sesión: la charla tiene hilo');

console.log('\nLos botones vienen del MISMO guión que WhatsApp\n');
ok((await hilo()).includes('Abrir mi billetera')
   || await p.evaluate(() => !!document.querySelector('#aura-hilo button')),
   'los botones del guión llegan a la burbuja',
   'si una puerta enseña opciones distintas, vuelve a haber dos AU-RA');

console.log('\nCON EL BUZÓN CAÍDO SE CONTESTA LO DE SIEMPRE\n');
caido = true;
const antes = await hilo();
await p.evaluate(() => VETA.auraChip('otra cosa rarísima que nadie tiene escrita'));
await p.waitForFunction(
  a => (document.querySelector('#aura-hilo')?.textContent || '').length > a,
  antes.length + 10, { timeout: 20000 }).catch(() => null);
const conCaida = (await hilo()).slice(antes.length);
ok(conCaida.trim().length > 20,
   'con el servicio caído sigue contestando',
   'una AU-RA que enmudece cuando se cae un servicio es peor que una que sabe menos');
ok(!/error|fetch|503|undefined|\[object/i.test(conCaida),
   'y no le enseña a la persona el fallo de dentro',
   conCaida.slice(0, 160));

await nav.close();
buzon.close(); api.close(); sv.close();
console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nLa visita habla con la AU-RA de verdad\n');
process.exit(fallos ? 1 : 0);
