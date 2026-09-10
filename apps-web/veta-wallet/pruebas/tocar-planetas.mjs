/* ¿SE PUEDEN TOCAR LOS PLANETAS? — la prueba de la queja de José.
 *
 *   node pruebas/tocar-planetas.mjs            (teléfono, 390×844)
 *   node pruebas/tocar-planetas.mjs 1440 900   (monitor)
 *
 * 6-sep-2026, textual: «los planetas están muy pegados, a veces no se puede
 * tocar porque se pegan mucho». Una captura no sirve para juzgar eso —dos
 * esferas separadas en la foto pueden tener el blanco de toque encimado, y una
 * que se ve entera puede estar detrás de otra— así que aquí se mide.
 *
 * LOS POZOS NO SON ELEMENTOS DEL DOM: son objetos 3D y no hay caja que medir.
 * Pero Aetherion publica `__AE_MIRAR(x, y)` —el mismo rayo que usa el dedo— así
 * que se barre la pantalla punto por punto y se cuenta cuántos píxeles contesta
 * cada casa. Eso ES el blanco de toque, no una aproximación.
 *
 * Y se comprueban tres cosas, cada una porque falló de verdad:
 *
 *   1. QUE CADA CASA SE PUEDA TOCAR. La yema de un dedo son unos 44 px. Antes
 *      del arreglo, MINAS tenía 41.
 *   2. QUE EL DEDO LAS DISTINGA. Tres pares estaban a menos de 60 px entre
 *      centros — pay↔minas a 45— y con eso no hay pulso que acierte.
 *   3. QUE NINGUNA QUEDE DETRÁS DE OTRA. Esto casi se escapa: el primer
 *      arreglo separó los centros y metió ORDENSCAN detrás de Veta Wallet en
 *      monitor; su blanco cayó de 127 px a 31 con los centros a 133 px de
 *      distancia. Separar no es lo mismo que dejar ver.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { fileURLToPath } from 'node:url';
import { dirname, join as unir } from 'node:path';
const RAIZ = unir(dirname(fileURLToPath(import.meta.url)), '..');
const ANCHO = Number(process.argv[2] || 390);
const ALTO = Number(process.argv[3] || 844);
const FOTO = process.argv[4] || '';
const PASO = 4;                       // rejilla de barrido, en píxeles CSS
const DEDO = 44;      // el blanco mínimo recomendado, en px
const APARTE = 60;    // lo que tienen que distar dos centros para que el dedo elija
let malas = 0;
const exigir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '\n           ' + extra : ''}`);
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
const p = await nav.newPage({ viewport: { width: ANCHO, height: ALTO }, locale: 'es-HN', hasTouch: true });
p.on('pageerror', (e) => console.log('  ERROR JS:', String(e).slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error') console.log('  CONSOLA:', m.text().slice(0, 300)); });

await p.goto(base, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => localStorage.setItem('veta.sesion', JSON.stringify({
  token: 'x.' + btoa(JSON.stringify({ address: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2', exp: 2e9 })) + '.y',
  correo: 'jose@ordenglobal.org', nombre: 'José Enamorado',
  direccion: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2' })));
await p.goto(base, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
await p.evaluate(() => { try { (0, eval)('VETA').vista('nucleo'); } catch {} });
await p.waitForFunction(() => typeof window.__AE_MIRAR === 'function' && !window.__AE_PUERTA,
  null, { timeout: 40000 }).catch(() => console.log('  AVISO: no se llegó al cielo 3D'));
await p.waitForTimeout(2500);
/* La burbuja de AU-RA se abre sola y tapa justo lo que se viene a medir. Se
   cierra por su propia × —el mismo camino que la persona— y se comprueba que
   de verdad se fue: cerrar «a ciegas» dejaba una foto con el panel puesto y
   una medición que parecía buena. */
for (let i = 0; i < 6; i++) {
  const abierta = await p.evaluate(() => !!document.querySelector('#aura-panel.ver'));
  if (!abierta) break;
  await p.click('#aura-panel .aura-x', { timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(500);
}
await p.waitForTimeout(1200);
if (await p.evaluate(() => !!document.querySelector('#aura-panel.ver'))) console.log('  AVISO: el panel de AU-RA sigue abierto');
/* Y el cartel de bienvenida —«Este es tu Núcleo…»— se planta encima del
   centro la primera vez. Se cierra por su aspa, como lo haría cualquiera. */
console.log('  encima del cielo:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('body *')]
  .filter((e) => { const r = e.getBoundingClientRect();
    return r.width > 140 && r.height > 90 && r.top < innerHeight * 0.75 && r.bottom > innerHeight * 0.25
      && getComputedStyle(e).visibility !== 'hidden' && e.offsetParent !== null
      && /Núcleo|cerebro donde vive/.test(e.textContent || ''); })
  .map((e) => `${e.tagName.toLowerCase()}.${e.className || '·'}#${e.id || '·'}`).slice(0, 6))));
for (let i = 0; i < 5; i++) {
  const n = await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].filter((x) => {
      const r = x.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && /^(✕|×|✖|x|X)$/.test((x.textContent || '').trim());
    });
    b.forEach((x) => x.click());
    return b.length;
  });
  if (!n) break;
  await p.waitForTimeout(400);
}
await p.waitForTimeout(900);

const r = await p.evaluate(({ PASO }) => {
  const mapa = {};
  for (let y = 0; y < innerHeight; y += PASO) {
    for (let x = 0; x < innerWidth; x += PASO) {
      let c = null;
      try { c = window.__AE_MIRAR(x, y); } catch {}
      if (!c || !c.key) continue;
      const m = mapa[c.key] || (mapa[c.key] = { n: 0, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, sx: 0, sy: 0 });
      m.n++; m.sx += x; m.sy += y;
      m.x0 = Math.min(m.x0, x); m.y0 = Math.min(m.y0, y);
      m.x1 = Math.max(m.x1, x); m.y1 = Math.max(m.y1, y);
    }
  }
  return { mapa, w: innerWidth, h: innerHeight };
}, { PASO });

