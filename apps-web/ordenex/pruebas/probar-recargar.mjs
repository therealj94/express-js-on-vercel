/* RECARGAR LA TARJETA: la sala aparte, contra un API fingido y en un navegador.
 *
 *   node apps-web/ordenex/pruebas/probar-recargar.mjs
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * Esto mueve dinero hacia fuera igual que Vender, pero con la promesa
 * contraria: acá NADA se elige. La red es Polygon y la dirección es la de la
 * tarjeta de uno. Si un día alguien agrega «solo un campito» para cambiar el
 * destino, la sala deja de ser lo que se prometió y vuelve a existir la forma
 * de teclear mal cuarenta y dos caracteres. Estas pruebas están para que ese
 * día se ponga rojo.
 *
 * QUÉ SE COMPRUEBA
 *
 *   1. Que la tarjeta salga PUESTA: los cuatro últimos, el titular, la red y
 *      la dirección entera —entera, para poder compararla con la del emisor.
 *   2. Que NO haya dónde escribir una dirección ni selector de redes. Es la
 *      prueba de la promesa, no de un detalle de diseño.
 *   3. Que el pago vaya con red 137 y con la dirección que dio la casa, no con
 *      una que venga del cliente.
 *   4. Que un reintento reuse LA MISMA ventaKey: reintentar no puede cobrar
 *      dos veces.
 *   5. Que sin tarjeta se explique con calma y el botón no se pueda tocar —no
 *      tener tarjeta no es un fallo de nadie.
 *   6. Que con Polygon cerrada se avise ARRIBA y no se pueda confirmar. La
 *      casa tiene sus redes en un interruptor; enterarse después de escribir
 *      el monto es el peor momento.
 *   7. Que VENDER haya quedado intacta: su selector de redes y su campo de
 *      dirección siguen ahí, y no le apareció ninguna tarjeta. Es el pedido
 *      literal de José: «dejar vender solo».
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
/* La dirección de recarga de la tarjeta: la da el emisor y viaja desde la
   billetera. Con forma de verdad para que la pantalla no pueda «pasar» con
   algo que producción nunca daría. */
const RECARGA = '0x5609f8feA91bB58E79236f79b646b22F174344F9';
const TERMINOS_V = '2026-09-02';
let terminosAceptados = true;

const PRECIO_WEI = '2566148000000000000';   // $2,566148 por ORIGEN
const PPM = 10000;                          // 1 %

let llamadas = [];
let saldo = wei(500);
let siguienteFalla = null;
let ventaAbierta = true;
let polygonAbierta = true;
let tarjetaHay = true;
let techoLegible = true;   // la caja se puede leer o el RPC está caído

const json = (r, codigo, obj) => {
  r.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  r.end(JSON.stringify(obj));
};
const cuerpoDe = (q) => new Promise((res) => {
  let t = '';
  q.on('data', (d) => { t += d; });
  q.on('end', () => { try { res(JSON.parse(t || '{}')); } catch { res({}); } });
});

