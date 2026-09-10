/* LA VENTA DE ORIGEN POR USDT, contra un API fingido y en un navegador.
 *
 *   node apps-web/ordenex/pruebas/probar-vender.mjs
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
 *   1. Que la cotización se pida DE VERDAD y que lo que la casa dice que va a
 *      pagar sea el NETO, con la comisión ya descontada. Si ahí fuera el
 *      bruto, cada venta terminaría en un reclamo.
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
/* Los terminos: la casa los exige antes de la PRIMERA operacion de una cuenta.
   Arranca en false para poder recorrer el camino de verdad. */
const TERMINOS_V = '2026-09-02';
let terminosAceptados = true;

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
    /* `terminos` viaja acá porque es de donde lo lee ONX.pedirTerminos para
       saber QUÉ versión pedir y a qué páginas enlazar. Faltaba en este
       fingido, y por eso ninguna prueba veía el camino de los términos. */
    return json(r, 200, { desvio: { avisoPct: 5, bloqueoPct: 20 },
                          terminos: { version: TERMINOS_V, terminos: 'legal.html#terminos', riesgo: 'legal.html#riesgo' },
                          redes: [{ id: 56, nombre: 'BNB Smart Chain', minimoUsd: 2 }] });
  }
  if (q.method === 'GET' && ruta === '/auth/terminos') {
    return json(r, 200, { version: TERMINOS_V, terminos: 'legal.html#terminos', riesgo: 'legal.html#riesgo', aceptada: terminosAceptados });
  }
  if (q.method === 'POST' && ruta === '/auth/terminos') {
    const c = await cuerpoDe(q);
    if (c.version !== TERMINOS_V) return json(r, 409, { error: 'Otra version.', codigo: 'VERSION_VIEJA' });
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
  /* El techo: lo que la caja de la casa puede pagar AHORA. 9 USDT libres —los
     10 de la caja menos el apartado de 1— que al neto por ORIGEN dan 3,5423… */
  if (q.method === 'GET' && ruta === '/ventas/limites') {
    const neto = (BigInt(PRECIO_WEI) * BigInt(1000000 - PPM)) / 1000000n;
    return json(r, 200, { encendida: ventaAbierta, precioWei: PRECIO_WEI, precioUsd: 2.566148,
      netoPorOrigen: neto.toString(), comisionPpm: PPM,
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
/* «Failed to load resource» no se cuenta: son las fuentes de fuera (el
   navegador de esta caja no sale a internet) y los 502 que esta misma prueba
   provoca a proposito para ver como se enseñan. Lo que si se cuenta es un
   error de JavaScript de verdad, que es lo que deja un boton muerto sin
   rastro. */
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });

await p.goto(`${ORIGEN_URL}/index.html#sso=${TOKEN_SSO}`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1800);

titulo('la pantalla de vender abre y trae el saldo');
await p.evaluate(() => ONX.vista('vender'));
await p.waitForTimeout(1200);
decir(await p.evaluate(() => !!document.getElementById('vn-cant')), 'aparece con su campo de cantidad');
decir(await p.evaluate(() => /500/.test(document.getElementById('vn-izq').innerText)),
  'y enseña el ORIGEN que hay en Ordenex', await p.evaluate(() => document.getElementById('vn-izq').innerText.slice(0, 160)));
decir(await p.evaluate(() => /BNB|BSC/.test(document.getElementById('vn-izq').innerText)),
  'con la red que la casa tiene abierta');

titulo('cotizar: el número grande es el NETO');
llamadas = [];
await p.fill('#vn-cant', '100');
await p.waitForTimeout(900);
{
  const pedidas = llamadas.filter((l) => l.ruta === '/ventas/cotizar');
  decir(pedidas.length >= 1, 'se pide la cotización al servidor', JSON.stringify(pedidas[0] || {}));
  decir(pedidas.at(-1)?.cuerpo?.origenWei === wei(100), 'con la cantidad en wei', pedidas.at(-1)?.cuerpo?.origenWei);
  const c = cotizacion(wei(100));
  // 100 ORIGEN × 2,566148 = 256,6148 brutos; el 1 % son 2,566148; quedan 254,048652
  const texto = await p.evaluate(() => document.getElementById('vn-izq').innerText);
  decir(/254\.048/.test(texto), 'el neto sale en pantalla (254,048…)', texto.slice(-260));
  decir(/256\.6148/.test(texto), 'y el bruto también, en su renglón');
  decir(/2\.566148/.test(texto), 'con la comisión visible');
  decir(BigInt(c.netoCanonico) < BigInt(c.brutoCanonico), 'y el neto es menor que el bruto');
}

titulo('vender manda lo que el servidor necesita');
llamadas = [];
await p.fill('#vn-dir', AFUERA);
await p.waitForTimeout(300);
await p.evaluate(() => VVENTA.vender());
await p.waitForTimeout(1200);
{
  const v = llamadas.filter((l) => l.ruta === '/ventas');
  decir(v.length === 1, 'se llama POST /ventas una vez', String(v.length));
  const c = v[0]?.cuerpo || {};
  decir(c.origenWei === wei(100), 'con el ORIGEN en wei', c.origenWei);
  decir(Number(c.red) === 56, 'con la red elegida', String(c.red));
  decir(c.direccion === AFUERA, 'con la dirección de destino', c.direccion);
  decir(typeof c.ventaKey === 'string' && c.ventaKey.length >= 8,
    'y con una ventaKey con cuerpo: sin ella el servidor no puede impedir el doble pago', c.ventaKey);
  const texto = await p.evaluate(() => document.getElementById('vn-izq').innerText);
  decir(/Pagado/.test(texto), 'la pantalla dice que se pagó', texto.slice(0, 200));
  decir(await p.evaluate(() => !!document.querySelector('#vn-izq a[href*="bscscan"]')),
    'con el enlace a la transacción');
}

titulo('un reintento NO estrena clave');
{
  await p.evaluate(() => VVENTA.otra());
  await p.waitForTimeout(600);
  await p.fill('#vn-cant', '10');
  await p.waitForTimeout(900);
  await p.fill('#vn-dir', AFUERA);
  await p.waitForTimeout(200);
  // El primer intento falla por red, que es cuando la gente vuelve a tocar.
  siguienteFalla = { error: 'El servidor no contestó.', codigo: 'ERROR', status: 502 };
  llamadas = [];
  await p.evaluate(() => VVENTA.vender());
  await p.waitForTimeout(900);
  await p.evaluate(() => VVENTA.vender());   // vuelve a tocar, sin pasar por «otra»
  await p.waitForTimeout(900);
  const claves = llamadas.filter((l) => l.ruta === '/ventas').map((l) => l.cuerpo.ventaKey);
  decir(claves.length === 2 && claves[0] === claves[1],
    'los dos intentos van con la MISMA ventaKey', claves.join(' / '));
}

titulo('lo que no se puede vender');
{
  await p.evaluate(() => VVENTA.otra());
  await p.waitForTimeout(700);
  // Más de lo que hay.
  await p.fill('#vn-cant', '999999');
  await p.waitForTimeout(700);
  const texto = await p.evaluate(() => document.getElementById('vn-izq').innerText);
  decir(/No tenés tanto/.test(texto), 'pedir más de lo que hay se dice antes de tocar nada', texto.slice(0, 200));
  decir(await p.evaluate(() => document.querySelector('.vn-btn')?.disabled === true), 'y el botón queda apagado');

  // Sin dirección.
  await p.fill('#vn-cant', '10');
  await p.fill('#vn-dir', '');
  await p.waitForTimeout(800);
  decir(await p.evaluate(() => document.querySelector('.vn-btn')?.disabled === true),
    'sin dirección de destino tampoco se puede confirmar');
}

titulo('un pago en duda pide NO repetir');
{
  await p.fill('#vn-cant', '10');
  await p.waitForTimeout(800);
  await p.fill('#vn-dir', AFUERA);
  await p.waitForTimeout(200);
  siguienteFalla = { error: 'El pago quedó en duda y lo está mirando una persona.', codigo: 'EN_DUDA', status: 502 };
  await p.evaluate(() => VVENTA.vender());
  await p.waitForTimeout(1000);
  const texto = await p.evaluate(() => document.getElementById('vn-izq').innerText);
  decir(/duda/i.test(texto), 'se dice que quedó en duda', texto.slice(0, 200));
  decir(/No lo repitas/i.test(texto), 'y se pide expresamente NO repetir', texto.slice(0, 260));
}

titulo('sin saldo se dice dónde está el ORIGEN');
{
  saldo = '0';
  await p.evaluate(() => VVENTA.otra());
  await p.waitForTimeout(900);
  const texto = await p.evaluate(() => document.getElementById('vn-izq').innerText);
  decir(/en Ordenex/.test(texto) && /Veta Wallet/.test(texto),
    'no es un cero mudo: dice que se vende lo que está en Ordenex', texto.slice(0, 240));
  decir(texto.includes(DEPOSITO), 'y enseña la dirección de depósito para traerlo', texto.slice(0, 240));
}

titulo('el techo de la caja se dice ANTES, no con un error después');
{
  saldo = wei(500);
  await p.evaluate(() => VVENTA.otra());
  await p.waitForTimeout(700);
  const izq = () => p.evaluate(() => document.getElementById('vn-izq').innerText);
  decir(/3\.542/.test(await izq()), 'el máximo que la casa puede pagar sale en pantalla sin escribir nada', (await izq()).slice(0, 260));
  // Por debajo del techo se puede seguir; por encima, no, y se dice cuánto es.
  await p.fill('#vn-cant', '2'); await p.waitForTimeout(900);
  await p.fill('#vn-dir', AFUERA); await p.waitForTimeout(300);
  decir(await p.evaluate(() => document.querySelector('.vn-btn')?.disabled === false), 'con 2 ORIGEN, por debajo del techo, se puede confirmar');
  await p.fill('#vn-cant', '5'); await p.waitForTimeout(900);
  decir(await p.evaluate(() => document.querySelector('.vn-btn')?.disabled === true), 'con 5, por encima, el botón se apaga');
  decir(/La casa no puede pagar tanto/.test(await izq()), 'y se dice por qué y cuál es el máximo', (await izq()).slice(-260));
}

titulo('las partes del saldo');
{
  saldo = wei(500);
  await p.evaluate(() => VVENTA.otra());
  await p.waitForTimeout(700);
  await p.evaluate(() => VVENTA.parte(25));
  await p.waitForTimeout(500);
  decir((await p.evaluate(() => document.getElementById('vn-cant').value)) === '125',
    'el 25 % de 500 ORIGEN son 125', await p.evaluate(() => document.getElementById('vn-cant').value));
  await p.evaluate(() => VVENTA.todo());
  await p.waitForTimeout(500);
  decir((await p.evaluate(() => document.getElementById('vn-cant').value)) === '500',
    '«vender todo» sigue siendo el saldo entero, sin polvo', await p.evaluate(() => document.getElementById('vn-cant').value));
}

titulo('a 390 px no se sale nada');
{
  /* La dirección es una tira de 42 caracteres sin espacios, y es lo que más
     fácil empuja una caja fuera de la pantalla. En un teléfono eso deja el
     botón de confirmar a medio salir, que en la pantalla por donde sale el
     dinero es exactamente donde no puede pasar. */
  saldo = wei(500);
  await p.evaluate(() => VVENTA.otra());
  await p.waitForTimeout(800);
  await p.setViewportSize({ width: 390, height: 850 });
  await p.waitForTimeout(500);
  await p.fill('#vn-cant', '100'); await p.waitForTimeout(900);
  await p.fill('#vn-dir', AFUERA); await p.waitForTimeout(400);
  const d = await p.evaluate(() => {
    const fuera = [];
    document.querySelectorAll('#vn-izq *, #vn-der *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > 391) fuera.push((el.className || el.tagName) + ' ' + Math.round(r.right));
    });
    return { doc: document.documentElement.scrollWidth, fuera: fuera.slice(0, 4) };
  });
  if (process.env.ONX_DIAG) {
    console.log(await p.evaluate(() => {
      const l = [];
      let el = document.querySelector('#vn-izq .cp-caja');
      while (el && el !== document.body) { const r = el.getBoundingClientRect(); l.push(`${el.tagName}.${el.className} w=${Math.round(r.width)} r=${Math.round(r.right)}`); el = el.parentElement; }
      return l.join('\n');
    }));
  }
  decir(d.doc <= 390, 'la página no se desplaza a lo ancho', `documento ${d.doc}px`);
  decir(d.fuera.length === 0, 'y ningún trozo de la pantalla se sale', d.fuera.join(' · '));
  const botonVisible = await p.evaluate(() => {
    const b = document.querySelector('.vn-btn');
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.left >= 0 && r.right <= 391 && r.width > 100;
  });
  decir(botonVisible, 'y el botón de confirmar entra entero');
  await p.setViewportSize({ width: 1280, height: 950 });
  await p.waitForTimeout(400);
}

titulo('los términos se piden DONDE se chocan, no como un aviso sin salida');
{
  /* José, 5-sep: «me dice tengo que aceptar políticas y no hay nada, no
     aparece dónde, y no puedo comprar ni vender».
     El API contesta 403 TERMINOS_NO_ACEPTADOS antes de la primera operación
     de una cuenta. Fiat y la sala de mercado abrían el diálogo; comprar y
     vender NO — así que el mensaje salía como un aviso suelto y la pantalla
     no ofrecía un solo sitio donde aceptar. Un callejón sin salida. */
  saldo = wei(500);
  terminosAceptados = false;
  siguienteFalla = { status: 403, error: 'Antes de operar hay que aceptar los términos y condiciones y el aviso de riesgo vigentes.',
                     codigo: 'TERMINOS_NO_ACEPTADOS', version: TERMINOS_V };
  await p.evaluate(() => VVENTA.otra());
  await p.waitForTimeout(700);
  await p.fill('#vn-cant', '2'); await p.waitForTimeout(900);
  await p.fill('#vn-dir', AFUERA); await p.waitForTimeout(300);
  const antes = llamadas.filter((l) => l.ruta === '/ventas').length;
  await p.evaluate(() => VVENTA.vender());
  await p.waitForTimeout(1200);
  decir(await p.evaluate(() => !!document.getElementById('onx-terminos')),
    'al chocar con los términos se ABRE el diálogo para aceptarlos, en vez de un aviso sin salida');
  const caja = await p.evaluate(() => document.getElementById('onx-terminos')?.innerText || '');
  decir(/[Aa]cept/.test(caja), 'y el diálogo trae con qué aceptar', caja.slice(0, 120));

  // El botón de aceptar nace APAGADO hasta que se marca la casilla: la puerta
  // no se abre sin el gesto, y eso también se comprueba.
  decir(await p.evaluate(() => document.getElementById('onx-term-ok')?.disabled === true),
    'y aceptar nace apagado: sin marcar la casilla no se acepta nada');
  await p.check('#onx-term-check');
  decir(await p.evaluate(() => document.getElementById('onx-term-ok')?.disabled === false),
    'al marcarla se enciende');
  await p.click('#onx-term-ok');
  await p.waitForTimeout(1800);
  const despues = llamadas.filter((l) => l.ruta === '/ventas').slice(antes);
  decir(despues.length === 2, 'al aceptar se reintenta la venta sola: no se le hace teclear todo de nuevo',
    `intentos: ${despues.length}`);
  decir(despues.length === 2 && despues[0].cuerpo.ventaKey === despues[1].cuerpo.ventaKey,
    'y el reintento reusa LA MISMA ventaKey: aceptar los términos no puede pagar dos veces',
    `${despues[0]?.cuerpo?.ventaKey} vs ${despues[1]?.cuerpo?.ventaKey}`);
  decir(await p.evaluate(() => !document.getElementById('onx-terminos')), 'y el diálogo se cierra');
  terminosAceptados = true;
}

titulo('el monto se puede TECLEAR: el campo no se pierde debajo de los dedos');
{
  /* EL BUG QUE ESTAS PRUEBAS NO VEÍAN, Y POR QUÉ.
   *
   * José, 5-sep: «el botón para seleccionar el monto se regresa y no se
   * mantiene bien». Todas las pruebas de arriba usan p.fill(), que pone el
   * valor DE GOLPE — y de golpe nunca falla. Una persona teclea de a una, y
   * esta pantalla se repinta entera en cada tecla y otra vez cuando vuelve la
   * cotización 400 ms después. Cada repintado destruía el <input> y creaba uno
   * nuevo: el foco se perdía y lo siguiente que se escribía no llegaba.
   *
   * Así que acá se teclea como una persona, con el freno de la cotización
   * cayendo en medio, y se exige que lo escrito esté entero y que el campo
   * siga siendo el campo. */
  saldo = wei(500);
  await p.evaluate(() => VVENTA.otra());
  await p.waitForTimeout(700);
  await p.click('#vn-cant');
  await p.locator('#vn-cant').pressSequentially('12', { delay: 60 });
  // El hueco deja que caiga la cotización (400 ms) y repinte en medio.
  await p.waitForTimeout(700);
  await p.locator('#vn-cant').pressSequentially('.5', { delay: 60 });
  await p.waitForTimeout(900);
  decir(await p.evaluate(() => document.getElementById('vn-cant')?.value) === '12.5',
    'lo tecleado con la cotización cayendo en medio queda entero',
    await p.evaluate(() => document.getElementById('vn-cant')?.value));
  decir(await p.evaluate(() => document.activeElement?.id) === 'vn-cant',
    'y el cursor sigue en el campo, no en el limbo',
    await p.evaluate(() => document.activeElement?.id));

  // Y el atajo del porcentaje: se toca 25 % y el monto tiene que QUEDARSE,
  // también después de que vuelvan la cotización y la capacidad.
  await p.evaluate(() => VVENTA.parte(25));
  await p.waitForTimeout(1200);
  const v25 = await p.evaluate(() => document.getElementById('vn-cant')?.value);
  decir(v25 === '125', 'el 25 % de 500 pone 125 y ahí se queda tras la cotización', String(v25));

  // La dirección sufría lo mismo: es el otro campo de texto de la pantalla.
  await p.evaluate(() => { document.getElementById('vn-dir').value = ''; VVENTA.destino(''); });
  await p.click('#vn-dir');
  await p.locator('#vn-dir').pressSequentially('0x1234', { delay: 40 });
  await p.waitForTimeout(600);
  decir(await p.evaluate(() => document.getElementById('vn-dir')?.value) === '0x1234',
    'y la dirección tecleada también queda entera',
    await p.evaluate(() => document.getElementById('vn-dir')?.value));
}

/* Con ONX_FOTO puesta se guardan capturas de la pantalla. No es parte de la
   prueba: es para poder MIRAR el diseño sin tener que desplegar. */
if (process.env.ONX_FOTO) {
  saldo = wei(500);
  await p.evaluate(() => VVENTA.otra());
  await p.waitForTimeout(800);
  await p.fill('#vn-cant', '100'); await p.waitForTimeout(900);
  await p.fill('#vn-dir', AFUERA); await p.waitForTimeout(400);
  await p.screenshot({ path: `${process.env.ONX_FOTO}/vender-escritorio.png` });
  await p.setViewportSize({ width: 390, height: 850 }); await p.waitForTimeout(600);
  await p.screenshot({ path: `${process.env.ONX_FOTO}/vender-movil.png` });
  await p.setViewportSize({ width: 1280, height: 950 });
}

titulo('sin errores de JavaScript en todo el recorrido');
decir(errores.length === 0, 'ninguno', errores.slice(0, 3).join(' | '));

await nav.close();
sv.close();
console.log(`\n${fallos ? `FALLARON ${fallos}` : 'Todo en verde'}`);
process.exit(fallos ? 1 : 0);
