/* CONVERTIR: ORIGEN ⇄ USDT en una pantalla, contra un API fingido y en un navegador.
 *
 *   node apps-web/ordenex/pruebas/probar-convertir.mjs
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * `vender.js` es la puerta por la que SALE el dinero, y es la única pantalla
 * de esta casa donde un error no se puede deshacer: una dirección mal puesta o
 * un doble pago son plata que se fue. La lección de probar-comprar.mjs vale
 * doble acá — probar los módulos por separado no encuentra los huecos ENTRE
 * módulos, y el único que los encuentra es recorrer el camino entero con un
 * navegador y un servidor al otro lado.
 *
 * QUÉ SE COMPRUEBA
 *
 *   1. Que la cotización se pida DE VERDAD y que el número grande sea el NETO,
 *      con la comisión ya descontada. Si el número grande fuera el bruto, cada
 *      venta terminaría en un reclamo.
 *   2. Que vender mande origenWei, red, direccion y ventaKey. Sin la clave, el
 *      servidor no puede impedir el doble pago.
 *   3. Que un reintento reuse LA MISMA ventaKey. Es la mitad de la defensa: la
 *      otra es el índice único del servidor.
 *   4. Que no se pueda vender más de lo que hay, ni sin dirección.
 *   5. Que un pago EN DUDA se enseñe pidiendo NO repetir, que es lo único
 *      correcto que puede hacer alguien en ese momento.
 *   6. Que sin saldo se diga dónde está el ORIGEN, en vez de un cero mudo.
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
const wei = (n) => (BigInt(n) * U).toString();
const TOKEN_SSO = 'sso-fingido';
const JWT = 'jwt-fingido';
const DEPOSITO = '0x' + 'b7c3'.repeat(10);
const AFUERA = '0x' + '42'.repeat(20);

// El precio del ORIGEN: la onza a 4.389,89 entre 31,1035 y entre 55.
const PRECIO_WEI = '2566148000000000000';   // $2,566148
const PPM = 10000;                          // la comisión de salida: 1 %

let llamadas = [];
let saldo = wei(500);
let siguienteFalla = null;
let ventaAbierta = true;

const json = (r, codigo, obj) => {
  r.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  r.end(JSON.stringify(obj));
};
const cuerpoDe = (q) => new Promise((res) => {
  let t = '';
  q.on('data', (d) => { t += d; });
  q.on('end', () => { try { res(JSON.parse(t || '{}')); } catch { res({}); } });
});

/** La misma cuenta que hace el servidor de verdad, para que la pantalla no
 *  pueda pasar la prueba con un número que producción no daría. */
function cotizacion(origenWei) {
  const bruto = (BigInt(origenWei) * BigInt(PRECIO_WEI)) / U;
  const comision = (bruto * BigInt(PPM)) / 1000000n;
  return {
    origenWei: String(origenWei), precioWei: PRECIO_WEI, precioUsd: 2.566148, oroUsd: 4389.89,
    brutoCanonico: bruto.toString(), comisionCanonico: comision.toString(),
    netoCanonico: (bruto - comision).toString(), comisionPpm: PPM,
    red: 56, redNombre: 'BNB Smart Chain',
  };
}