function cotizacion(origenWei) {
  const bruto = (BigInt(origenWei) * BigInt(PRECIO_WEI)) / U;
  const comision = (bruto * BigInt(PPM)) / 1000000n;
  return {
    origenWei: String(origenWei), precioWei: PRECIO_WEI, precioUsd: 2.566148, oroUsd: 4389.89,
    brutoCanonico: bruto.toString(), comisionCanonico: comision.toString(),
    netoCanonico: (bruto - comision).toString(), comisionPpm: PPM,
    red: 137, redNombre: 'Polygon',
  };
}
const redesDeLaCasa = () => (polygonAbierta
  ? [{ id: 56, nombre: 'BNB Smart Chain', minimoUsd: 2 }, { id: 137, nombre: 'Polygon', minimoUsd: 2 }]
  : [{ id: 56, nombre: 'BNB Smart Chain', minimoUsd: 2 }]);

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
                          terminos: { version: TERMINOS_V, terminos: 'legal.html#terminos', riesgo: 'legal.html#riesgo' },
                          redes: redesDeLaCasa() });
  }
  if (q.method === 'GET' && ruta === '/auth/terminos') {
    return json(r, 200, { version: TERMINOS_V, terminos: 'legal.html#terminos', riesgo: 'legal.html#riesgo', aceptada: terminosAceptados });
  }
  if (q.method === 'POST' && ruta === '/auth/terminos') {
    terminosAceptados = true;
    return json(r, 200, { version: TERMINOS_V, aceptada: true });
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
  /* LA TARJETA. Ordenex se la pregunta a la billetera con la sesión de quien
     mira; acá se finge esa respuesta ya resuelta. El fingido REGISTRA que se
     pidió con sesión: si un día se pudiera pedir sin ella, cualquiera con una
     cuenta iría descubriendo dónde se recarga la tarjeta de los demás. */
  if (q.method === 'GET' && ruta === '/ventas/tarjeta') {
    llamadas.push({ ruta, metodo: 'GET', sesion });
    if (!sesion) return json(r, 401, { error: 'Sin sesión.', codigo: 'SIN_SESION' });
    if (!tarjetaHay) return json(r, 200, { tiene: false, porQue: 'esa cuenta todavía no tiene tarjeta' });
    return json(r, 200, { tiene: true, last4: '1954', titular: 'Medardo Ordonez',
                          red: 'POLYGON', direccion: RECARGA, monedas: ['USDT', 'USDC'] });
  }
  if (q.method === 'GET' && ruta === '/ventas/limites') {
    const neto = (BigInt(PRECIO_WEI) * BigInt(1000000 - PPM)) / 1000000n;
    return json(r, 200, { encendida: ventaAbierta, precioWei: PRECIO_WEI, precioUsd: 2.566148,
      netoPorOrigen: neto.toString(), comisionPpm: PPM,
      redes: redesDeLaCasa().map((x) => (techoLegible
        ? { ...x, maxUsdtCanonico: (900n * U).toString(), maxOrigenWei: ((900n * U * U) / neto).toString() }
        /* Es lo que contesta el API de verdad cuando el RPC no da el saldo:
           la fila existe, con su error y sin techo. */
        : { ...x, maxUsdtCanonico: null, maxOrigenWei: null, error: 'no se pudo leer la caja' })) });
  }
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
      id: 'venta-1', red: cuerpo.red, redNombre: 'Polygon', direccion: cuerpo.direccion,
      origenWei: c.origenWei, precioWei: c.precioWei, brutoCanonico: c.brutoCanonico,
      comisionCanonico: c.comisionCanonico, comisionPpm: PPM, netoCanonico: c.netoCanonico,
      estado: 'pagada', hash: '0x' + 'cd'.repeat(32),
      explorador: 'https://polygonscan.com/tx/0x' + 'cd'.repeat(32), motivo: null, en: new Date().toISOString(),
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
  if (extra && !ok) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 240)}`);
  if (!ok) fallos++;
};
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

// ── 0 · el orden de carga, que es el único sistema de módulos de la casa ────
titulo('el orden de los <script>');
{
  const html = await readFile(join(RAIZ, 'index.html'), 'utf8');
  const v = html.indexOf('vender.js?'), rc = html.indexOf('recargar.js?');
  decir(v > 0 && rc > v,
    'vender.js va ANTES que recargar.js',
    'recargar.js toma aWei/deWei de VVENTA._adentro al cargarse: son las mismas cuentas de la venta porque es el mismo dinero, y al revés la sala nace muerta');
}

const nav = await chromium.launch({ executablePath: process.env.ONX_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1280, height: 950 }, locale: 'es-HN' });
await p.addInitScript((o) => { window.ONX_API = o; window.ONX_WALLET = o; }, ORIGEN_URL);
const errores = [];
p.on('pageerror', (e) => errores.push(String(e.message || e)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });

const texto = () => p.evaluate(() => document.getElementById('rc-izq')?.innerText || '');
const irA = async (cual) => { await p.evaluate((c) => ONX.vista(c), cual); await p.waitForTimeout(1300); };

await p.goto(`${ORIGEN_URL}/index.html#sso=${TOKEN_SSO}`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1800);

// ── 1 · la sala existe y se llega a ella ────────────────────────────────────
titulo('Recargar es una sección SIN pestaña');
/* José la quitó de la barra el mismo día que la estrenó: «quitemos el botón
   de Ordenex y dejar solo en la tarjeta». Nadie viene a un exchange a
   «recargar»; se viene desde la tarjeta. Pero la ruta tiene que seguir siendo
   pública y directa, porque es por donde entra el botón de la billetera. */
decir(await p.evaluate(() => document.querySelectorAll('[data-vista="recargar"]').length === 0),
  'no tiene pestaña en la barra: se llega desde la tarjeta');
decir(await p.evaluate(() => document.querySelectorAll('.tabs .nav').length === 5),
  'y las pestañas del teléfono vuelven a ser cinco');
llamadas = [];
await irA('recargar');
decir(await p.evaluate(() => !!document.getElementById('rc-cant')), 'abre con su campo de cantidad');
decir((await p.evaluate(() => location.hash)) === '#recargar',
  'y con su propia dirección, para poder llegar de fuera', await p.evaluate(() => location.hash));