const area = PASO * PASO;
const casas = Object.entries(r.mapa).map(([k, m]) => ({
  key: k, px: m.n * area,
  cx: Math.round(m.sx / m.n), cy: Math.round(m.sy / m.n),
  ancho: m.x1 - m.x0 + PASO, alto: m.y1 - m.y0 + PASO,
  // el lado del cuadrado equivalente: con qué dedo se acierta
  lado: Math.round(Math.sqrt(m.n * area)),
})).sort((a, b) => a.px - b.px);

console.log(`\n── blanco de toque a ${r.w}×${r.h} ──────────────────────────`);
console.log('  casa        px tocables   lado equiv.   caja      centro');
for (const c of casas) {
  const mal = c.lado < DEDO ? '  ← por debajo de 44 px' : '';
  console.log(`  ${c.key.padEnd(10)} ${String(c.px).padStart(8)}   ${String(c.lado).padStart(6)} px   ${String(c.ancho).padStart(3)}×${String(c.alto).padEnd(3)}  (${c.cx},${c.cy})${mal}`);
}

console.log(`\n── qué tan cerca están entre sí ────────────────────────────`);
const pares = [];
for (let i = 0; i < casas.length; i++) {
  for (let j = i + 1; j < casas.length; j++) {
    const a = casas[i], b = casas[j];
    pares.push({ a: a.key, b: b.key, d: Math.round(Math.hypot(a.cx - b.cx, a.cy - b.cy)) });
  }
}
pares.sort((x, y) => x.d - y.d);
for (const q of pares.slice(0, 8)) {
  console.log(`  ${q.a.padEnd(10)} ↔ ${q.b.padEnd(10)} ${String(q.d).padStart(4)} px${q.d < 60 ? '  ← el dedo no las distingue' : ''}`);
}
console.log('');
exigir(casas.length === 11, `las once casas se pueden tocar (${casas.length})`,
  casas.length === 11 ? '' : 'falta alguna: o no se dibujó, o está entera detrás de otra');
const chicas = casas.filter((c) => c.lado < DEDO);
exigir(chicas.length === 0, `ninguna por debajo de ${DEDO} px de blanco`,
  chicas.map((c) => `${c.key} ${c.lado} px`).join(' · '));
const juntos = pares.filter((q) => q.d < APARTE);
exigir(juntos.length === 0, `ningún par a menos de ${APARTE} px entre centros`,
  juntos.map((q) => `${q.a}↔${q.b} ${q.d} px`).join(' · '));

/* ── LOS RÓTULOS ────────────────────────────────────────────────────────────
   Se leen de __AE_ROTULO_CAJA, que publica la caja de cada nombre en píxeles.
   Un nombre estorba de tres maneras y las tres se miden: montado sobre otro
   nombre, montado sobre un planeta que no es el suyo, o cortado por el borde.
   Solo cuentan los que de verdad se ven: por debajo de 0,15 de opacidad un
   rótulo no molesta a nadie. */
const rot = await p.evaluate(() => ({ ...(window.__AE_ROTULO_CAJA || {}) }));
const dis = await p.evaluate(() => ({ ...(window.__AE_ROTULO_D || {}) }));
console.log('  distancia de cada casa a la cámara:',
  Object.entries(dis).sort((a,b)=>a[1]-b[1]).map(([k,v])=>k+'='+v.toFixed(1)).join(' '));
const vis = Object.entries(rot).filter(([, c]) => c.op > 0.15)
  .map(([k, c]) => ({ key: k, ...c, x0: c.x - c.w / 2, x1: c.x + c.w / 2, y0: c.y - c.h / 2, y1: c.y + c.h / 2 }));
console.log(`\n── los nombres (${vis.length} de ${Object.keys(rot).length} visibles) ─────────────────`);
const solapa = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
                       * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
let choques = 0;
for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
  const s = solapa(vis[i], vis[j]);
  if (s > 0) { choques++; console.log(`  MONTADOS  ${vis[i].key} sobre ${vis[j].key}: ${Math.round(s)} px²`); }
}
let sobrePlaneta = 0;
for (const r of vis) for (const c of casas) {
  if (c.key === r.key) continue;
  const caja = { x0: c.cx - c.ancho / 2, x1: c.cx + c.ancho / 2, y0: c.cy - c.alto / 2, y1: c.cy + c.alto / 2 };
  const s = solapa(r, caja);
  if (s > 120) { sobrePlaneta++; console.log(`  SOBRE UN PLANETA  «${r.key}» encima de ${c.key}: ${Math.round(s)} px²`); }
}
let cortados = 0;
for (const r of vis) if (r.x0 < 0 || r.x1 > r.x + 1e9 || r.x1 > (await p.evaluate(() => innerWidth))) {
  cortados++; console.log(`  CORTADO   ${r.key}: de ${Math.round(r.x0)} a ${Math.round(r.x1)} px`);
}
exigir(choques === 0, 'ningún nombre montado sobre otro nombre');
exigir(cortados === 0, 'ningún nombre cortado por el borde de la pantalla');
/* Que un nombre roce el planeta de al lado se tolera —son sprites anchos y a
   media luz ni se nota—; lo que no se tolera es que se lean como uno solo. */
console.log(`  (${sobrePlaneta} nombres rozan un planeta ajeno; se tolera)`);

if (FOTO) { await p.screenshot({ path: FOTO }); console.log(`  foto: ${FOTO}`); }
await nav.close(); sv.close();
console.log(malas ? `\n${malas} fallo(s).\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
