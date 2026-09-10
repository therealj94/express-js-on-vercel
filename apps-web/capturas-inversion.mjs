/* Las capturas del documento para inversionistas.
 *
 *   node apps-web/capturas-inversion.mjs
 *
 * Se fotografía el producto REAL, servido desde los mismos archivos que están
 * en producción, con una sesión sembrada y datos de muestra evidentes. Nada de
 * maquetas: lo que sale en el PDF es lo que hay.
 *
 * NO se fotografía Genesis Core. El cerebro interno enseña infraestructura,
 * pendientes y estado de los sistemas; eso se explica con palabras en el
 * documento, pero no se enseña. Una captura de un panel interno en un PDF que
 * va a circular es la forma más fácil de regalar el mapa de la casa.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, 'veta-wallet');
const SALIDA = join(AQUI, '..', 'documentos', 'capturas');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
                '.woff2': 'font/woff2', '.woff': 'font/woff' };

await mkdir(SALIDA, { recursive: true });

// ── un backend de muestra: saldos y actividad evidentes, nada de otra persona ─
const api = createServer((q, r) => {
  const ok = (c, b) => {
    r.writeHead(c, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
                     'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
    r.end(JSON.stringify(b));
  };
  if (q.method === 'OPTIONS') return ok(204, {});
  const ruta = q.url.split('?')[0];
  if (ruta === '/genesis/estado') return ok(200, { identidad: {
    id: 'i1', email: 'maria@ordenglobal.org', estado: 'verificada', gid: 'OG-7K2M-84',
    nombreLegal: 'María Fernanda Cruz', faltanDatos: [], fotoCredencial: null } });
  if (ruta === '/wallet/deposits') return ok(200, [
    { id: 'd1', origenAmount: 120, at: '2026-08-14T10:00:00Z' },
    { id: 'd2', origenAmount: 45.5, at: '2026-08-12T16:20:00Z' },
  ]);
  if (ruta === '/cards/my-card') return ok(200, { last4: '4821', status: 'ACTIVE', balance: 320 });
  if (ruta === '/cards/transactions') return ok(200, [
    { merchant: 'Café Colonial', amount: 4.2, createdAt: '2026-08-15T09:10:00Z' },
    { merchant: 'Mercadito Surf', amount: 18.9, createdAt: '2026-08-14T18:40:00Z' },
  ]);
  return ok(200, {});
});
await new Promise((r) => api.listen(0, r));
const API = `http://127.0.0.1:${api.address().port}`;

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((r) => sv.listen(0, r));
const BASE = `http://127.0.0.1:${sv.address().port}/index.html`;

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function sesion(p) {
  await p.addInitScript((u) => { window.OG_API = u; }, API);
  await p.goto(BASE);
  await p.evaluate(() => {
    localStorage.setItem('veta.bienvenida.v1', '1');
    localStorage.setItem('veta.aura.presentada.maria@ordenglobal.org', '1');
    const tok = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
    localStorage.setItem('veta.sesion', JSON.stringify({
      token: tok, correo: 'maria@ordenglobal.org', nombre: 'María Fernanda', direccion: '0xaaaa' }));
  });
  await p.goto(BASE);
  await p.waitForTimeout(1600);
  await p.evaluate(() => VETA.idioma('es'));
  await p.evaluate(() => VETA._sembrar([
    { s: 'ORIGEN', n: 'Origen', cant: 1240.5, precio: 2.56, nativo: true },
    { s: 'AUKA', n: 'Auka', cant: 3.2, precio: 4377.6 },
    { s: 'ONDK', n: 'Ondak', cant: 850, precio: 1.5 },
  ]));
  return p;
}

const tomar = async (nombre, ancho, alto, preparar, espera = 1400) => {
  const p = await nav.newPage({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2 });
  await sesion(p);
  await preparar(p);
  await p.waitForTimeout(espera);
  await p.screenshot({ path: join(SALIDA, nombre + '.png') });
  await p.close();
  console.log('  ' + nombre);
};

console.log('capturando el producto real…');

// El Núcleo: la portada del ecosistema
await tomar('nucleo', 1440, 900, async (p) => {
  await p.evaluate(() => VETA.vista('nucleo'));
  await p.mouse.move(900, 380);
}, 2200);

// La billetera con saldo
await tomar('billetera', 430, 860, async (p) => p.evaluate(() => VETA.vista('billetera')));

// La credencial de Genesis ID
await tomar('credencial', 900, 620, async (p) => p.evaluate(() => VETA.vista('identidad')));

// PULSE CHAT
await tomar('chat', 430, 860, async (p) => p.evaluate(() => VETA.vista('chat')));

// MyTokenPay: el directorio de comercios
await tomar('pay', 1000, 760, async (p) => p.evaluate(() => VETA.vista('payex')));

// AU-RA con su panel abierto
await tomar('aura', 1000, 760, async (p) => {
  await p.evaluate(() => VETA.vista('nucleo'));
  await p.waitForTimeout(600);
  await p.evaluate(() => { if (!document.getElementById('aura-panel').classList.contains('ver')) VETA.auraToca(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => VETA.auraChip('que es origen'));
}, 1600);

// La portada pública, tal como la ve alguien que llega
{
  const p = await nav.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(BASE);
  await p.waitForTimeout(1500);
  await p.evaluate(() => VETA.idioma('es'));
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(SALIDA, 'portada.png') });
  await p.evaluate(() => document.getElementById('cadena')?.scrollIntoView({ block: 'start' }));
  await p.waitForTimeout(1800);
  await p.screenshot({ path: join(SALIDA, 'cadena.png') });
  await p.close();
  console.log('  portada · cadena');
}

await nav.close(); sv.close(); api.close();
console.log('listo · ' + SALIDA);