// ── 2 · la tarjeta, puesta ─────────────────────────────────────────────────
titulo('la tarjeta sale puesta y no se escribe');
{
  const t = await texto();
  decir(/1954/.test(t), 'se ven los cuatro últimos de la tarjeta', t.slice(0, 200));
  decir(/Medardo Ordonez/.test(t), 'y a nombre de quién está');
  decir(t.includes(RECARGA), 'y la dirección ENTERA, para poder compararla con la del emisor', t.slice(0, 300));
  decir(/Polygon/.test(t) && /fija/i.test(t), 'la red dice Polygon y dice que es fija');
  const pedidos = llamadas.filter((l) => l.ruta === '/ventas/tarjeta');
  decir(pedidos.length >= 1 && pedidos.every((x) => x.sesion === true),
    'la tarjeta se pidió con la sesión puesta y ninguna vez sin ella',
    'sin sesión, cualquiera con cuenta iría descubriendo dónde se recarga la tarjeta de los demás');
  decir(await p.evaluate(() => document.querySelectorAll('#rc-izq input').length === 1),
    'hay UN solo campo en toda la pantalla: el monto',
    'cualquier campo de más acá es una forma más de mandar el dinero a donde no hay nadie');
  decir(await p.evaluate(() => !document.querySelector('#rc-izq .vn-red, #rc-izq .vn-input')),
    'no hay selector de redes ni campo de dirección');
}

// ── 3 · la cuenta y el pago ────────────────────────────────────────────────
titulo('la cuenta, y el pago por Polygon');
llamadas = [];
await p.fill('#rc-cant', '100');
await p.waitForTimeout(1100);
{
  const cot = llamadas.filter((l) => l.ruta === '/ventas/cotizar');
  decir(cot.length >= 1, 'se cotiza de verdad contra el servidor');
  decir(cot.at(-1)?.cuerpo?.red === 137, 'y se cotiza en Polygon, sin que nadie la eligiera', String(cot.at(-1)?.cuerpo?.red));
  const c = cotizacion(wei(100));
  const centavos = BigInt(c.netoCanonico) / 10n ** 16n;   // truncado, no redondeado
  const neto = `${centavos / 100n}.${String(centavos % 100n).padStart(2, '0')}`;
  const t = await texto();
  decir(t.includes(neto), `el número grande es el NETO (${neto} USD), con la comisión ya descontada`, t.slice(-320));
  decir(/1\.00 %|1,00 %/.test(t), 'y la comisión se ve en su renglón');
}
llamadas = [];
await p.click('.vn-btn');
await p.waitForTimeout(1400);
{
  const pagos = llamadas.filter((l) => l.ruta === '/ventas' && l.metodo === 'POST');
  decir(pagos.length === 1, 'un toque, un pago', String(pagos.length));
  const c = pagos[0]?.cuerpo || {};
  decir(c.red === 137, 'el pago va por Polygon', String(c.red));
  decir(c.direccion === RECARGA, 'y a la dirección que dio la casa, no a una del cliente', c.direccion);
  decir(typeof c.ventaKey === 'string' && c.ventaKey.length > 8, 'con su ventaKey contra el pago doble', c.ventaKey);
  decir(/Recarga enviada/i.test(await texto()), 'y se enseña el comprobante');
  decir(/1954/.test(await texto()), 'diciendo a qué tarjeta fue');
}

// ── 4 · reintentar no puede cobrar dos veces ───────────────────────────────
titulo('reintentar no cobra dos veces');
await p.evaluate(() => VRECARGA.otra());
await p.waitForTimeout(600);
await p.fill('#rc-cant', '10');
await p.waitForTimeout(1000);
{
  /* El primer intento falla por red, que es justo cuando la gente vuelve a
     tocar. Se toca DE NUEVO sin pasar por «otra»: ese es el caso que el
     índice único del servidor no alcanza a cubrir solo. */
  siguienteFalla = { status: 502, error: 'La cadena no contestó.', codigo: 'CADENA' };
  llamadas = [];
  await p.evaluate(() => VRECARGA.recargar());
  await p.waitForTimeout(1000);
  decir(/No se pudo recargar/i.test(await texto()), 'un fallo se cuenta como fallo', (await texto()).slice(0, 160));
  await p.evaluate(() => VRECARGA.recargar());
  await p.waitForTimeout(1200);
  const claves = llamadas.filter((l) => l.ruta === '/ventas' && l.metodo === 'POST').map((l) => l.cuerpo.ventaKey);
  decir(claves.length === 2 && claves[0] === claves[1],
    'el reintento lleva LA MISMA ventaKey', JSON.stringify(claves));
}