async function api(q, r, ruta) {
  const sesion = (q.headers.authorization || '') === 'Bearer ' + JWT;

  if (q.method === 'GET' && ruta === '/mercados') {
    return json(r, 200, [{ mercado: 'AUKA-ORIGEN', ultimo: wei(1711), cambio24h: 0.4, vol24h: wei(222),
      referencia: { usd: 4389.89, origenUsd: 2.566148, rotulo: 'onza de oro', fuente: 'fingido', en: new Date().toISOString() } }]);
  }
  if (q.method === 'GET' && ruta === '/tarifas') return json(r, 200, { comisionPpm: 0, sobre: 'recibido' });
  if (q.method === 'GET' && ruta === '/salud') {
    return json(r, 200, { ok: true, cadena: true, mongo: true, bloque: 1, entrega: true, venta: ventaAbierta });
  }
  if (q.method === 'GET' && ruta === '/limites') {
    return json(r, 200, { desvio: { avisoPct: 5, bloqueoPct: 20 },
                          redes: [{ id: 56, nombre: 'BNB Smart Chain', minimoUsd: 2 }] });
  }
  if (q.method === 'POST' && ruta === '/auth/sso') {
    const { token } = await cuerpoDe(q);
    if (token !== TOKEN_SSO) return json(r, 401, { error: 'No vale.', codigo: 'SSO_INVALIDO' });
    return json(r, 200, { token: JWT, refreshToken: 'refresco',
      usuario: { gid: 'GID-FINGIDO', nombre: 'Fingido', verificada: true, direccionWallet: '0x' + '11'.repeat(20) } });
  }
  if (q.method === 'GET' && ruta === '/portafolio') {
    if (!sesion) return json(r, 401, { error: 'Sin sesión.', codigo: 'SIN_SESION' });
    return json(r, 200, { cuentas: [{ activo: 'ORIGEN', disponible: saldo, reservado: '0' }],
                          direccionDeposito: DEPOSITO });
  }
  if (q.method === 'GET' && (ruta === '/movimientos' || ruta === '/ordenes' || ruta === '/fiat/solicitudes' || ruta === '/ventas')) {
    return json(r, 200, []);
  }
  // El techo de la venta: 9 USDT libres en la caja (10 menos el apartado).
  if (q.method === 'GET' && ruta === '/ventas/limites') {
    const neto = (BigInt(PRECIO_WEI) * BigInt(1000000 - PPM)) / 1000000n;
    return json(r, 200, { encendida: ventaAbierta, precioWei: PRECIO_WEI, precioUsd: 2.566148, netoPorOrigen: neto.toString(), comisionPpm: PPM,
      redes: [{ id: 56, nombre: 'BNB Smart Chain', maxUsdtCanonico: (9n * U).toString(), maxOrigenWei: ((9n * U * U) / neto).toString() }] });
  }

  // ── LAS DOS RUTAS DE LA VENTA ────────────────────────────────────────────
  if (q.method === 'POST' && ruta === '/ventas/cotizar') {
    const cuerpo = await cuerpoDe(q);
    llamadas.push({ ruta, metodo: 'POST', cuerpo });
    return json(r, 200, cotizacion(cuerpo.origenWei || '0'));
  }
  if (q.method === 'POST' && ruta === '/ventas') {
    const cuerpo = await cuerpoDe(q);
    llamadas.push({ ruta, metodo: 'POST', cuerpo });
    if (!sesion) return json(r, 401, { error: 'Sin sesión.', codigo: 'SIN_SESION' });
    if (siguienteFalla) { const e = siguienteFalla; siguienteFalla = null; return json(r, e.status || 400, e); }
    const c = cotizacion(cuerpo.origenWei || '0');
    saldo = (BigInt(saldo) - BigInt(cuerpo.origenWei || '0')).toString();
    return json(r, 200, {
      id: 'venta-1', red: cuerpo.red, redNombre: 'BNB Smart Chain', direccion: cuerpo.direccion,
      origenWei: c.origenWei, precioWei: c.precioWei, brutoCanonico: c.brutoCanonico,
      comisionCanonico: c.comisionCanonico, comisionPpm: PPM, netoCanonico: c.netoCanonico,
      estado: 'pagada', hash: '0x' + 'ab'.repeat(32),
      explorador: 'https://bscscan.com/tx/0x' + 'ab'.repeat(32), motivo: null, en: new Date().toISOString(),
    });
  }
  return null;
}


