/* ¿LAS ESFERAS SE CRUZAN AL ORBITAR? — pedido de José del 27-sep: «giros
 * gravitacionales y que choquen las esferas entre sí para evitar que se crucen».
 *
 *   node pruebas/orbitas-choques.mjs
 *
 * Las casas orbitan con ritmo de Kepler y, al juntarse en pantalla, la de atrás
 * se aparta (ver LAS ÓRBITAS en augalaxy/src/sky/Wells.tsx). Se adelanta el
 * reloj de las órbitas por varias fases con __AE_ORBITA, se deja actuar a los
 * choques, y se mide sobre los discos proyectados (__AE_DISCOS):
 *
 *   · ningún par de esferas encimado más de 4 px contando su halo (antes del
 *     28-sep, en un teléfono de 412 px: 22);
 *   · ningún nombre visible montado sobre otro.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
let malas = 0;
const exigir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '  ' + extra : ''}`);
};

const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': T[extname(p)] || 'application/octet-stream' }); r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(0, ok));
const base = `http://127.0.0.1:${sv.address().port}`;

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

async function abrirInicio() {
  const p = await nav.newPage({ viewport: { width: 412, height: 915 }, locale: 'es-HN', hasTouch: true, isMobile: true });
  p.on('pageerror', (e) => console.log('  ERROR JS:', String(e).slice(0, 300)));
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.setItem('veta.sesion', JSON.stringify({
    token: 'x.' + btoa(JSON.stringify({ address: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2', exp: 2e9 })) + '.y',
    correo: 'jose@ordenglobal.org', nombre: 'José Enamorado',
    direccion: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2' })));
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.evaluate(() => { try { (0, eval)('VETA').vista('nucleo'); } catch {} });
  await p.waitForFunction(() => typeof window.__AE_MIRAR === 'function' && !window.__AE_PUERTA,
    null, { timeout: 60000 });
  await p.waitForTimeout(4000);
  return p;
}

const FASES = 6, SALTO = 41, ENCIMA_MAX = 4;
const p = await abrirInicio();
await p.evaluate(() => { window.__AE_SIN_CHOQUES = false; });
for (let f = 0; f < FASES; f++) {
  await p.evaluate((s) => window.__AE_ORBITA(s), SALTO);
  await p.waitForTimeout(9000);
  const r = await p.evaluate(() => {
    const D = window.__AE_DISCOS(); const k = Object.keys(D); let peor = { v: 1e9, par: '' };
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) {
      const a = D[k[i]], b = D[k[j]];
      // Con el HALO (1,2 radios): por la esfera sola no se tocaban y por el
      // vidrio de alrededor se encimaban hasta 22 px en un teléfono.
      const hueco = Math.hypot(a.x - b.x, a.y - b.y) - (a.r + b.r) * 1.2;
      if (hueco < peor.v) peor = { v: Math.round(hueco), par: k[i] + '/' + k[j] };
    }
    const vis = Object.entries(window.__AE_ROTULO_CAJA || {}).filter(([, c]) => c.op > 0.15);
    const montados = [];
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const [ka, a] = vis[i], [kb, b] = vis[j];
      if ((a.w + b.w) / 2 - Math.abs(a.x - b.x) > 0 && (a.h + b.h) / 2 - Math.abs(a.y - b.y) > 0) montados.push(ka + '/' + kb);
    }
    return { peor, montados, reloj: window.__AE_ORBITA().reloj };
  });
  exigir(r.peor.v >= -ENCIMA_MAX, `fase ${f} (reloj ${r.reloj.toFixed(0)} s): esferas sin encimarse`,
    `peor hueco ${r.peor.v} px (${r.peor.par})`);
  exigir(!r.montados.length, `fase ${f}: ningún nombre sobre otro`, r.montados.join(', '));
}
await p.close();
await nav.close();
sv.close();
console.log(malas ? `\n${malas} falla(s)` : '\nTodo en verde');
process.exit(malas ? 1 : 0);