// ── 4b · el comprobante no se queda pegado ─────────────────────────────────
titulo('al volver a entrar, la sala está en limpio');
{
  await p.evaluate(() => VRECARGA.otra());
  await p.waitForTimeout(600);
  await p.fill('#rc-cant', '5');
  await p.waitForTimeout(1000);
  await p.click('.vn-btn');
  await p.waitForTimeout(1300);
  decir(/Recarga enviada/i.test(await texto()), 'primero se recarga de verdad');
  await irA('portafolio');
  await irA('recargar');
  decir(!/Recarga enviada/i.test(await texto()),
    'y al volver NO está el recibo de hace un rato',
    'a los dos minutos nadie sabe si ese recibo es el de ahora o el de antes; su sitio es Actividad');
  decir(await p.evaluate(() => document.getElementById('rc-cant')?.value === ''),
    'ni el monto de la vez pasada');
}

// ── 5 · sin tarjeta ────────────────────────────────────────────────────────
titulo('sin tarjeta no es un error');
tarjetaHay = false;
await irA('portafolio');
await irA('recargar');
{
  const t = await texto();
  decir(/todavía no hay una tarjeta/i.test(t), 'se explica con calma', t.slice(0, 200));
  decir(/Veta Wallet/.test(t), 'y se dice dónde se pide');
  decir(await p.evaluate(() => document.querySelector('#rc-izq .vn-btn')?.disabled === true),
    'y el botón de recargar no se puede tocar');
}
tarjetaHay = true;

// ── 6 · con Polygon cerrada ────────────────────────────────────────────────
titulo('con Polygon cerrada, se avisa antes');
polygonAbierta = false;
await irA('portafolio');
await irA('recargar');
{
  const t = await texto();
  decir(/no está pagando por/i.test(t) && /Polygon/.test(t),
    'se dice ARRIBA, antes de escribir el monto', t.slice(0, 220));
  await p.fill('#rc-cant', '10');
  await p.waitForTimeout(1100);
  decir(await p.evaluate(() => document.querySelector('#rc-izq .vn-btn')?.disabled === true),
    'y no se puede confirmar');
  decir(/sigue donde está/i.test(await texto()), 'diciendo que el ORIGEN de uno no se movió');
}
polygonAbierta = true;

// ── 6b · el techo es la tesorería ──────────────────────────────────────────
titulo('no se recarga más de lo que hay en tesorería');
{
  /* Se repone el saldo a mano: las pruebas de arriba ya gastaron parte, y un
     monto que rebota por SALDO no prueba nada sobre el techo de la CASA. Son
     dos frenos distintos y hay que verlos por separado. */
  saldo = wei(500);
  await irA('portafolio');
  await irA('recargar');
  const t = await texto();
  decir(/Máximo que la casa puede pagar ahora/.test(t), 'el techo se enseña ANTES de escribir nada', t.slice(0, 160));
  decir(/900(\.|,)?\d*\s*USD/.test(t) || /900 USD/.test(t),
    'y también en dólares, que es como se piensa una tarjeta', (t.match(/[\d.,]+ USD/g) || []).join(' · '));

  /* Por encima del techo: el botón se apaga y se dice cuál es el máximo. */
  /* 380 ORIGEN: caben en el saldo (500) y NO en la caja (900 USD ÷ 2,5405 =
     354,26 ORIGEN). Así el freno que salta es el de la casa y no el propio. */
  await p.fill('#rc-cant', '380');
  await p.waitForTimeout(1200);
  decir(await p.evaluate(() => document.querySelector('#rc-izq .vn-btn')?.disabled === true),
    'pidiendo más de lo que hay, no se puede confirmar');
  decir(/no puede pagar tanto/i.test(await texto()), 'y se dice cuál es el máximo', (await texto()).slice(0, 200));

  /* Y aunque se llame al manejador a mano —una consola, un botón mal
     pintado—, el pago se niega igual: la regla vive junto al dinero. */
  llamadas = [];
  await p.evaluate(() => VRECARGA.recargar());
  await p.waitForTimeout(900);
  decir(llamadas.filter((l) => l.ruta === '/ventas' && l.metodo === 'POST').length === 0,
    'y llamando al manejador a mano tampoco sale el pago',
    'el botón apagado es el dibujo de la regla; la regla tiene que estar junto al dinero');
  decir(/no puede pagar tanto/i.test(await texto()), 'se explica en vez de no hacer nada');

  await p.evaluate(() => VRECARGA.otra());
  await p.waitForTimeout(700);
  await p.evaluate(() => VRECARGA.hastaElTecho());
  await p.waitForTimeout(1300);
  decir(await p.evaluate(() => document.querySelector('#rc-izq .vn-btn')?.disabled === false),
    '«poner el máximo» deja un monto que SÍ cabe',
    await p.evaluate(() => document.getElementById('rc-cant')?.value));
}

