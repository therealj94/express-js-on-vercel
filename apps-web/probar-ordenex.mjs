/* La casa de cambio, recorrida de punta a punta por un navegador de verdad.
 *
 *   node apps-web/probar-ordenex.mjs
 *
 * Esta prueba es LA VARA del contrato (infra/ordenex-api/DISENO.md): levanta
 * la web tal cual se sirve en producción y, en el MISMO origen, un API fingido
 * que contesta exactamente las rutas del contrato. En el mismo origen y no en
 * otro puerto a propósito: la CSP de index.html (connect-src 'self' + el API
 * real) es parte de lo que se prueba, y un API de ensayo en otro puerto la
 * esquivaría en vez de atravesarla.
 *
 * Los datos fingidos son EVIDENTES a propósito —cantidades 111 y 222—: si un
 * 111 aparece donde no se sembró, se ve a simple vista de dónde salió. Y el
 * API fingido incluye una trampa deliberada: manda el número de cuenta de los
 * agentes, que el contrato promete NO mandar, para comprobar que la web
 * tampoco lo pintaría si un backend descuidado lo filtrara.
 *
 * Lo que se comprueba no es que la página pinte: es que la casa cumpla sus
 * reglas delante de un desconocido y de un cliente — todo lo público se ve
 * sin sesión, la sesión llega SOLO por el canje SSO contra el API, el dinero
 * viaja en wei y se convierte recién al pintar, y cambiar de idioma no deja
 * ninguna clave de diccionario colgando en la pantalla.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), 'ordenex');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
                '.woff2': 'font/woff2', '.woff': 'font/woff' };

// ── los datos fingidos: 111 y 222, y ni un número discreto ─────────────────
const U = 10n ** 18n;
const wei = n => (BigInt(n) * U).toString();

const TOKEN_SSO = 'token-sso-fingido-111';
const JWT = 'jwt-fingido-111';
const REFRESH = 'refresco-fingido-222';
// La dirección alterna letras a propósito: la prueba busca tiras largas de
// dígitos como delatoras de cuentas bancarias o wei sin convertir, y una
// dirección toda numérica sería un falso positivo sembrado por nosotros.
const DIRECCION_DEP = '0x' + 'a111'.repeat(10);
const CUENTA_TRAMPA = '9998887766';

const MERCADOS = [
  { mercado: 'AUKA-ORIGEN', ultimo: wei(111), cambio24h: 1.11, vol24h: wei(222), referencia: { usd: 222, rotulo: 'onza oro', origenUsd: 2.56, fuente: 'fingido', en: Date.now() } },
  { mercado: 'AGKA-ORIGEN', ultimo: wei(222), cambio24h: -2.22, vol24h: wei(111), referencia: { usd: 111, rotulo: 'onza plata', origenUsd: 2.56, fuente: 'fingido', en: Date.now() } },
];

// Mejor compra primero y mejor venta primero, como promete el contrato.
const LIBRO = {
  compras: [[wei(110), wei(222)], [wei(109), wei(111)], [wei(108), wei(222)], [wei(107), wei(111)], [wei(106), wei(222)]],
  ventas: [[wei(112), wei(111)], [wei(113), wei(222)], [wei(114), wei(111)], [wei(115), wei(222)], [wei(116), wei(111)]],
};

// Velas sintéticas que alternan subida y bajada: así el lienzo tiene que
// pintar cuerpos jade Y coral, y el muestreo de píxeles puede exigir ambos.
const VELAS_FINGE = (() => {
  const filas = [];
  const t0 = Math.floor(Date.now() / 1000) - 40 * 3600;
  for (let i = 0; i < 40; i++) {
    const sube = i % 2 === 0;
    filas.push([t0 + i * 3600, wei(sube ? 110 : 112), wei(113), wei(109), wei(sube ? 112 : 110), wei(222)]);
  }
  return filas;
})();

const TRATOS = [
  { precio: wei(111), cantidad: wei(222), lado: 'compra', en: Date.now() - 60000 },
  { precio: wei(112), cantidad: wei(111), lado: 'venta', en: Date.now() - 120000 },
  { precio: wei(111), cantidad: wei(222), lado: 'compra', en: Date.now() - 180000 },
];

// La trampa: el contrato dice que /fiat/agentes va SIN números de cuenta.
// El fingido lo manda igual, para probar que la web no lo pinta ni filtrado.
const AGENTES = [
  { id: 'agente-111', nombre: 'Agente Fingido Uno', bancos: [{ banco: 'Banco Fingido', titular: 'Agente Fingido Uno', cuenta: CUENTA_TRAMPA }], monedas: ['HNL'], activo: true },
  { id: 'agente-222', nombre: 'Agente Fingido Dos', bancos: [{ banco: 'Banco Fingido Dos', titular: 'Agente Fingido Dos', cuenta: CUENTA_TRAMPA }], monedas: ['USD'], activo: true },
];

const PORTAFOLIO = {
  cuentas: [
    { activo: 'ORIGEN', disponible: wei(111), reservado: '0' },
    { activo: 'AUKA', disponible: wei(222), reservado: '0' },
  ],
  direccionDeposito: DIRECCION_DEP,
};

// ── el servidor: la web estática y el API fingido, un solo origen ──────────

const llamadas = [];          // lo que la web le pidió al API, para auditarlo
const ordenesFingidas = [];   // el «libro» del fingido: lo colocado, abierto

const json = (r, codigo, obj) => {
  r.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  r.end(JSON.stringify(obj));
};
const cuerpoDe = q => new Promise(res => {
  let t = '';
  q.on('data', d => { t += d; });
  q.on('end', () => { try { res(JSON.parse(t || '{}')); } catch { res({}); } });
});
const conSesion = q => (q.headers.authorization || '') === 'Bearer ' + JWT;

/* El API contesta el contrato y NADA más: una ruta que no está en DISENO.md
   cae al servidor estático y de ahí al 404 — si la web pide algo fuera del
   contrato, esta prueba lo va a enseñar como un fallo, que es lo que es. */
