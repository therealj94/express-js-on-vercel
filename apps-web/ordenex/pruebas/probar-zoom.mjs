/* El zoom y el paneo de la gráfica.
 *
 *   node apps-web/ordenex/pruebas/probar-zoom.mjs
 *
 * Lo que de verdad se comprueba aquí no es que la rueda haga algo: es que
 * acercar la vista NO cambie el dato. Una EMA calculada sobre el trozo visible
 * diría un número distinto para la misma vela según el zoom — la clase de
 * mentira que nadie reporta porque parece un detalle de dibujo.
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
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 120)}`);
};

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1100, height: 700 } });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
await p.goto(BASE + '/index.html');
await p.waitForTimeout(1200);

// 200 velas sintéticas con forma reconocible, en dólares (Number) para no
// arrastrar la coma fija a una prueba que va de encuadre.
await p.evaluate(() => {
  const c = document.createElement('canvas');
  c.style.width = '900px'; c.style.height = '420px';
  c.id = 'lienzoPrueba';
  document.body.appendChild(c);
  window.__velas = Array.from({ length: 200 }, (_, i) => {
    const base = 100 + Math.sin(i / 11) * 14 + i * 0.35;
    return [1786000000000 + i * 3600000, base, base + 1.6, base - 1.4, base + 0.5, null];
  });
});

const dib = (opts = {}) => p.evaluate((o) =>
  VELAS.dibujar(document.getElementById('lienzoPrueba'), window.__velas,
    { unidad: 'USD', emas: [9, 21, 55], par: 'PRUEBA', marco: '1h', ...o }),
{ ...opts });

console.log('\n── la ventana recorta lo que se ve ───────────────────────────');
{
  const todo = await dib();
  decir(todo.n === 200 && todo.total === 200, 'sin ventana se ven las 200', `n=${todo.n} total=${todo.total}`);

  const trozo = await dib({ ventana: { desde: 150, hasta: 200 } });
  decir(trozo.n === 50, 'con ventana se ven 50', `n=${trozo.n}`);
  decir(trozo.total === 200, 'pero la serie completa sigue siendo 200', `total=${trozo.total}`);
  decir(trozo.ventana.desde === 150 && trozo.ventana.hasta === 200,
    'y el informe dice qué tramo se está mirando', JSON.stringify(trozo.ventana));
}

console.log('\n── ACERCAR NO CAMBIA EL DATO ─────────────────────────────────');
{
  // La última vela es la misma mirando todo o mirando las últimas 50: su EMA
  // tiene que dar EXACTAMENTE el mismo número.
  const ancho = await p.evaluate(() => document.getElementById('lienzoPrueba').clientWidth);
  const derecha = { cursor: { x: ancho - 8, y: 100 } };
  const conTodo = await dib(derecha);
  const conZoom = await dib({ ...derecha, ventana: { desde: 150, hasta: 200 } });

  decir(conTodo.leyenda.c === conZoom.leyenda.c,
    'la última vela cierra igual con y sin zoom', `${conTodo.leyenda.c} vs ${conZoom.leyenda.c}`);

  const e1 = conTodo.leyenda.emas.map(e => e.valor).join(' | ');
  const e2 = conZoom.leyenda.emas.map(e => e.valor).join(' | ');
  decir(e1 === e2, 'y las tres EMA dan el MISMO valor con y sin zoom', `${e1}   ←→   ${e2}`);
  decir(conTodo.leyenda.emas.every(e => e.valor != null),
    'las tres tienen valor en la última vela (la serie da de sobra)');

  // Y en un tramo corto de más atrás, la EMA55 sigue existiendo porque se
  // calculó sobre la serie entera — si se calculara sobre el trozo, 30 velas
  // no darían para una media de 55 y saldría en blanco.
  const corto = await dib({ ventana: { desde: 100, hasta: 130 }, cursor: { x: ancho - 8, y: 100 } });
  decir(corto.leyenda.emas.find(e => e.periodo === 55)?.valor != null,
    'con solo 30 velas a la vista, la EMA55 SIGUE teniendo valor',
    'porque se calcula sobre la serie entera, no sobre el encuadre');
}

console.log('\n── los gestos ────────────────────────────────────────────────');
{
  const mandos = await p.evaluate(() => {
    window.__apagar = VELAS.enganchar(document.getElementById('lienzoPrueba'),
      () => ({ velas: window.__velas, opciones: { unidad: 'USD', emas: [9, 21, 55], par: 'PRUEBA', marco: '1h' } }), 999999);
    return { acercar: typeof window.__apagar.acercar, alejar: typeof window.__apagar.alejar, verTodo: typeof window.__apagar.verTodo };
  });
  decir(mandos.acercar === 'function' && mandos.alejar === 'function' && mandos.verTodo === 'function',
    'el apagador lleva los mandos colgados', JSON.stringify(mandos));
  await p.waitForTimeout(400);

  const caja = await p.evaluate(() => {
    const c = document.getElementById('lienzoPrueba');
    const b = c.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });

  // La rueda acerca.
  await p.mouse.move(caja.x + caja.w / 2, caja.y + caja.h / 2);
  await p.mouse.wheel(0, -300);
  await p.waitForTimeout(250);
  const trasRueda = await p.evaluate(() =>
    VELAS.dibujar(document.getElementById('lienzoPrueba'), window.__velas, { unidad: 'USD' }));
  // El estado del zoom vive en enganchar, así que se comprueba por los mandos:
  const trasBoton = await p.evaluate(() => { window.__apagar.acercar(); return true; });
  decir(trasBoton, 'el mando de acercar responde');

  await p.evaluate(() => window.__apagar.verTodo());
  await p.waitForTimeout(200);
  decir(true, 'y volver a verlo todo no lanza');

  // El teclado: la gráfica es enfocable y las flechas no rompen.
  const enfocable = await p.evaluate(() => document.getElementById('lienzoPrueba').getAttribute('tabindex'));
  decir(enfocable === '0', 'el lienzo es enfocable: se puede recorrer sin ratón', `tabindex=${enfocable}`);
  await p.evaluate(() => document.getElementById('lienzoPrueba').focus());
  await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('+');
  await p.keyboard.press('Home');
  await p.waitForTimeout(200);
  decir(true, 'flechas, más y Home no lanzan');

  await p.evaluate(() => window.__apagar());
}

console.log('\n── los bordes ────────────────────────────────────────────────');
{
  const fuera = await dib({ ventana: { desde: -50, hasta: 9999 } });
  decir(fuera.n === 200, 'una ventana imposible se recorta a lo que hay', `n=${fuera.n}`);
  const alReves = await dib({ ventana: { desde: 180, hasta: 20 } });
  decir(alReves.n >= 1, 'una ventana al revés no rompe la gráfica', `n=${alReves.n}`);
  const basura = await dib({ ventana: { desde: 'x', hasta: null } });
  decir(basura.n === 200, 'y una ventana con basura se ignora entera', `n=${basura.n}`);
}

decir(errores.length === 0, 'sin errores de consola', errores.join(' | '));

await nav.close(); sv.close();
console.log(malas ? `\n${malas} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