// ── 6c · sin poder leer la caja, no se recarga a ciegas ────────────────────
titulo('sin techo legible, puerta cerrada');
{
  techoLegible = false;
  await irA('portafolio');
  await irA('recargar');
  await p.fill('#rc-cant', '1');
  await p.waitForTimeout(1200);
  decir(/No pude leer cuánto puede pagar la casa/i.test(await texto()),
    'se dice que no se pudo leer', (await texto()).slice(0, 200));
  decir(await p.evaluate(() => document.querySelector('#rc-izq .vn-btn')?.disabled === true),
    'y NO se deja confirmar',
    '«no sé cuánto puede pagar» no puede comportarse como «puede pagar lo que sea»');
  llamadas = [];
  await p.evaluate(() => VRECARGA.recargar());
  await p.waitForTimeout(900);
  decir(llamadas.filter((l) => l.ruta === '/ventas' && l.metodo === 'POST').length === 0,
    'ni a mano');
  techoLegible = true;
}

// ── 7 · vender quedó intacta ───────────────────────────────────────────────
titulo('Vender quedó como estaba');
await irA('vender');
{
  const t = await p.evaluate(() => document.getElementById('vn-izq').innerText);
  decir(await p.evaluate(() => document.querySelectorAll('#vn-izq .vn-red').length >= 1),
    'sigue teniendo su selector de redes');
  decir(await p.evaluate(() => !!document.getElementById('vn-dir')),
    'y su campo de dirección: ahí SÍ se elige a dónde va el dinero');
  decir(!/1954|tarjeta/i.test(t), 'y no le apareció ninguna tarjeta', t.slice(0, 200));
  decir(await p.evaluate(() => !document.querySelector('#vn-izq .rc-tarjeta')),
    'ni el bloque de la sala de recargar');
}

// ── 8 · llegar desde la billetera, con la intención puesta ─────────────────
titulo('la billetera manda con la sala puesta');
{
  /* La app abre `#sso=<pase>&ir=recargar`: la persona tocó «Recargar» del
     lado de la tarjeta y tiene que caer acá, no en el portafolio a buscar el
     mismo botón otra vez. */
  const q = await nav.newPage({ viewport: { width: 420, height: 900 }, locale: 'es-HN' });
  await q.addInitScript((o) => { window.ONX_API = o; window.ONX_WALLET = o; }, ORIGEN_URL);
  await q.goto(`${ORIGEN_URL}/index.html#sso=${TOKEN_SSO}&ir=recargar`, { waitUntil: 'domcontentloaded' });
  await q.waitForTimeout(2600);
  decir(await q.evaluate(() => !!document.getElementById('rc-cant')),
    'se entra directo a Recargar', await q.evaluate(() => location.hash));
  decir((await q.evaluate(() => document.body.innerText)).includes(RECARGA),
    'con la tarjeta ya puesta');
  decir(!/sso=/.test(await q.evaluate(() => location.href)),
    'y el pase NO se queda en la barra de direcciones',
    'un pase de sesión en el historial o en una captura compartida es una sesión regalada');

  if (process.env.ONX_FOTO) {
    await q.screenshot({ path: process.env.ONX_FOTO, fullPage: true });
    console.log(`  ·    foto en ${process.env.ONX_FOTO}`);
  }

  /* Una dirección la escribe cualquiera: `ir=` con una sala que no existe no
     puede tumbar la entrada ni llevar a ningún sitio raro. */
  const z = await nav.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-HN' });
  await z.addInitScript((o) => { window.ONX_API = o; window.ONX_WALLET = o; }, ORIGEN_URL);
  await z.goto(`${ORIGEN_URL}/index.html#sso=${TOKEN_SSO}&ir=../../algo`, { waitUntil: 'domcontentloaded' });
  await z.waitForTimeout(2400);
  decir(await z.evaluate(() => !document.getElementById('app').classList.contains('oculto')),
    'con un `ir` inventado se entra igual, al portafolio de siempre');
  await z.close();
  await q.close();
}

titulo('sin errores de JavaScript');
decir(errores.length === 0, 'la consola quedó limpia', errores.slice(0, 3).join(' | '));

await nav.close();
sv.close();
console.log(fallos ? `\n${fallos} en rojo.\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
