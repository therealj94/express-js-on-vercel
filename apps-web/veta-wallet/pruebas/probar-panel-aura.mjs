/* EL PANEL DE AU-RA: CUATRO COSAS QUE ROMPÍAN.
 *
 * Todas salieron de leer el código con lupa y todas se sufren en la mano, no
 * en la teoría:
 *
 *   1. LA RESPUESTA DE LA CUENTA ANTERIOR. El bucle que espera al modelo no
 *      lo cancelaba nadie. Preguntabas, tocabas Salir sin esperar, y entre uno
 *      y cuarenta y cinco segundos después la respuesta aparecía escrita — en
 *      la pantalla de acceso, o en la sesión de la siguiente persona que
 *      entrara en ese teléfono.
 *
 *   2. EL BORRADOR BORRADO. `innerHTML` rehace el panel entero y la caja de
 *      texto nace vacía. Escribías la siguiente pregunta mientras esperabas y
 *      al llegar la respuesta se te vaciaba de golpe (y en el teléfono se
 *      cerraba el teclado, porque el elemento con el foco dejaba de existir).
 *
 *   3. LA SEGUNDA PREGUNTA TRAGADA. Con una en vuelo, la siguiente caía en un
 *      `return` mudo: quedaba escrita en el hilo, sin respuesta y sin aviso,
 *      para siempre.
 *
 *   4. EL PANEL EN LA ESQUINA CONTRARIA. La burbuja se arrastra y recuerda
 *      dónde la dejaste; el panel estaba clavado abajo a la derecha por CSS.
 *      Quien la corría a la izquierda la tocaba y el panel abría en la otra
 *      punta.
 *
 * Se prueba contra el relevo DE VERDAD, sin asistente detrás: así el bucle de
 * espera queda abierto y se puede meter la respuesta en el momento exacto en
 * que hace falta para cada caso.
 */
import { chromium } from 'playwright';
import { createServer, request as httpPeticion } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const puertoLibre = () => new Promise((ok) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); });
});

const P_RELEVO = await puertoLibre();
const relevo = spawn('python3', [join(RAIZ, '../../infra/mensajes/servidor.py')], {
  env: { ...process.env,
         MENSAJES_DATOS: join(mkdtempSync(join(tmpdir(), 'panel-')), 'datos.json'),
         MENSAJES_PUERTO: String(P_RELEVO),
         HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1400));

const post = (ruta, cuerpo) => new Promise((ok) => {
  const d = Buffer.from(JSON.stringify(cuerpo));
  const q = httpPeticion({ host: '127.0.0.1', port: P_RELEVO, path: ruta, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': d.length } }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => { try { ok(JSON.parse(b)); } catch { ok({}); } });
    });
  q.on('error', () => ok({}));
  q.end(d);
});

const alta = await post('/alta', { correo: 'aura@ordenglobal.org', nombre: 'AU-RA' });
const LLAVE_AURA = alta.llave;
const contestar = (texto) => post('/enviar', { correo: 'aura@ordenglobal.org',
  llave: LLAVE_AURA, para: 'jose@ordenglobal.org', texto });

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
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

let fallos = 0;
const ok = (c, q, d = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${d && !c ? '\n           ' + d : ''}`);
  if (!c) fallos++;
};

const p = await nav.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true });
await p.addInitScript(({ u, m }) => { window.OG_API = u; window.OG_MENSAJES_API = m; },
  { u: API, m: `http://127.0.0.1:${P_RELEVO}` });
await p.goto(WEB);
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  localStorage.setItem('veta.aura.presentada.jose@ordenglobal.org', '1');
  const tk = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: tk, correo: 'jose@ordenglobal.org', nombre: 'José', direccion: '0xaaaa' }));
});
await p.goto(WEB);
await p.waitForTimeout(2200);
await p.evaluate(() => VETA.ir('app'));
await p.waitForTimeout(2500);
await p.evaluate(() => CHAT.pedirAmistad('aura@ordenglobal.org'));
await post('/amistad/responder',
  { correo: 'aura@ordenglobal.org', llave: LLAVE_AURA, de: 'jose@ordenglobal.org', aceptar: true });

/* Sin `.aura-pensando`: los tres puntitos son un `.aura-b` más en el DOM y
   se colaban como si fueran una respuesta — «la última burbuja fue Thinking…».
   Lo que se cuenta acá son cosas dichas, no el indicador de que se está
   pensando. */
const hilo = () => p.evaluate(() =>
  [...document.querySelectorAll('#aura-panel .aura-b:not(.aura-pensando)')]
    .map((b) => b.textContent.trim()));
const pensando = () => p.evaluate(() => !!document.querySelector('#aura-panel .aura-pensando'));
/* Una frase que ninguna regla del cerebro local resuelve: así llega al camino
   del modelo, que es el que se está probando. */
