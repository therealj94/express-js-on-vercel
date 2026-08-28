/* LA BURBUJA CONTINÚA LA CONVERSACIÓN, NO LA EMPIEZA.
 *
 * «el botón burbuja que está en todos lados que es pulse2chat con AURA».
 *
 * Para quien la usa, la burbuja y el chat son lo mismo — y tiene razón: es el
 * MISMO hilo, con la misma AU-RA, contra el mismo relevo. Lo único distinto
 * era que el panel no lo enseñaba: abría en blanco con su saludo, como si no
 * se hubieran visto nunca.
 *
 * El daño que menos se ve y más desconcierta: AU-RA SÍ se acuerda —su memoria
 * vive en el nodo— así que contesta refiriéndose a algo que en pantalla no
 * está. Parece que hablara sola.
 *
 * Acá se prueba contra el relevo DE VERDAD (infra/mensajes/servidor.py), no
 * contra un doble: lo que se está comprobando es justamente que el panel y el
 * hilo son la misma cosa, y con un relevo de mentira eso se cumple por
 * construcción y la prueba no diría nada.
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
         MENSAJES_DATOS: join(mkdtempSync(join(tmpdir(), 'burbuja-')), 'datos.json'),
         MENSAJES_PUERTO: String(P_RELEVO),
         HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1400));

/* `http.request` y no `fetch`: en esta máquina fetch sale por el proxy de red
   de la casa, que no sabe nada de un 127.0.0.1 con puerto al azar. */
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

/* El lazo, que el relevo exige antes de dejar escribir. */
await p.evaluate(() => CHAT.pedirAmistad('aura@ordenglobal.org'));
await post('/amistad/responder',
  { correo: 'aura@ordenglobal.org', llave: LLAVE_AURA, de: 'jose@ordenglobal.org', aceptar: true });

const burbujas = () => p.evaluate(() =>
  [...document.querySelectorAll('#aura-panel .aura-b')]
    .map((b) => ({ mio: b.classList.contains('mio'), txt: b.textContent.trim() })));

console.log('\nUna charla que ya existe aparece al abrir\n');
/* Se deja una conversación hecha EN EL HILO, sin pasar por el panel: es
   exactamente el caso de quien habló con AU-RA desde el chat y después toca
   la burbuja. */
await p.evaluate(() => CHAT.enviar('aura@ordenglobal.org', '¿Cuánto cuesta cobrar con el QR?'));
await post('/enviar', { correo: 'aura@ordenglobal.org', llave: LLAVE_AURA,
  para: 'jose@ordenglobal.org', texto: 'Un milésimo de ORIGEN por cobro, fijo.' });
await p.waitForTimeout(600);

await p.evaluate(() => VETA.auraToca());
await p.waitForTimeout(1800);
const b1 = await burbujas();
ok(b1.some((b) => b.mio && b.txt.includes('QR')),
   'lo que preguntó antes está ahí',
   `burbujas: ${JSON.stringify(b1.map((x) => x.txt.slice(0, 40)))}`);
ok(b1.some((b) => !b.mio && b.txt.includes('milésimo')),
   'y lo que AU-RA le contestó, también');
ok(!b1.some((b) => /soy AU-RA|Hola, soy/i.test(b.txt)) || b1.length > 2,
   'y no la saluda como si acabaran de conocerse',
   'un «hola, soy AU-RA» encima de una charla a medias sobra');

console.log('\nCerrar y volver a abrir no borra nada\n');
await p.evaluate(() => VETA.auraToca());
await p.waitForTimeout(400);
ok(!(await p.evaluate(() => document.querySelector('#aura-panel')?.classList.contains('ver'))),
   'la burbuja cierra');
await p.evaluate(() => VETA.auraToca());
await p.waitForTimeout(1800);
const b2 = await burbujas();
ok(b2.some((b) => b.txt.includes('QR')) && b2.some((b) => b.txt.includes('milésimo')),
   'al volver a abrir sigue estando la conversación',
   `burbujas: ${JSON.stringify(b2.map((x) => x.txt.slice(0, 40)))}`);

console.log('\nY lo que pasa POR FUERA del panel también llega\n');
/* Alguien le escribe a AU-RA desde el chat, o AU-RA contesta tarde: al
   reabrir la burbuja tiene que estar. Es la razón de refrescar en cada
   apertura y no una sola vez. */
await post('/enviar', { correo: 'aura@ordenglobal.org', llave: LLAVE_AURA,
  para: 'jose@ordenglobal.org', texto: 'Y el cobro te llega en segundos.' });
await p.evaluate(() => VETA.auraToca());          // cerrar
await p.waitForTimeout(300);
await p.evaluate(() => VETA.auraToca());          // abrir de nuevo
await p.waitForTimeout(1800);
const b3 = await burbujas();
ok(b3.some((b) => b.txt.includes('en segundos')),
   'lo que llegó mientras estaba cerrada aparece al abrir',
   `burbujas: ${JSON.stringify(b3.map((x) => x.txt.slice(0, 40)))}`);

await p.screenshot({ path: '/tmp/claude-0/-home-user-express-js-on-vercel/0391d4fe-0c9f-53b0-b60e-0030ebf74708/scratchpad/burbuja-sigue.png' });
await nav.close(); sv.close(); api.close();
try { relevo.kill(); } catch { /* ya no estaba */ }
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
