/* Las velas de la ficha: el motor de Ordenex, los datos de la casa, y honesto.
 *
 *   node pruebas/velas-billetera.mjs
 *
 * El API de Ordenex se SIMULA con velas fijas, así que todo lo que la pantalla
 * enseñe tiene que salir de ahí. Se comprueba: que las velas se pinten (tinta
 * verde Y roja: velas que suben y bajan, no un rectángulo), que ORIGEN sea la
 * misma serie del oro dividida por 31,1035 y 55 (cada o/h/l/c), que el rótulo
 * de referencia se lea, que cambiar de marco pida ese marco al API, que la
 * vista ampliada abra un lienzo grande y cierre con Escape, que ONDK no lleve
 * gráfica, y que sin API haya aviso con reintentar, nunca velas de ejemplo.
 */
import { abrirNavegador } from '../../navegador.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const sv = createServer((q, r) => {
  const l = normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let f = join(RAIZ, l === '/' ? 'index.html' : l);
  if (!existsSync(f)) f = join(RAIZ, 'index.html');
  r.writeHead(200, { 'content-type': TIPOS[extname(f)] || 'application/octet-stream' });
  r.end(readFileSync(f));
});
await new Promise(r => sv.listen(0, r));
const BASE = `http://127.0.0.1:${sv.address().port}`;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

/* Velas de mentira: 90 de 4 horas, alternando subidas y bajadas para que haya
   tinta de los dos colores. */
const H4 = 4 * 3600e3;
const T0 = Date.UTC(2026, 7, 23) - 90 * H4;
const VELAS = Array.from({ length: 90 }, (_, i) => {
  const base = 4000 + 300 * Math.sin(i / 8);
  const sube = i % 3 !== 0;
  const o = base, c = sube ? base + 24 : base - 30;
  return [T0 + i * H4, o, Math.max(o, c) + 14, Math.min(o, c) - 14, c, null];
});

const pedidos = [];
const nav = await abrirNavegador();
const ctx = await nav.newContext({ viewport: { width: 1180, height: 940 }, deviceScaleFactor: 2, locale: 'es' });
const p = await ctx.newPage();
await p.route('**/mercados/*/referencia*', route => {
  pedidos.push(route.request().url());
  route.fulfill({ json: { activo: 'AUKA', unidad: 'USD',
    rotulo: 'Referencia: onza de oro en el mercado real. No son tratos de Ordenex.',
    fuente: 'coingecko · pax-gold', actualizadoEn: Date.now(), velas: VELAS } });
});
await p.route('**/api.coingecko.com/**', rt => rt.fulfill({ json: {} }));
await p.route('**/herokuapp.com/precio-declarado/**', rt => rt.fulfill({ json: {} }));
await p.route('**/herokuapp.com/**', rt => rt.fulfill({ status: 503, json: {} }));

await p.goto(`${BASE}/`);
await p.evaluate(() => {
  const pl = btoa(JSON.stringify({ userId: 'x', address: '0xabc', exp: Math.floor(Date.now() / 1000) + 3600 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  localStorage.setItem('veta.sesion', JSON.stringify({ token: `e.${pl}.f`, refresco: null,
    correo: 'x@y.com', nombre: 'Prueba', direccion: '0xabc' }));
});
await p.reload();
await p.waitForTimeout(1400);
await p.evaluate(() => { VETA.auraBienFin?.(); });

console.log('\n── AUKA: velas de verdad, de los dos colores ─────────────────');
await p.evaluate(() => VETA.vista('token', 'AUKA'));
await p.waitForSelector('.vls-lienzo', { timeout: 15000 });
await p.waitForTimeout(700);
{
  const tinta = await p.evaluate(() => {
    const cv = document.querySelector('.vls-lienzo');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let verde = 0, rojo = 0;
    for (let i = 0; i < d.length; i += 16) {
      const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (a > 60 && g > r + 30 && g > b + 10) verde++;
      if (a > 60 && r > g + 30 && r > b + 10) rojo++;
    }
    return { verde, rojo };
  });
  comprobar(tinta.verde > 50 && tinta.rojo > 50,
    'hay velas que suben y velas que bajan, pintadas', JSON.stringify(tinta));

  const rot = await p.evaluate(() => document.querySelector('#grf-rotulo')?.textContent || '');
  comprobar(/Referencia: onza de oro/.test(rot) && /No son tratos/.test(rot),
    'el rótulo de honestidad se lee bajo la gráfica', rot.slice(0, 70));

  const v = await p.evaluate(() => document.querySelector('#grf-var')?.textContent || '');
  const esperada = (VELAS[VELAS.length - 1][4] - VELAS[0][1]) / VELAS[0][1] * 100;
  comprobar(Math.abs(parseFloat(v) - esperada) < 0.06,
    'la variación sale de la serie', `pantalla ${v} · serie ${esperada.toFixed(2)}%`);

  pedidos.length = 0;
  await p.evaluate(() => VETA.velasCambiar('4d'));
  await p.waitForTimeout(600);
  comprobar(pedidos.some(u => /marco=4d/.test(u)), 'cambiar de marco pide ese marco al API',
    pedidos.join(' '));
}

console.log('\n── ORIGEN: la misma onza, dividida ───────────────────────────');
{
  const r = await p.evaluate(() => CADENA.velasDe('ORIGEN', '4h'));
  const ok = r && r.velas.length === VELAS.length && r.velas.every((v, i) =>
    [1, 2, 3, 4].every(k => Math.abs(v[k] - VELAS[i][k] / 31.1035 / 55) < 1e-9));
  comprobar(Boolean(ok), 'cada o/h/l/c de ORIGEN es exactamente onza ÷ 31,1035 ÷ 55');
  comprobar(/fórmula del ORIGEN/.test(r?.rotulo || ''), 'y su rótulo dice la fórmula', r?.rotulo);
}

console.log('\n── la vista ampliada ─────────────────────────────────────────');
await p.evaluate(() => VETA.vista('token', 'AUKA'));
await p.waitForSelector('.vls-lienzo', { timeout: 15000 });
{
  await p.evaluate(() => VETA.velasAmpliar());
  await p.waitForTimeout(700);
  const grande = await p.evaluate(() => {
    const c = document.querySelector('.vls-capa .vls-lienzo');
    return c ? { w: c.clientWidth, h: c.clientHeight } : null;
  });
  comprobar(Boolean(grande) && grande.h > 400, 'se abre con un lienzo grande de verdad',
    JSON.stringify(grande));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(250);
  comprobar(await p.evaluate(() => !document.querySelector('.vls-capa')), 'y Escape la cierra');
}

console.log('\n── ONDK y el mundo sin API ───────────────────────────────────');
{
  await p.evaluate(() => VETA.vista('token', 'ONDK'));
  await p.waitForTimeout(500);
  comprobar(await p.evaluate(() => !document.querySelector('.grf-marco')),
    'una moneda declarada por acta no lleva velas');

  await p.unroute('**/mercados/*/referencia*');
  await p.route('**/mercados/*/referencia*', rt => rt.abort());
  await p.evaluate(() => sessionStorage.clear());
  await p.evaluate(() => VETA.vista('token', 'AGKA'));
  await p.waitForTimeout(1200);
  const espera = await p.evaluate(() => document.querySelector('.grf-espera')?.textContent || '');
  comprobar(/No pude traer/.test(espera), 'sin API hay aviso y reintentar, no velas de ejemplo', espera.trim().slice(0, 60));
}

await p.screenshot({ path: '/tmp/velas-ficha.png' });
await nav.close(); sv.close();
if (fallos) { console.log(`\n${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('\nTodo en verde');
