/* EL FORMULARIO DE OPERAR, como el de un exchange: partes del saldo, total
 * que se escribe, precio promedio a mercado, y las pestañas de historial.
 *
 *   node apps-web/ordenex/pruebas/probar-operar.mjs
 *
 * Y una guarda de regresión que vale sola el archivo: GET /ordenes contesta
 * { ordenes: [...] } y la web comprobaba Array.isArray sobre el sobre, así
 * que la tabla de órdenes abiertas quedaba vacía en producción mientras las
 * suites —con un arreglo pelado fingido— seguían en verde. Acá el fingido
 * contesta con el sobre de verdad.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = process.env.ONX_RAIZ ? resolve(process.env.ONX_RAIZ) : join(AQUI, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const U = 10n ** 18n;
const wei = (n) => (BigInt(Math.round(Number(n) * 1e6)) * U / 1000000n).toString();
const TOKEN_SSO = 'sso-fingido', JWT = 'jwt-fingido';

const json = (r, c, o) => { r.writeHead(c, { 'Content-Type': 'application/json; charset=utf-8' }); r.end(JSON.stringify(o)); };
const cuerpoDe = (q) => new Promise((res) => { let t = ''; q.on('data', (d) => (t += d)); q.on('end', () => { try { res(JSON.parse(t || '{}')); } catch { res({}); } }); });

// El libro: ventas 1712, 1713,5, 1715, 1716,5… con 0,3, 0,6, 0,9, 1,2…
function libro() {
  const c = [], v = [];
  for (let i = 0; i < 14; i++) { c.push([wei(1709 - i * 1.5), wei(0.4 + i * 0.35)]); v.push([wei(1712 + i * 1.5), wei(0.3 + i * 0.3)]); }
  return { compras: c, ventas: v };
}
const pedidos = [];
async function api(q, r, ruta) {
  const m = q.method;
  if (m === 'GET' && ruta === '/mercados') return json(r, 200, [{ mercado: 'AUKA-ORIGEN', ultimo: wei(1710.69), cambio24h: 0.4, vol24h: wei(222), mejorCompra: wei(1709), mejorVenta: wei(1712), serie24h: [], referencia: { usd: 4433.33, origenUsd: 2.591541, rotulo: 'onza de oro', fuente: 'fingido', en: Date.now() } }]);
  if (m === 'GET' && /^\/mercados\/[^/]+\/libro$/.test(ruta)) return json(r, 200, libro());
  if (m === 'GET' && /^\/mercados\/[^/]+\/velas/.test(ruta)) return json(r, 200, []);
  if (m === 'GET' && /^\/mercados\/[^/]+\/tratos/.test(ruta)) return json(r, 200, []);
  if (m === 'GET' && /^\/mercados\/[^/]+\/referencia/.test(ruta)) return json(r, 200, { activo: 'AUKA', unidad: 'USD', rotulo: 'onza de oro', fuente: 'fingido', actualizadoEn: Date.now(), velas: [] });
  if (m === 'GET' && ruta === '/tarifas') return json(r, 200, { comisionPpm: 2500, sobre: 'recibido' });
  if (m === 'GET' && ruta === '/salud') return json(r, 200, { ok: true, cadena: true, mongo: true, bloque: 1, entrega: true, venta: true });
  if (m === 'GET' && ruta === '/limites') return json(r, 200, { desvio: { avisoPct: 5, bloqueoPct: 25 }, terminos: { version: 3, terminos: '/legal.html#terminos', riesgo: '/legal.html#riesgo' }, redes: [{ id: 56, nombre: 'BNB Smart Chain', minimoUsd: 2 }] });
  if (m === 'POST' && ruta === '/auth/sso') { const { token } = await cuerpoDe(q); if (token !== TOKEN_SSO) return json(r, 401, { error: 'No vale.', codigo: 'SSO_INVALIDO' }); return json(r, 200, { token: JWT, refreshToken: 'x', usuario: { gid: 'GID-1', nombre: 'Fingido', verificada: true } }); }
  if (m === 'GET' && ruta === '/auth/terminos') return json(r, 200, { aceptada: 3, vigente: 3 });
  const conSesion = (q.headers.authorization || '') === 'Bearer ' + JWT;
  if (m === 'GET' && ruta === '/portafolio') { if (!conSesion) return json(r, 401, { error: 'Sin sesión.', codigo: 'SIN_SESION' }); return json(r, 200, { cuentas: [{ activo: 'ORIGEN', disponible: wei(9999), reservado: '0' }, { activo: 'AUKA', disponible: wei(222), reservado: '0' }], direccionDeposito: '0x' + 'a1'.repeat(20) }); }
  if (m === 'GET' && ruta.startsWith('/ordenes')) {
    pedidos.push(q.url);
    // EL SOBRE DE VERDAD, no un arreglo pelado.
    const todas = [
      { id: 'o1', mercado: 'AUKA-ORIGEN', lado: 'compra', tipo: 'limite', precio: wei(1700), cantidad: wei(0.5), resta: wei(0.5), estado: 'abierta', en: new Date(Date.now() - 3600e3).toISOString() },
      { id: 'o2', mercado: 'AUKA-ORIGEN', lado: 'venta', tipo: 'limite', precio: wei(1720), cantidad: wei(1), resta: '0', estado: 'ejecutada', en: new Date(Date.now() - 7200e3).toISOString() },
      { id: 'o3', mercado: 'AUKA-ORIGEN', lado: 'compra', tipo: 'mercado', precio: null, cantidad: wei(2), resta: wei(2), estado: 'cancelada', en: new Date(Date.now() - 9000e3).toISOString() },
    ];
    return json(r, 200, { ordenes: /estado=abierta/.test(q.url) ? todas.filter((o) => o.estado === 'abierta') : todas });
  }
  if (m === 'GET' && ruta.startsWith('/tratos')) { pedidos.push(q.url); return json(r, 200, { tratos: [{ id: 't1', mercado: 'AUKA-ORIGEN', lado: 'venta', precio: wei(1720), cantidad: wei(1), total: wei(1720), en: new Date(Date.now() - 7200e3).toISOString() }] }); }
  if (m === 'GET' && (ruta === '/movimientos' || ruta === '/fiat/solicitudes' || ruta === '/ventas' || ruta === '/compras')) return json(r, 200, []);
  return null;
}
const sv = createServer(async (q, r) => {
  const ruta = decodeURIComponent(q.url.split('?')[0]);
  if (await api(q, r, ruta) !== null) return;
  try { const p = join(RAIZ, ruta.replace(/^\/$/, '/index.html')); const d = await readFile(p); r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' }); r.end(d); } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(0, '127.0.0.1', ok));
const URL = `http://127.0.0.1:${sv.address().port}`;

let fallos = 0;
const decir = (ok, que, extra = '') => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`); if (extra && !ok) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 220)}`); if (!ok) fallos++; };
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

const nav = await chromium.launch({ executablePath: process.env.ONX_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1280, height: 950 }, locale: 'es-HN' });
await p.addInitScript((o) => { window.ONX_API = o; window.ONX_WALLET = o; }, URL);
const errores = [];
p.on('pageerror', (e) => errores.push(String(e.message || e)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
await p.goto(`${URL}/index.html#sso=${TOKEN_SSO}`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => ONX.vista('mercado', 'AUKA-ORIGEN'));
await p.waitForTimeout(1800);
const v = (id) => p.evaluate((i) => document.getElementById(i)?.value ?? null, id);
const txt = (sel) => p.evaluate((s) => document.querySelector(s)?.innerText ?? '', sel);

titulo('las órdenes abiertas se ven aunque el API las mande en su sobre');
decir(/1,700/.test(await txt('#vm-ordenes')) && /0\.5/.test(await txt('#vm-ordenes')), 'la tabla de abajo pinta la orden abierta', await txt('#vm-ordenes'));
decir((await p.evaluate(() => document.getElementById('vm-nmias').textContent)) === '1', 'y la pestaña cuenta una', await p.evaluate(() => JSON.stringify(document.getElementById('vm-nmias').textContent)));

titulo('las partes del saldo');
await p.evaluate(() => VMERCADO.lado('venta'));
await p.click('.vm-pct button:nth-child(2)'); await p.waitForTimeout(150);
decir((await v('vm-cant')) === '111', 'vendiendo, el 50 % de 222 AUKA son 111', await v('vm-cant'));
await p.evaluate(() => VMERCADO.lado('compra'));
await p.fill('#vm-precio', '1700'); await p.waitForTimeout(150);
await p.click('.vm-pct button:nth-child(1)'); await p.waitForTimeout(150);
// 9999 × 25 % = 2499,75 ORIGEN entre 1700 = 1,470441… AUKA, con floor
decir(/^1\.47044/.test(await v('vm-cant')), 'comprando a límite, el 25 % del ORIGEN entre el precio', await v('vm-cant'));
decir(/^2499\.7/.test(await v('vm-total-in')), 'y el total escribible sigue a la cantidad', await v('vm-total-in'));
await p.evaluate(() => VMERCADO.tipo('mercado'));
await p.click('.vm-pct button:nth-child(4)'); await p.waitForTimeout(150);
{
  // 9999 ORIGEN caminando las ventas: 0,3@1712 + 0,6@1713,5 + 0,9@1715 + 1,2@1716,5 + 1,5@1718 = 7722;
  // quedan 2277 para el sexto escalón a 1719,5 → 1,32422…; total 4,5 + 1,32422 = 5,82422…
  const c = await v('vm-cant');
  decir(/^5\.8242/.test(c), 'comprando a mercado, el 100 % del ORIGEN camina el libro escalón por escalón', c);
}

titulo('el total se escribe y la cantidad sale de dividir');
await p.evaluate(() => VMERCADO.tipo('limite'));
await p.fill('#vm-precio', '1700'); await p.fill('#vm-total-in', '3400'); await p.waitForTimeout(150);
decir((await v('vm-cant')) === '2', '3400 ORIGEN a 1700 son 2 AUKA', await v('vm-cant'));
decir(/3,400/.test(await txt('#vm-total')), 'y el total de abajo dice lo mismo', await txt('#vm-total'));
decir(await p.evaluate(() => !document.getElementById('vm-campo-total').classList.contains('oculto')), 'el campo existe a límite');
await p.evaluate(() => VMERCADO.tipo('mercado'));
decir(await p.evaluate(() => document.getElementById('vm-campo-total').classList.contains('oculto')), 'y se va a mercado: no hay precio con el que dividir');

titulo('a mercado se dice el precio promedio y cuánto se aleja de la punta');
await p.fill('#vm-cant', '2'); await p.waitForTimeout(150);
{
  const prom = await txt('#vm-prom');
  // 0,3@1712 + 0,6@1713,5 + 0,9@1715 + 0,2@1716,5 = 3428,5 → promedio 1714,25; punta 1712 → +0,13 %
  decir(/1,714\.25/.test(prom), 'el promedio de la caminata: 1.714,25', prom);
  decir(/0\.13 % sobre la punta/.test(prom), 'y el desvío sobre la punta: 0,13 %', prom);
  decir(await p.evaluate(() => !document.getElementById('vm-prom-linea').classList.contains('oculto')), 'la línea se ve a mercado');
}
await p.evaluate(() => VMERCADO.tipo('limite'));
decir(await p.evaluate(() => document.getElementById('vm-prom-linea').classList.contains('oculto')), 'y no a límite, donde el precio es el que se escribió');

titulo('las pestañas: historial y mis tratos');
await p.evaluate(() => VMERCADO.pestana('historial')); await p.waitForTimeout(600);
{
  const h = await txt('#vm-historial');
  decir(/Ejecutada/.test(h) && /Cancelada/.test(h) && !/1,700/.test(h), 'el historial trae las cerradas y no la abierta', h);
  decir(/1 \/ 1/.test(h), 'con lo que se llenó de cada una', h);
  decir(pedidos.some((r) => r === '/ordenes'), 'y se pidió sin filtro de estado');
}
await p.evaluate(() => VMERCADO.pestana('mistratos')); await p.waitForTimeout(600);
{
  const h = await txt('#vm-mistratos');
  decir(/1,720/.test(h) && /1,720 ORIGEN/.test(h) && /vender/i.test(h), 'mis tratos: precio, cantidad y total pagado, desde mi lado', h);
  decir(pedidos.some((r) => r === '/tratos?mercado=AUKA-ORIGEN'), 'pedidos a GET /tratos de este mercado');
}
decir(await p.evaluate(() => document.querySelectorAll('.vm-peskab button').length === 4), 'cuatro pestañas en la tira');

decir(errores.length === 0, 'sin errores de JavaScript', errores.join(' | '));
await nav.close(); sv.close();
console.log(fallos ? `\n${fallos} falla(s).` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
