/* La gráfica del precio declarado por la Junta.
 *
 *   node apps-web/ordenex/pruebas/probar-declarado.mjs
 *
 * Esta gráfica existe para que ONDK tenga precio visible SIN inventarle uno, y
 * lo que se castiga aquí son las cuatro maneras de romper eso:
 *
 *  1. Una resolución sin acta no se dibuja. La validación del API se repite en
 *     el dibujo porque esta pieza también se come lo que le dé un `fetch`.
 *  2. El precio es PLANO entre dos actas. Si algún día un cambio le mete
 *     suavizado o interpolación, la línea empezaría a decir precios en fechas
 *     en las que la Junta no declaró nada.
 *  3. El rótulo accesible dice que NO es precio de mercado. La misma frase que
 *     ve quien mira, para quien no puede mirar.
 *  4. Sin resoluciones se dibuja el marco y se dice que no hay: ni un punto de
 *     relleno, ni una línea en cero.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((r) => sv.listen(0, r));
const BASE = `http://127.0.0.1:${sv.address().port}`;

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 140)}`);
};

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1100, height: 700 } });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
await p.goto(BASE + '/index.html');
await p.waitForTimeout(1200);

await p.evaluate(() => {
  const c = document.createElement('canvas');
  c.style.width = '900px'; c.style.height = '360px';
  c.id = 'lienzoDecl';
  document.body.appendChild(c);
  // Cuatro resoluciones a lo largo de dos años. Es exactamente la forma que
  // tiene el dato real: pocos puntos, muy separados, con un salto en cada uno.
  window.__actas = [
    { fecha: '2024-07-01T00:00:00.000Z', precio: 1.00, acta: 'JD-2024-11', firmante: 'Secretario de la Junta' },
    { fecha: '2025-03-01T00:00:00.000Z', precio: 1.60, acta: 'JD-2025-04', firmante: 'Secretario de la Junta' },
    { fecha: '2026-01-15T00:00:00.000Z', precio: 2.05, acta: 'JD-2026-03', firmante: 'Secretario de la Junta' },
  ];
  window.__ahora = Date.parse('2026-08-16T12:00:00.000Z');
});

const pintar = (serie = '__actas', opts = {}) => p.evaluate(([s, o]) =>
  VELAS.escalones(document.getElementById('lienzoDecl'), window[s],
    { par: 'ONDK', moneda: 'USD', ahora: window.__ahora, ...o }),
[serie, opts]);

console.log('\n── la serie de actas se dibuja ───────────────────────────────');
{
  const r = await pintar();
  decir(r.vacio === null && r.n === 3, 'se dibujan las tres resoluciones', `n=${r.n}`);
  decir(r.declarado === true, 'y el informe se declara declarado', `declarado=${r.declarado}`);
  decir(r.leyenda.vigente.precio === 2.05 && r.leyenda.vigente.acta === 'JD-2026-03',
    'la vigente es la última: 2.05 del acta JD-2026-03',
    `${r.leyenda.vigente.precio} · ${r.leyenda.vigente.acta}`);
}

console.log('\n── EL PRECIO NO SE MUEVE ENTRE DOS ACTAS ─────────────────────');
{
  // El cursor recorre todo abril de 2025 —entre la segunda y la tercera
  // resolución— y tiene que leer SIEMPRE 1.60. Si algún día alguien le mete
  // suavizado o ruido a esta línea, esto es lo que se cae.
  const ancho = await p.evaluate(() => document.getElementById('lienzoDecl').clientWidth);
  const leidos = new Set();
  for (const x of [0.3, 0.35, 0.4, 0.45, 0.5]) {
    const r = await pintar('__actas', { cursor: { x: Math.round(ancho * x), y: 100 } });
    leidos.add(r.leyenda.precio);
  }
  const lista = [...leidos];
  decir(lista.length <= 3, 'recorriendo la gráfica solo salen precios de actas, no valores intermedios',
    lista.join(' · '));
  for (const v of lista) {
    decir([1, 1.6, 2.05].includes(v), `${v} es un precio que la Junta firmó de verdad`);
  }

  // Y la cruz se posa en la que REGÍA ese día, no en la más cercana.
  const r = await pintar('__actas', { cursor: { x: Math.round(ancho * 0.42), y: 100 } });
  decir(r.leyenda.acta === 'JD-2025-04',
    'a mitad de 2025 la cruz lee el acta que regía, no la siguiente', r.leyenda.acta);
}

console.log('\n── una resolución sin acta no entra ──────────────────────────');
{
  await p.evaluate(() => {
    window.__cojas = [
      { fecha: '2024-07-01T00:00:00.000Z', precio: 1.00, acta: 'JD-2024-11', firmante: 'X' },
      { fecha: '2025-01-01T00:00:00.000Z', precio: 1.40 },                       // sin acta
      { fecha: '2025-06-01T00:00:00.000Z', precio: 1.50, acta: '   ' },           // acta en blanco
      { fecha: 'el martes', precio: 1.70, acta: 'JD-X' },                         // fecha ilegible
      { fecha: '2025-09-01T00:00:00.000Z', precio: 0, acta: 'JD-Y' },             // precio cero
      { fecha: '2026-01-15T00:00:00.000Z', precio: 2.05, acta: 'JD-2026-03', firmante: 'X' },
    ];
  });
  const r = await pintar('__cojas');
  decir(r.n === 2, 'de seis filas solo se dibujan las dos comprobables', `n=${r.n}`);
  decir(r.leyenda.vigente.precio === 2.05, 'y la vigente sigue siendo la buena', `${r.leyenda.vigente.precio}`);
}

console.log('\n── sin resoluciones, el vacío digno ──────────────────────────');
{
  await p.evaluate(() => { window.__nada = []; });
  const r = await pintar('__nada');
  decir(r.vacio === 'sinActas' && r.n === 0, 'una serie vacía no dibuja línea', `${r.vacio} n=${r.n}`);
  decir(r.leyenda === null, 'y no hay leyenda que leer');
  const rot = await p.evaluate(() => document.getElementById('lienzoDecl').getAttribute('aria-label'));
  decir(/sin resoluciones/i.test(rot), 'el rótulo accesible dice que no hay ninguna', rot);
  decir(!/\d+[.,]\d\d/.test(rot), 'y no promete ningún precio', rot);
}

console.log('\n── el rótulo dice que NO es precio de mercado ────────────────');
{
  const r = await pintar();
  const rot = await p.evaluate(() => document.getElementById('lienzoDecl').getAttribute('aria-label'));
  decir(/junta directiva/i.test(rot), 'el rótulo accesible nombra a la Junta', rot);
  decir(/no un precio de mercado/i.test(rot), 'y dice con todas las letras que no es precio de mercado');
  decir(/JD-2026-03/.test(rot), 'y cita el acta vigente');
  decir(!/mercado de|cotiza/i.test(rot.replace(/no un precio de mercado/i, '')),
    'sin insinuar en ninguna parte que cotiza');
  void r;
}

console.log('\n── en inglés dice lo mismo ───────────────────────────────────');
{
  await pintar('__actas', { idioma: 'en' });
  const rot = await p.evaluate(() => document.getElementById('lienzoDecl').getAttribute('aria-label'));
  decir(/board of directors/i.test(rot) && /not a market price/i.test(rot),
    'el rótulo en inglés también avisa', rot);
}

console.log('\n── una sola resolución tampoco rompe ─────────────────────────');
{
  await p.evaluate(() => {
    window.__una = [{ fecha: '2026-01-15T00:00:00.000Z', precio: 2.05, acta: 'JD-2026-03', firmante: 'X' }];
  });
  const r = await pintar('__una');
  decir(r.n === 1 && r.leyenda.vigente.precio === 2.05,
    'con un solo acta se dibuja una línea plana desde esa fecha hasta hoy', `n=${r.n}`);
}

decir(errores.length === 0, 'sin errores de consola', errores.join(' | '));

await nav.close(); sv.close();
console.log(malas ? `\n${malas} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