async function api(q, r, ruta, busca) {
  const un = ruta.match(/^\/mercados\/([^/]+)\/(libro|velas|tratos)$/);

  if (q.method === 'GET' && ruta === '/mercados') return json(r, 200, MERCADOS);
  if (q.method === 'GET' && un) {
    llamadas.push({ ruta, metodo: 'GET' });
    if (un[2] === 'libro') return json(r, 200, LIBRO);
    if (un[2] === 'velas') return json(r, 200, VELAS_FINGE);
    return json(r, 200, TRATOS);
  }

  if (q.method === 'POST' && ruta === '/auth/sso') {
    const { token } = await cuerpoDe(q);
    llamadas.push({ ruta, metodo: 'POST', token });
    if (token !== TOKEN_SSO) return json(r, 401, { error: 'El token SSO no vale.', codigo: 'SSO_INVALIDO' });
    return json(r, 200, { token: JWT, refreshToken: REFRESH, usuario: { userId: 'usuario-111', gid: 'GID-FINGIDO-111' } });
  }
  if (q.method === 'POST' && ruta === '/auth/refresh') {
    const { refreshToken } = await cuerpoDe(q);
    if (refreshToken !== REFRESH) return json(r, 401, { error: 'Refresh inválido.', codigo: 'REFRESH_INVALIDO' });
    return json(r, 200, { token: JWT, refreshToken: REFRESH });
  }

  if (q.method === 'GET' && ruta === '/fiat/agentes') {
    llamadas.push({ ruta, metodo: 'GET' });
    const m = busca.get('moneda');
    return json(r, 200, m ? AGENTES.filter(a => a.monedas.includes(m)) : AGENTES);
  }

  /* Las rutas con candado 🔒 del contrato, y SOLO ellas: el 401 se contesta
     únicamente a una ruta del API — un guion más ancho aquí se tragaría los
     archivos estáticos de la propia web, que viven en el mismo origen. */
  const borra = ruta.match(/^\/ordenes\/([^/]+)$/);
  const guardada = ['/portafolio', '/movimientos', '/ordenes', '/fiat/solicitudes'].includes(ruta) || !!borra;
  if (!guardada) return null; // no era del API: que lo intente el estático
  if (!conSesion(q)) return json(r, 401, { error: 'Sin sesión.', codigo: 'SIN_SESION' });

  if (q.method === 'GET' && ruta === '/portafolio') {
    llamadas.push({ ruta, metodo: 'GET', auth: true });
    return json(r, 200, PORTAFOLIO);
  }
  if (q.method === 'GET' && ruta === '/movimientos') return json(r, 200, []);
  if (q.method === 'POST' && ruta === '/ordenes') {
    const o = await cuerpoDe(q);
    llamadas.push({ ruta, metodo: 'POST', cuerpo: o });
    const orden = { id: 'orden-fingida-' + (ordenesFingidas.length + 111), mercado: o.mercado, lado: o.lado,
      tipo: o.tipo, precio: o.precio ?? null, cantidad: o.cantidad, resta: o.cantidad, estado: 'abierta', en: new Date().toISOString() };
    ordenesFingidas.push(orden);
    return json(r, 200, orden);
  }
  if (q.method === 'GET' && ruta === '/ordenes') return json(r, 200, ordenesFingidas);
  if (q.method === 'DELETE' && borra) {
    const i = ordenesFingidas.findIndex(o => o.id === decodeURIComponent(borra[1]));
    if (i < 0) return json(r, 404, { error: 'No existe esa orden.', codigo: 'ORDEN_NO_EXISTE' });
    return json(r, 200, { ...ordenesFingidas.splice(i, 1)[0], estado: 'cancelada' });
  }
  if (q.method === 'GET' && ruta === '/fiat/solicitudes') return json(r, 200, []);
  return json(r, 405, { error: 'Método no contemplado en el contrato.', codigo: 'METODO_INVALIDO' });
}

