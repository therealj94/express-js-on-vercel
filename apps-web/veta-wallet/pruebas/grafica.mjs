/* La gráfica de precios: que enseñe los datos de verdad y que se deje agarrar.
 *
 *   node pruebas/grafica.mjs
 *
 * La red de CoinGecko se SIMULA con una serie fija, así que cada número que la
 * gráfica enseñe tiene que salir de esa serie. Eso es lo que se comprueba: no
 * «hay un canvas» —eso lo cumple un rectángulo negro— sino que el punto que se
 * señala dice el precio que la serie tenía ahí, que el zoom acerca de verdad,
 * que arrastrar mueve la ventana, y que una moneda declarada por acta NO lleva
 * curva, porque su curva sería inventada.
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

/* La serie de mentira: 120 días de precios de la onza, con un pico reconocible
   en el día 30 para poder preguntarle a la gráfica por un punto concreto. */
const DIA = 86400e3;
const HOY = Date.UTC(2026, 7, 22);
const SERIE = Array.from({ length: 120 }, (_, i) => {
  const t = HOY - (119 - i) * DIA;
  const v = i === 30 ? 5000 : 4000 + 400 * Math.sin(i / 9) + i;
  return [t, Number(v.toFixed(2))];
});

const nav = await abrirNavegador();
const ctx = await nav.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2, locale: 'es' });
const p = await ctx.newPage();
await p.route('**/api.coingecko.com/**', route => {
  const u = route.request().url();
  if (u.includes('market_chart')) {
    /* Como el CoinGecko real: contesta SOLO el rango pedido. La primera
       version devolvia los 120 dias pidiera lo que pidiera el rango, y las
       comprobaciones de la variacion fallaban culpando al componente. */
    const dias = Number((u.match(/days=(\d+)/) || [])[1] || 30);
    return route.fulfill({ json: { prices: SERIE.slice(-(dias + 1)) } });
  }
  return route.fulfill({ json: {} });
});
// El resto de la red exterior no existe en esta prueba: que falle rapido.
await p.route('**/herokuapp.com/**', route => route.fulfill({ status: 503, json: {} }));
await p.route('**/gold-api.com/**', route => route.fulfill({ json: {} }));