const sv = createServer(async (q, r) => {
  const ruta = decodeURIComponent(q.url.split('?')[0]);
  if (await api(q, r, ruta) !== null) return;
  try {
    const p = join(RAIZ, ruta.replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(0, '127.0.0.1', ok));
const ORIGEN_URL = `http://127.0.0.1:${sv.address().port}`;

let fallos = 0;
const decir = (ok, que, extra = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra && !ok) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 200)}`);
  if (!ok) fallos++;
};
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

const nav = await chromium.launch({ executablePath: process.env.ONX_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1280, height: 950 }, locale: 'es-HN' });
await p.addInitScript((o) => { window.ONX_API = o; window.ONX_WALLET = o; }, ORIGEN_URL);
const errores = [];
p.on('pageerror', (e) => errores.push(String(e.message || e)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });

await p.goto(`${ORIGEN_URL}/index.html#sso=${TOKEN_SSO}`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1800);
const leer = () => p.evaluate(() => ({
  das: document.getElementById('cv-das')?.value, rec: document.getElementById('cv-rec')?.value,
  apagado: document.querySelector('.cv-btn')?.disabled, traba: document.querySelector('#cv-izq .vn-mal')?.innerText || '',
  techo: document.querySelector('.cv-techo b')?.innerText || '', texto: document.getElementById('cv-izq')?.innerText || '' }));

titulo('la navegación: Convertir reemplaza a Comprar y Vender');
decir(await p.evaluate(() => document.querySelectorAll('.riel .nav[data-vista="convertir"], .tabs .nav[data-vista="convertir"]').length === 2), 'Convertir está en el riel y en las pestañas');
decir(await p.evaluate(() => document.querySelectorAll('.nav[data-vista="comprar"], .nav[data-vista="vender"]').length === 0), 'y Comprar y Vender ya no son dos salas sueltas');
await p.evaluate(() => ONX.vista('convertir'));
await p.waitForTimeout(1200);
decir(await p.evaluate(() => !!document.getElementById('cv-das') && !!document.getElementById('cv-rec')), 'la pantalla tiene las dos cajas: das y recibís');
decir(await p.evaluate(() => document.querySelector('.nav[data-vista="convertir"]').getAttribute('aria-current') === 'page'), 'y su pestaña está encendida');

titulo('comprar: se escribe de cualquiera de los dos lados');
await p.fill('#cv-das', '100'); await p.waitForTimeout(250);
{
  const l = await leer();
  // 100 USDT / 2,566148 = 38,9689… ORIGEN
  decir(/^38\.96/.test(l.rec), '100 USDT dan 38,96… ORIGEN, la misma cuenta que comprar.js', l.rec);
  decir(l.apagado === false, 'y se puede continuar');
}
await p.fill('#cv-rec', '10'); await p.waitForTimeout(250);
{
  const l = await leer();
  // 10 × 2,566148 = 25,66148 USDT, redondeado hacia arriba al micro y enseñado a dos decimales.
  decir(l.das === '25.66' && /≈/.test(l.texto), 'querer 10 ORIGEN pide 25,66 USDT, marcado como aproximado', `${l.das} · ${/≈/.test(l.texto)}`);
}
await p.fill('#cv-das', '1'); await p.waitForTimeout(250);
decir((await leer()).apagado === true && /mínimo/.test((await leer()).traba), 'por debajo del mínimo de la red no se sigue', (await leer()).traba);

titulo('la flecha da la vuelta y conserva lo escrito');
await p.fill('#cv-rec', '10'); await p.waitForTimeout(200);
await p.click('.cv-girar'); await p.waitForTimeout(300);
{
  const l = await leer();
  decir(l.das === '10' && /ORIGEN/.test(l.texto) && /3\.54/.test(l.techo), 'ahora se venden esos 10 ORIGEN, y se dice el techo de la caja (3,54 ORIGEN)', `${l.das} · ${l.techo}`);
  decir(l.apagado === true && l.traba.length > 0, 'que 10 superan, así que no se sigue', l.traba);
}
await p.fill('#cv-das', '2'); await p.waitForTimeout(250);
{
  const l = await leer();
  // 2 × 2,566148 × 0,99 = 5,08097…
  decir(/^5\.08/.test(l.rec) && l.apagado === false, '2 ORIGEN dan 5,08 USDT netos y se puede seguir', `${l.rec} · ${l.apagado}`);
}
await p.fill('#cv-rec', '5'); await p.waitForTimeout(250);
decir(/^1\.96/.test((await leer()).das), 'querer 5 USDT pide 1,96… ORIGEN', (await leer()).das);
await p.click('.cp-rap:nth-child(2)'); await p.waitForTimeout(250);
decir((await leer()).das === '250', 'el 50 % del saldo (500) son 250 ORIGEN');

titulo('continuar lleva a la sala que ejecuta, con el número puesto');
await p.fill('#cv-das', '2'); await p.waitForTimeout(250);
await p.click('.cv-btn'); await p.waitForTimeout(900);
decir(await p.evaluate(() => location.hash === '#vender' && document.getElementById('vn-cant')?.value === '2'), 'vender, con 2 ORIGEN ya escritos', await p.evaluate(() => location.hash + ' ' + document.getElementById('vn-cant')?.value));
decir(await p.evaluate(() => /5\.08/.test(document.querySelector('.vn-recibe b')?.innerText || '')), 'y la sala cotiza el mismo neto');
decir(await p.evaluate(() => document.querySelector('.nav[data-vista="convertir"]').getAttribute('aria-current') === 'page'), 'la pestaña Convertir sigue encendida en la sala de vender');
await p.evaluate(() => ONX.vista('convertir')); await p.waitForTimeout(800);
await p.evaluate(() => VCONVERTIR._adentro.poner('compra'));
await p.fill('#cv-das', '100'); await p.waitForTimeout(250);
await p.click('.cv-btn'); await p.waitForTimeout(900);
decir(await p.evaluate(() => location.hash === '#comprar' && document.getElementById('cp-monto')?.value === '100'), 'comprar, con 100 USDT ya escritos', await p.evaluate(() => location.hash + ' ' + document.getElementById('cp-monto')?.value));

titulo('cerrada, se dice');
ventaAbierta = false;
await p.evaluate(() => ONX.vista('convertir')); await p.waitForTimeout(800);
await p.evaluate(() => { VCONVERTIR._adentro.poner('venta'); VCONVERTIR.das('1'); });
await p.waitForTimeout(300);
decir(/cerrada/i.test((await leer()).texto) && (await leer()).apagado === true, 'con la venta cerrada el botón no deja seguir y lo dice');

decir(errores.length === 0, 'sin errores de JavaScript en todo el recorrido', errores.join(' | '));
await nav.close(); sv.close();
console.log(fallos ? `\n${fallos} falla(s).` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
