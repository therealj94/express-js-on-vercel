/* LO QUE AU-RA OFRECE, AU-RA LO CONTESTA.
 *
 * El panel de AU-RA sugiere preguntas en chips debajo del hilo. Un chip es una
 * promesa: la app está diciendo «preguntame esto». Si al pulsarlo contesta
 * «eso todavía no lo sé contestar desde acá», el daño es peor que no haber
 * ofrecido nada — quien llega por primera vez y no tiene cuenta acaba de
 * descubrir que la asistente no sabe lo que ella misma propuso.
 *
 * Pasaba con «¿Es seguro?», uno de los cuatro que se le ofrecen a quien
 * todavía no abrió cuenta. Ninguna regla del cerebro de visita lo enganchaba y
 * caía en el cajón de «no sé». De todas las preguntas que se pueden fallar
 * delante de alguien que está decidiendo si confiarte su dinero, esa es la
 * peor.
 *
 * Esta prueba pulsa TODOS los chips, uno por uno, en las dos situaciones —sin
 * cuenta y con cuenta— y mira que ninguno caiga en el cajón. No comprueba que
 * la respuesta sea buena, que eso no lo puede juzgar una máquina; comprueba
 * que la haya.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
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
await p.addInitScript((u) => { window.OG_API = u; }, API);
await p.goto(WEB);
await p.evaluate(() => localStorage.setItem('veta.bienvenida.v1', '1'));
await p.goto(WEB);
await p.waitForTimeout(2000);

/* El cajón de «no sé», tal cual está escrito en la tabla: se lee de la propia
   app y no se copia acá, para que cambiarlo no deje esta prueba mirando un
   texto que ya no existe. */
/* `_auraTxt()` devuelve la tabla ENTERA —{es, en}—, no la del idioma activo.
   Se miran los dos idiomas: la página se puede pintar en inglés según el
   navegador de quien corre esto, y una prueba que solo mira el español pasa
   en verde sin haber mirado nada. */
const cajones = await p.evaluate(() => {
  const T = VETA._auraTxt();
  return Object.values(T).flatMap((x) => [x.vNoSe, x.vSinCuenta].filter(Boolean));
});
const cae = (r, cuales) => cuales.some((c) => c && r.startsWith(c.slice(0, 40)));
const CAJON = await p.evaluate(() => Object.values(VETA._auraTxt()).map((x) => x.vNoSe));
const SIN_CUENTA = await p.evaluate(() => Object.values(VETA._auraTxt()).map((x) => x.vSinCuenta));

async function pulsar(chip) {
  await p.evaluate((c) => VETA.auraChip(c), chip);
  await p.waitForTimeout(500);
  return p.evaluate(() => {
    const bs = [...document.querySelectorAll('#aura-panel .aura-b')];
    return bs.length ? bs[bs.length - 1].textContent.trim() : '';
  });
}

console.log('\nSin cuenta: los cuatro chips que se le ofrecen a quien llega\n');
await p.evaluate(() => VETA.auraToca());
await p.waitForTimeout(500);
const chipsV = await p.evaluate(() =>
  [...document.querySelectorAll('#aura-panel .aura-chip')].map((c) => c.textContent.trim()));
ok(chipsV.length >= 3, 'hay chips que pulsar', `se vieron ${chipsV.length}`);
for (const c of chipsV) {
  if (/abrir mi cuenta|open my account/i.test(c)) continue;   // ese es una puerta, no una pregunta
  const r = await pulsar(c);
  ok(!!r && !cae(r, CAJON),
     `«${c}» tiene respuesta`,
     `contestó el cajón de «no sé»: ${r.slice(0, 110)}`);
}

console.log('\nCon cuenta: los chips del panel dentro de la sesión\n');
await p.evaluate(() => {
  const tk = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: tk, correo: 'jose@ordenglobal.org', nombre: 'José', direccion: '0xaaaa' }));
  localStorage.setItem('veta.aura.presentada.jose@ordenglobal.org', '1');
});
await p.goto(WEB);
await p.waitForTimeout(2200);
await p.evaluate(() => VETA.ir('app'));
await p.waitForTimeout(2200);
await p.evaluate(() => VETA.auraToca());
await p.waitForTimeout(600);
const chipsS = await p.evaluate(() =>
  [...document.querySelectorAll('#aura-panel .aura-chip')].map((c) => c.textContent.trim()));
ok(chipsS.length >= 3, 'hay chips dentro de la sesión', `se vieron ${chipsS.length}`);
for (const c of chipsS) {
  const r = await pulsar(c);
  const cajon = cae(r, CAJON);
  const sinCuenta = cae(r, SIN_CUENTA);
  ok(r && !cajon && !sinCuenta,
     `«${c}» tiene respuesta`,
     cajon ? `contestó el cajón de «no sé»: ${r.slice(0, 110)}`
           : sinCuenta ? `contestó «todavía no tenés cuenta» teniéndola: ${r.slice(0, 110)}`
           : 'no contestó nada');
}

await nav.close(); sv.close(); api.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