const AL_MODELO = 'contame algo de la lluvia en abril por favor';

console.log('\nLo que estabas escribiendo no se borra al llegar la respuesta\n');
await p.evaluate(() => VETA.auraToca());
await p.waitForTimeout(1400);
await p.evaluate((q) => VETA.auraChip(q), AL_MODELO);
await p.waitForTimeout(700);
ok(await pensando(), 'la pregunta salió y está esperando');
await p.evaluate(() => {
  const c = document.querySelector('#aura-in');
  c.focus(); c.value = 'esta es la siguiente que iba a mandar';
});
await contestar('En abril llueve seguido, pero pasa rápido.');
await p.waitForTimeout(3200);
const borrador = await p.evaluate(() => document.querySelector('#aura-in')?.value || '');
ok(borrador === 'esta es la siguiente que iba a mandar',
   'el borrador sigue en la caja después de repintar',
   `la caja quedó con: «${borrador}»`);
ok((await hilo()).some((b) => b.includes('abril llueve')),
   'y la respuesta llegó igual');

console.log('\nLa segunda pregunta no se traga en silencio\n');
await p.evaluate((q) => VETA.auraChip(q), AL_MODELO + ' otra vez');
await p.waitForTimeout(600);
const antes = (await hilo()).length;
await p.evaluate((q) => VETA.auraChip(q), 'y esta es la segunda mientras espera');
await p.waitForTimeout(900);
const despues = await hilo();
ok(despues.length > antes + 1,
   'la segunda recibe una contestación, no silencio',
   `el hilo pasó de ${antes} a ${despues.length} burbujas: ${JSON.stringify(despues.slice(-3))}`);
ok(/una a la vez|one at a time/i.test(despues[despues.length - 1] || ''),
   'y esa contestación dice lo que pasa',
   `la última burbuja fue: «${despues[despues.length - 1]}»`);
await contestar('Ya te contesto lo otro.');
await p.waitForTimeout(2600);

console.log('\nAl salir de la sesión, lo que quedó esperando se calla\n');
await p.evaluate((q) => VETA.auraChip(q), 'contame otra cosa distinta del clima');
await p.waitForTimeout(700);
ok(await pensando(), 'hay una pregunta en vuelo');
await p.evaluate(() => VETA.ir('acceso'));    // salir sin esperar
await p.waitForTimeout(400);
await contestar('SECRETO-DE-LA-CUENTA-ANTERIOR');
await p.waitForTimeout(4000);
const tras = await p.evaluate(() => document.body.textContent || '');
ok(!tras.includes('SECRETO-DE-LA-CUENTA-ANTERIOR'),
   'la respuesta NO aparece después de salir',
   'la contestación de una cuenta escrita en la pantalla de otra');

console.log('\nEl panel se abre del lado en que dejaste la burbuja\n');
await p.evaluate(() => VETA.ir('app'));
await p.waitForTimeout(2500);
const caja = () => p.evaluate(() => {
  const o = document.querySelector('#aura-orbe').getBoundingClientRect();
  return { x: o.left, y: o.top, w: o.width, h: o.height };
});
const c0 = await caja();
await p.mouse.move(c0.x + c0.w / 2, c0.y + c0.h / 2);
await p.mouse.down();
await p.mouse.move(20, 300, { steps: 12 });
await p.mouse.up();
await p.waitForTimeout(600);
const cIzq = await caja();
ok(cIzq.x < 120, 'la burbuja quedó a la izquierda', `x=${Math.round(cIzq.x)}`);
await p.evaluate(() => VETA.auraToca());
await p.waitForTimeout(900);
const pos = await p.evaluate(() => {
  const r = document.querySelector('#aura-panel').getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});
const orbe = await caja();
ok(Math.abs(pos.x - orbe.x) < Math.abs(pos.x + pos.w - (orbe.x + orbe.w)) + 40,
   'el panel abre del mismo lado que la burbuja',
   `panel en x=${Math.round(pos.x)}..${Math.round(pos.x + pos.w)}, `
   + `burbuja en x=${Math.round(orbe.x)}`);
ok(pos.x >= 0 && pos.y >= 0 && pos.x + pos.w <= 391 && pos.y + pos.h <= 845,
   'y entero dentro de la pantalla',
   `panel en ${Math.round(pos.x)},${Math.round(pos.y)} de ${Math.round(pos.w)}x${Math.round(pos.h)}`);

await p.screenshot({ path: '/tmp/claude-0/-home-user-express-js-on-vercel/0391d4fe-0c9f-53b0-b60e-0030ebf74708/scratchpad/panel-aura.png' });
await nav.close(); sv.close(); api.close();
try { relevo.kill(); } catch { /* ya no estaba */ }
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