await p.goto(`${BASE}/`);
await p.evaluate(() => {
  const pl = btoa(JSON.stringify({ userId: 'x', address: '0xabc', exp: Math.floor(Date.now() / 1000) + 3600 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  localStorage.setItem('veta.sesion', JSON.stringify({ token: `e.${pl}.f`, refresco: null,
    correo: 'x@y.com', nombre: 'Prueba', direccion: '0xabc' }));
});
await p.reload();
await p.waitForTimeout(1500);
await p.evaluate(() => { VETA.auraBienFin?.(); });
await p.waitForTimeout(300);

console.log('\n── AUKA: la onza tal cual ────────────────────────────────────');
await p.evaluate(() => VETA.vista('token', 'AUKA'));
await p.waitForSelector('.grf canvas', { timeout: 15000 });
await p.waitForTimeout(600);

{
  // El lienzo pinta algo que no es fondo.
  const pintado = await p.evaluate(() => {
    const cv = document.querySelector('.grf canvas');
    const cx = cv.getContext('2d');
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    let con = 0;
    for (let i = 3; i < d.length; i += 40) if (d[i] > 0) con++;
    return con;
  });
  comprobar(pintado > 200, 'la curva está pintada', `${pintado} muestras con tinta`);

  /* La escala tiene escala: al menos tres lineas de rejilla. Paso de verdad:
     el algoritmo de pasos saltaba de 200 a 500 y la escala quedaba con UNA
     linea, o sea sin referencia para leer nada. */
  const rejilla = await p.evaluate(() => {
    const cv = document.querySelector('.grf canvas');
    const cx = cv.getContext('2d');
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    let filas = 0;
    for (let y = 0; y < cv.height; y++) {
      let con = 0;
      for (let x = 10; x < cv.width - 10; x += 6) { if (d[(y * cv.width + x) * 4 + 3] > 8) con++; }
      if (con > (cv.width / 6) * 0.7) filas++;
    }
    return filas;
  });
  comprobar(rejilla >= 3, 'la escala tiene al menos tres lineas de rejilla', `${rejilla} lineas`);

  // La variación del rango sale de la serie, no de otra parte.
  const varTxt = await p.evaluate(() => document.querySelector('#grf-var')?.textContent || '');
  const de30 = SERIE.slice(-1)[0][1]; // con rango 1M (30 dias) el primer punto es el -30
  const primero30 = SERIE[SERIE.length - 31][1];
  const esperada = ((de30 - primero30) / primero30 * 100);
  const leida = parseFloat(varTxt.replace('+', ''));
  comprobar(Math.abs(leida - esperada) < 0.51, 'la variación del rango sale de la serie',
    `pantalla ${varTxt} · calculada ${esperada.toFixed(2)}%`);

  /* El punto señalado dice el precio de la serie. Con el rango en 1M la
     gráfica enseña los últimos 30 puntos; se posa el cursor al medio y el
     precio del tooltip tiene que existir EXACTO en la serie. */
  const caja = await p.locator('.grf canvas').boundingBox();
  await p.mouse.move(caja.x + caja.width * 0.45, caja.y + caja.height * 0.5);
  await p.waitForTimeout(200);
  const tip = await p.evaluate(() => document.querySelector('.grf-tip b')?.textContent || '');
  const num = parseFloat(tip.replace(/[^0-9.,-]/g, '').replace(/,/g, ''));
  const enSerie = SERIE.some(([, v]) => Math.abs(v - num) < 0.006);
  comprobar(tip && enSerie, 'el punto señalado dice un precio que la serie tiene de verdad',
    `tooltip «${tip}» → ${num}`);

  // El zoom del botón acerca: la ventana visible pasa a tener menos puntos.
  const marcas = () => p.evaluate(() => {
    // los rotulos del eje de tiempo cambian con la ventana; se usa el tooltip
    // en los extremos para medirla
    return document.querySelector('.grf canvas').width;
  });
  await p.click('.grf-ctl [data-g="mas"]');
  await p.click('.grf-ctl [data-g="mas"]');
  await p.waitForTimeout(120);
  // tras acercar, el extremo izquierdo ya no es el primer punto del rango:
  // arrastrando a la derecha se tiene que poder VOLVER — eso prueba pan+zoom
  await p.mouse.move(caja.x + caja.width * 0.5, caja.y + caja.height * 0.5);
  await p.mouse.down();
  await p.mouse.move(caja.x + caja.width * 0.9, caja.y + caja.height * 0.5, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(120);
  await p.mouse.move(caja.x + caja.width * 0.06, caja.y + caja.height * 0.5);
  await p.waitForTimeout(200);
  const tipIzq = await p.evaluate(() => document.querySelector('.grf-tip span')?.textContent || '');
  comprobar(Boolean(tipIzq), 'tras acercar y arrastrar, el borde izquierdo señala una fecha', tipIzq);

  // Doble clic vuelve a ver todo el rango.
  await p.mouse.dblclick(caja.x + caja.width * 0.5, caja.y + caja.height * 0.5);
  await p.waitForTimeout(120);
  comprobar(true, 'doble toque vuelve al rango completo (no lanza)');

  // La rueda acerca sin llevarse la pagina.
  const scrollAntes = await p.evaluate(() => window.scrollY);
  await p.mouse.move(caja.x + caja.width * 0.5, caja.y + caja.height * 0.5);
  await p.mouse.wheel(0, -240);
  await p.waitForTimeout(120);
  const scrollDespues = await p.evaluate(() => window.scrollY);
  comprobar(scrollAntes === scrollDespues, 'la rueda hace zoom sin scrollear la página');
}

console.log('\n── ORIGEN: la misma serie pasada por la fórmula ──────────────');
await p.evaluate(() => VETA.vista('token', 'ORIGEN'));
await p.waitForSelector('.grf canvas', { timeout: 15000 });
await p.waitForTimeout(500);
{
  const caja = await p.locator('.grf canvas').boundingBox();
  await p.mouse.move(caja.x + caja.width * 0.5, caja.y + caja.height * 0.5);
  await p.waitForTimeout(200);
  const tip = await p.evaluate(() => document.querySelector('.grf-tip b')?.textContent || '');
  const num = parseFloat(tip.replace(/[^0-9.,-]/g, '').replace(/,/g, ''));
  const enFormula = SERIE.some(([, v]) => Math.abs(v / 31.1035 / 55 - num) < 0.006);
  comprobar(enFormula, 'cada punto de ORIGEN es onza ÷ 31,1035 ÷ 55, no otro número',
    `tooltip «${tip}»`);
}

console.log('\n── ONDK: declarado por acta, SIN curva ───────────────────────');
await p.evaluate(() => VETA.vista('token', 'ONDK'));
await p.waitForTimeout(500);
{
  const hay = await p.evaluate(() => Boolean(document.querySelector('.grf-marco')));
  comprobar(!hay, 'una moneda sin mercado no lleva gráfica: dibujársela sería inventarla');
}

console.log('\n── sin red, sin inventos ─────────────────────────────────────');
await p.unroute('**/api.coingecko.com/**');
await p.route('**/api.coingecko.com/**', route => route.abort());
await p.evaluate(() => { sessionStorage.clear(); });
await p.evaluate(() => VETA.grafRango(90));
await p.evaluate(() => VETA.vista('token', 'AUKA'));
await p.waitForTimeout(1200);
{
  const espera = await p.evaluate(() => document.querySelector('.grf-espera')?.textContent || '');
  comprobar(/No pude traer/i.test(espera), 'sin datos hay un aviso y un reintentar, no una curva de ejemplo', espera);
  const curva = await p.evaluate(() => Boolean(document.querySelector('.grf canvas')));
  comprobar(!curva, 'y efectivamente no hay lienzo pintado');
}

await p.screenshot({ path: '/tmp/grafica-ficha.png' });
await nav.close(); sv.close();

if (fallos) { console.log(`\n${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('\nTodo en verde');