const sv = createServer(async (q, r) => {
  const [soloRuta, cola] = q.url.split('?');
  const ruta = decodeURIComponent(soloRuta);
  const contestada = await api(q, r, ruta, new URLSearchParams(cola || ''));
  if (contestada !== null) return;
  try {
    const p = join(RAIZ, ruta.replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((res) => sv.listen(0, res));
const ORIGEN_LOCAL = `http://127.0.0.1:${sv.address().port}`;
const BASE = `${ORIGEN_LOCAL}/index.html`;

// ── decir/comprobar, como toda prueba de la casa ───────────────────────────
let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 140)}`);
};

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });

const errores = [];
p.on('pageerror', e => errores.push('pageerror: ' + e.message));
p.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // Un asset que falta en el disco de prueba es ruido; una CSP violada o un
  // fetch rebotado es exactamente lo que esta lista tiene que atrapar.
  if (/Failed to load resource|net::ERR|ERR_/.test(t)) return;
  errores.push('consola: ' + t);
});

/* La web apunta su API y su wallet a este origen ANTES de que cargue ningún
   guion — el mismo agujero de configuración (ONX_API / ONX_WALLET) que la
   propia casa dejó para poder probarse sin tocar producción. */
await p.addInitScript((origen) => { window.ONX_API = origen; window.ONX_WALLET = origen; }, ORIGEN_LOCAL);

/* El detector de claves sueltas: una clave de diccionario que quedó sin
   traducir se pinta como ella misma («pt.mvCambio»), porque t() cae al nombre.
   Se buscan las dos huellas: el patrón xx.yy en el texto visible, y cualquier
   [data-t] cuyo texto sea exactamente su propia clave. */
const clavesSueltas = () => p.evaluate(() => {
  const texto = document.body.innerText || '';
  const candidatos = texto.match(/[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+/g) || [];
  const tld = new Set(['com', 'org', 'net', 'link', 'app', 'io', 'co', 'me', 'es', 'en']);
  const porTexto = candidatos.filter(c => {
    const partes = c.split('.');
    if (partes.length !== 2) return false;              // un dominio largo no es una clave
    if (!/^[a-z]{2,6}$/.test(partes[0])) return false;  // los prefijos del diccionario son cortos y minúsculos
    if (partes[1].length < 2 || tld.has(partes[1].toLowerCase())) return false;
    return true;
  });
  const porDataT = [...document.querySelectorAll('[data-t]')]
    .filter(el => el.getClientRects().length && el.textContent.trim() === el.dataset.t)
    .map(el => el.dataset.t);
  return [...new Set([...porTexto, ...porDataT])];
});

await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1400);
await p.evaluate(() => ONX.idioma('es'));
await p.waitForTimeout(500);

// ── 1 · la portada: el mercado respirando y una sola puerta ────────────────
console.log('\n── la portada ────────────────────────────────────────────────');
{
  const filas = await p.evaluate(() => document.querySelectorAll('#mv-cuerpo tr').length);
  decir(filas === 2, 'la tabla viva pinta los dos mercados del API fingido', `filas: ${filas}`);

  const fila1 = await p.evaluate(() => {
    const tr = document.querySelector('#mv-cuerpo tr');
    return tr && { par: tr.querySelector('.mv-par b')?.textContent, num: tr.querySelector('.mv-num')?.textContent || '' };
  });
  decir(fila1?.par === 'AUKA' && /\b111\b/.test(fila1?.num || ''), 'AUKA muestra su último 111, ya convertido de wei', JSON.stringify(fila1));
  decir(/ref\./.test(fila1?.num || '') && /\$222\.00/.test(fila1?.num || ''), 'y la referencia 222 va ROTULADA en dólares, no suelta como si fuera un trato');

  const pastillas = await p.evaluate(() => ({
    sube: document.querySelector('#mv-cuerpo .pastilla.sube-p')?.textContent,
    baja: document.querySelector('#mv-cuerpo .pastilla.baja-p')?.textContent,
  }));
  decir(pastillas.sube === '+1.11%' && pastillas.baja === '-2.22%', 'el 24h sube en jade y baja en coral', JSON.stringify(pastillas));

  const sso = await p.evaluate(() => {
    const b = document.querySelector('button[data-t="pt.entrar"]');
    return b && { txt: b.textContent, onclick: b.getAttribute('onclick') || '' };
  });
  decir(!!sso && /Veta Wallet/.test(sso.txt) && /ONX\.entrar/.test(sso.onclick), 'la única puerta es el SSO de la wallet', sso?.txt);
  const nota = await p.evaluate(() => document.querySelector('.bv-nota')?.textContent || '');
  decir(/contraseñas/.test(nota), 'y al lado dice la verdad: Ordenex no guarda contraseñas');
}

// ── 2 · a los mercados sin sesión: todo lo público se ve ───────────────────
console.log('\n── mercados, sin sesión ──────────────────────────────────────');
{
  await p.click('button[data-t="pt.ver"]');
  await p.waitForTimeout(900);
  const dentro = await p.evaluate(() => ({
    app: !document.querySelector('#app').classList.contains('oculto'),
    portada: document.querySelector('#portada').classList.contains('oculto'),
  }));
  decir(dentro.app && dentro.portada, '«ver los mercados» entra sin pedir cuenta');

  const filas = await p.evaluate(() => document.querySelectorAll('#ms-cuerpo tr').length);
  decir(filas === 14, 'los catorce mercados están SIEMPRE en pantalla, con guion donde no hay dato', `filas: ${filas}`);
  const auka = await p.evaluate(() => document.querySelector('#ms-cuerpo tr')?.textContent || '');
  decir(/AUKA/.test(auka) && /\b111\b/.test(auka) && /222 AUKA/.test(auka), 'la fila de AUKA trae último 111 y volumen 222', auka);
}

// ── 3 · un mercado abierto: velas pintadas, libro con filas, invitación ────
console.log('\n── AUKA-ORIGEN abierto, sin sesión ───────────────────────────');
{
  await p.click('#ms-cuerpo tr');
  await p.waitForTimeout(1200);
  decir(await p.evaluate(() => location.hash) === '#mercado/AUKA-ORIGEN', 'la barra de direcciones nombra el mercado');
  decir(/\b111\b/.test(await p.evaluate(() => document.querySelector('#vm-ultimo')?.textContent || '')), 'la cabecera dice el último: 111');

  /* El muestreo de píxeles: no alcanza con que el canvas exista — tiene que
     tener TINTA. Y como las velas fingidas alternan subida y bajada, tiene
     que haber tinta jade y tinta coral: un lienzo de un solo color sería una
     gráfica que no distingue comprar de vender. */
  const pintura = await p.evaluate(() => {
    const c = document.querySelector('#vm-velas');
    if (!c || !c.width || !c.height) return null;
    const img = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let tinta = 0, jade = 0, coral = 0;
    const colores = new Set();
    for (let i = 0; i < img.length; i += 16) {
      const r = img[i], g = img[i + 1], b = img[i + 2];
      if (img[i + 3] < 24) continue;
      tinta++;
      colores.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      if (g > 140 && g > r + 30 && g > b + 20) jade++;
      if (r > 170 && r > g + 40 && r > b + 40) coral++;
    }
    return { tinta, colores: colores.size, jade, coral, w: c.width, h: c.height };
  });
  decir(!!pintura && pintura.tinta > 400 && pintura.colores >= 4, 'el canvas de velas tiene tinta de verdad', JSON.stringify(pintura));
  decir(!!pintura && pintura.jade > 0 && pintura.coral > 0, 'y distingue subida (jade) de bajada (coral)');

  const libro = await p.evaluate(() => ({
    ventas: document.querySelectorAll('#vm-ventas .vm-fila').length,
    compras: document.querySelectorAll('#vm-compras .vm-fila').length,
    mejorVenta: document.querySelector('#vm-ventas .vm-fila:last-child .vm-p')?.textContent,
    medio: document.querySelector('#vm-medio')?.textContent || '',
    txt: document.querySelector('#vm-compras')?.textContent || '',
  }));
  decir(libro.ventas === 5 && libro.compras === 5, 'el libro pinta sus cinco niveles por lado', JSON.stringify(libro));
  decir(libro.mejorVenta === '112', 'con la mejor venta pegada al centro', libro.mejorVenta);
  decir(/\b222\b/.test(libro.txt) && /\b111\b/.test(libro.txt), 'y las cantidades 111/222 convertidas de wei');
  decir(/\b111\b/.test(libro.medio), 'el medio del libro dice el último');

  decir(await p.evaluate(() => document.querySelectorAll('#vm-tratos .vm-trato').length) === 3, 'los tratos del fingido están listados');

  // Sin sesión el formulario no se esconde: explica e invita — misma puerta
  // SSO que la portada. Y «mis órdenes» ni aparece: no hay de quién.
  const forma = await p.evaluate(() => {
    const caja = document.querySelector('#vm-form-caja');
    const btn = caja?.querySelector('button.btn-oro');
    return { manda: !!document.querySelector('#vm-enviar'), invita: btn?.getAttribute('onclick') || '', txt: caja?.textContent || '' };
  });
  decir(!forma.manda && /ONX\.entrar/.test(forma.invita), 'sin sesión el formulario invita a entrar, no manda órdenes');
  decir(/Veta Wallet/.test(forma.txt), 'y la invitación nombra la cuenta del ecosistema');
  decir(await p.evaluate(() => !document.querySelector('#vm-ordenes')), 'sin sesión no hay bloque de «mis órdenes»');

  const sueltas = await clavesSueltas();
  decir(sueltas.length === 0, 'en español no hay claves de diccionario sueltas', sueltas.join(' · '));
}

// ── 4 · un token SSO malo no deja sesión ───────────────────────────────────
console.log('\n── el canje SSO: primero con un token falso ──────────────────');
{
  await p.goto('about:blank');
  await p.goto(BASE + '#sso=token-malo', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  const consultado = llamadas.some(l => l.ruta === '/auth/sso' && l.token === 'token-malo');
  decir(consultado, 'la web le pregunta al API, no decide sola si un token vale');
  decir(await p.evaluate(() => localStorage.getItem('ordenex.sesion')) == null, 'el API dijo no y NO quedó sesión a medias');
  decir(await p.evaluate(() => document.querySelector('#app').classList.contains('oculto')), 'y la casa sigue en la portada');
}

// ── 5 · el canje bueno: sesión propia y el formulario aparece ──────────────
console.log('\n── el canje SSO bueno ────────────────────────────────────────');
{
  await p.goto('about:blank');
  await p.goto(BASE + '#sso=' + TOKEN_SSO, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1400);
  // La barra puede decir la ruta (#mercados) — lo que NO puede es decir el
  // token: quedaría en el historial y en cualquier captura compartida.
  const barra = await p.evaluate(() => location.href);
  decir(!barra.includes('sso') && !barra.includes(TOKEN_SSO), 'el token no se queda en la barra de direcciones', barra);
  const sesion = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('ordenex.sesion')); } catch { return null; } });
  decir(sesion?.token === JWT && sesion?.refreshToken === REFRESH, 'la sesión guardada es la que emitió el API', JSON.stringify(sesion || {}).slice(0, 90));
  decir(await p.evaluate(() => !document.querySelector('#app').classList.contains('oculto')), 'y el canje deja adentro de la aplicación');

  await p.evaluate(() => ONX.vista('mercado', 'AUKA-ORIGEN'));
  await p.waitForTimeout(1100);
  const forma = await p.evaluate(() => ({
    manda: !!document.querySelector('#vm-enviar'),
    precio: !!document.querySelector('#vm-precio'),
    cant: !!document.querySelector('#vm-cant'),
    ordenes: !!document.querySelector('#vm-ordenes'),
    saldo: document.querySelector('#vm-saldo')?.textContent || '',
  }));
  decir(forma.manda && forma.precio && forma.cant, 'con sesión el formulario de operar aparece entero');
  decir(forma.ordenes, 'y el bloque de «mis órdenes» también');
  decir(/\b111\b/.test(forma.saldo) && /ORIGEN/.test(forma.saldo), 'el disponible sale del /portafolio del API: 111 ORIGEN', forma.saldo);
  decir(llamadas.some(l => l.ruta === '/portafolio' && l.auth), 'y el portafolio viajó con el Bearer de la casa');

  // El flujo de compra: límite 110 × 1 (le alcanza: notional 110 ≤ 111).
  await p.fill('#vm-precio', '110');
  await p.fill('#vm-cant', '1');
  await p.click('#vm-enviar');
  await p.waitForTimeout(900);
  const orden = llamadas.find(l => l.ruta === '/ordenes' && l.metodo === 'POST')?.cuerpo;
  decir(!!orden && orden.mercado === 'AUKA-ORIGEN' && orden.lado === 'compra' && orden.tipo === 'limite',
        'la orden llegó al API como la escribió el cliente', JSON.stringify(orden || {}));
  decir(orden?.precio === wei(110) && orden?.cantidad === wei(1), 'con precio y cantidad EN WEI, sin un double en el camino');
  decir(typeof orden?.ordenKey === 'string' && orden.ordenKey.length >= 8, 'y con su ordenKey: un reintento de red no duplica una orden');
  const fila = await p.evaluate(() => document.querySelector('#vm-ordenes tr')?.textContent || '');
  decir(/110/.test(fila) && /1/.test(fila), 'la orden abierta quedó listada en «mis órdenes»', fila);
}

// ── 6 · el portafolio: saldos convertidos y el QR de depósito ──────────────
console.log('\n── el portafolio ─────────────────────────────────────────────');
{
  await p.evaluate(() => ONX.vista('portafolio'));
  await p.waitForTimeout(1100);
  const texto = await p.evaluate(() => document.querySelector('#lienzo')?.innerText || '');
  decir(/\b111\b/.test(texto) && /\b222\b/.test(texto), 'los saldos 111 y 222 están pintados, convertidos de wei');
  decir(texto.toLowerCase().includes('0xa111'), 'la dirección de depósito del API está a la vista', texto.slice(0, 120));
  decir(await p.evaluate(() => !!document.querySelector('#lienzo svg')), 'y hay un QR para cobrarla (QR.svg, sin CDN)');
  decir(!/\d{19,}/.test(texto), 'ningún monto quedó en wei crudo en la pantalla');
}

// ── 7 · fiat: agentes a la vista, cuentas bancarias jamás ──────────────────
console.log('\n── el circuito fiat ──────────────────────────────────────────');
{
  await p.evaluate(() => ONX.vista('fiat'));
  await p.waitForTimeout(1100);
  decir(llamadas.some(l => l.ruta === '/fiat/agentes'), 'la vista pide los agentes al API');
  const texto = await p.evaluate(() => document.body.innerText || '');
  decir(/Agente Fingido Uno/.test(texto), 'los agentes fingidos están listados', texto.match(/Agente[^\n]*/)?.[0]);
  /* La trampa: el fingido mandó el número de cuenta que el contrato prohíbe.
     Si aparece en pantalla, la web está pintando lo que le llega sin pensar
     — y el número de cuenta de un agente solo se enseña dentro de una
     solicitud tomada, jamás en el directorio público. */
  decir(!texto.includes(CUENTA_TRAMPA), 'el número de cuenta que el API filtró NO se pinta');
  decir(!/\d{8,}/.test(await p.evaluate(() => document.querySelector('#lienzo')?.innerText || '')),
        'y no hay ninguna tira de dígitos con pinta de cuenta bancaria');
}

// ── 8 · inglés: la casa entera cambia, sin claves colgando ─────────────────
console.log('\n── cambiar a inglés ──────────────────────────────────────────');
{
  await p.evaluate(() => ONX.idioma('en'));
  await p.waitForTimeout(500);
  for (const v of ['mercados', 'mercado', 'portafolio', 'fiat', 'actividad']) {
    await p.evaluate(cual => ONX.vista(cual), v);
    await p.waitForTimeout(600);
    const sueltas = await clavesSueltas();
    decir(sueltas.length === 0, `en «${v}» no queda ninguna clave sin traducir`, sueltas.join(' · '));
  }
  const mercadosEn = await p.evaluate(() => { ONX.vista('mercados'); return document.querySelector('#lienzo')?.innerText || ''; });
  decir(/Markets|Market/.test(mercadosEn), 'y la vista de mercados habla inglés de verdad');

  await p.evaluate(() => ONX.salir());
  await p.waitForTimeout(600);
  decir(await p.evaluate(() => localStorage.getItem('ordenex.sesion')) == null, 'salir borra la sesión');
  const portadaEn = await p.evaluate(() => document.querySelector('button[data-t="pt.entrar"]')?.textContent || '');
  decir(/Sign in with my Veta Wallet/.test(portadaEn), 'la portada quedó en inglés', portadaEn);
  const sueltas = await clavesSueltas();
  decir(sueltas.length === 0, 'y tampoco en la portada hay claves sueltas', sueltas.join(' · '));
}

decir(errores.length === 0, 'sin errores de consola en todo el recorrido', errores.join(' | '));

await nav.close(); sv.close();
console.log(malas ? `\n${malas} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
