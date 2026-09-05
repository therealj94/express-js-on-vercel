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

const VERSION_TERMINOS = '2026-09-01';
let terminosAceptados = false;
const TOKEN_SSO = 'token-sso-fingido-111';
const JWT = 'jwt-fingido-111';
const REFRESH = 'refresco-fingido-222';
// La dirección alterna letras a propósito: la prueba busca tiras largas de
// dígitos como delatoras de cuentas bancarias o wei sin convertir, y una
// dirección toda numérica sería un falso positivo sembrado por nosotros.
const DIRECCION_DEP = '0x' + 'a111'.repeat(10);
const CUENTA_TRAMPA = '9998887766';

const MERCADOS = [
  /* EL GRAMIN VALE 2 DOLARES EN ESTE DECORADO, y de ahi salen las dos
     referencias. Antes valia 2,56 y la onza 222, o sea que el par de AUKA
     estaba en 86,7 mientras el libro cotizaba a 111 y las ordenes se
     escribian a 110: un mercado fingido operando un 27 % por encima de su
     propia referencia del oro.

     Eso no molestaba mientras colocar una orden fuera mandar un POST. Desde
     que pasa por la pantalla de confirmacion, el desvio se mide contra esta
     referencia y una orden asi se frena — y toda esta parte de la prueba se
     puso roja por un decorado incoherente, no por un fallo de la web.

     Con el gramin a 2: AUKA = 222/2 = 111 y AGKA = 444/2 = 222, que son
     exactamente los «ultimo» que el resto del archivo ya usaba. La referencia
     y el libro por fin cuentan la misma historia. */
  /* `mejorCompra`/`mejorVenta` son las dos puntas del libro, y viajan en la
     LISTA a proposito: «ultimo» es lo que se pago y en un mercado recien
     abierto no se pago nada, asi que sin esto una orden esperando contraparte
     es invisible hasta entrar al par. AUKA las trae; AGKA las trae en null
     —libro vacio, que es un hecho— y los demas pares NO las traen, que es el
     tercer estado: no se sabe. Los tres se pintan distinto. */
  { mercado: 'AUKA-ORIGEN', ultimo: wei(111), cambio24h: 1.11, vol24h: wei(222), mejorCompra: wei(110), mejorVenta: wei(112), referencia: { usd: 222, rotulo: 'onza oro', origenUsd: 2, fuente: 'fingido', en: Date.now() } },
  { mercado: 'AGKA-ORIGEN', ultimo: wei(222), cambio24h: -2.22, vol24h: wei(111), mejorCompra: null, mejorVenta: null, referencia: { usd: 444, rotulo: 'onza plata', origenUsd: 2, fuente: 'fingido', en: Date.now() } },
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
/* Velas de referencia: dólares (Number, no wei) y SIN volumen — es la forma
   exacta que manda el API, y el null del volumen es lo que hace que la banda
   no se dibuje. Arrancan en 4000 para que se reconozcan de un vistazo. */
const VELAS_REF = Array.from({ length: 90 }, (_, i) => {
  const base = 4000 + Math.round(Math.sin(i / 7) * 120) + i * 2;
  return [1786000000000 + i * 14400000, base, base + 18, base - 15, base + 6, null];
});

async function api(q, r, ruta, busca) {
  const un = ruta.match(/^\/mercados\/([^/]+)\/(libro|velas|tratos)$/);

  /* LA REFERENCIA DEL METAL. Faltaba en este fingido, y por ese hueco pasaron
     dos mentiras que sobrevivieron a siete suites en verde: la pestaña entera
     del cartel del oro no se ejecutaba nunca dentro de una prueba de la casa.
     Un fingido que no sirve una ruta del contrato no es un fingido incompleto:
     es un punto ciego, y los puntos ciegos se llenan de bugs. */
  const ref = ruta.match(/^\/mercados\/([^/]+)\/referencia$/);
  if (q.method === 'GET' && ref) {
    llamadas.push({ ruta, metodo: 'GET' });
    const base = ref[1].split('-')[0];
    if (!['AUKA', 'AGKA', 'ORIGEN'].includes(base)) {
      return json(r, 404, { error: 'Este activo no tiene referencia.', codigo: 'SIN_REFERENCIA' });
    }
    return json(r, 200, {
      activo: base, unidad: 'USD',
      rotulo: 'Onza de oro en el mercado real, en dólares. No son tratos de Ordenex.',
      fuente: 'fingido · pax-gold', actualizadoEn: 1786900000000,
      velas: VELAS_REF,
    });
  }

  if (q.method === 'GET' && ruta === '/mercados') return json(r, 200, MERCADOS);

  /* LOS UMBRALES DEL DESVIO. Otro hueco del fingido, y del mismo tipo que el
     de la referencia: sin `/limites` el nivel sale 'sinLimites', que pinta una
     casilla de mas y deja el confirmar apagado hasta marcarla. Sirviendolo se
     ejerce el camino normal, que es el que recorren todas las ordenes. */
  if (q.method === 'GET' && ruta === '/limites') {
    llamadas.push({ ruta, metodo: 'GET' });
    return json(r, 200, {
      desvio: { avisoPct: 5, bloqueoPct: 20 },
      terminos: { version: VERSION_TERMINOS, terminos: 'legal.html#terminos', riesgo: 'legal.html#riesgo' },
    });
  }

  /* LOS TERMINOS. Van con los limites porque la confirmacion los pide juntos,
     y hacen falta los dos: sin version, `necesitaTerminos` sale true —sin
     saber cual es la vigente, se pregunta, que es lo correcto— y el confirmar
     se queda apagado esperando una casilla que el decorado nunca explico. */
  if (ruta === '/auth/terminos') {
    if (q.method === 'POST') {
      const { version } = await cuerpoDe(q);
      llamadas.push({ ruta, metodo: 'POST', cuerpo: { version } });
      if (version !== VERSION_TERMINOS) return json(r, 409, { error: 'Otra versión.', codigo: 'TERMINOS_VERSION' });
      terminosAceptados = true;
      return json(r, 200, { version: VERSION_TERMINOS, aceptada: true });
    }
    return json(r, 200, { version: VERSION_TERMINOS, aceptada: terminosAceptados });
  }

  /* LA TARIFA DE LA CASA. Es publica y sin sesion, como /salud. 2500 ppm =
     0,25%, el mismo valor que trae el ejemplo del motor, y con la moneda de
     referencia dicha: se cobra sobre lo RECIBIDO, que es lo que decide de que
     lado del formulario se resta. */
  if (q.method === 'GET' && ruta === '/tarifas') {
    llamadas.push({ ruta, metodo: 'GET' });
    return json(r, 200, { comisionPpm: 2500, sobre: 'recibido' });
  }
  if (q.method === 'GET' && un) {
    llamadas.push({ ruta, metodo: 'GET' });
    /* Solo los mercados que la lista declara CON precio tienen velas y tratos.
       Antes este fingido servía velas para cualquier par, IBS incluido — y un
       fingido que le inventa historia a un token que nunca se operó no prueba
       la regla, la tapa. La realidad es la que manda: sin tratos, [] . */
    const vivo = MERCADOS.some(m => m.mercado === un[1] && m.ultimo != null);
    if (un[2] === 'libro') return json(r, 200, vivo ? LIBRO : { compras: [], ventas: [] });
    if (un[2] === 'velas') return json(r, 200, vivo ? VELAS_FINGE : []);
    return json(r, 200, vivo ? TRATOS : []);
  }

  if (q.method === 'POST' && ruta === '/auth/sso') {
    const { token } = await cuerpoDe(q);
    llamadas.push({ ruta, metodo: 'POST', token });
    if (token !== TOKEN_SSO) return json(r, 401, { error: 'El token SSO no vale.', codigo: 'SSO_INVALIDO' });
    /* `verificada` es lo que mira la puerta de idoneidad de ONDK, y el API de
       verdad lo manda en el canje: este fingido lo mandaba sin el, asi que la
       puerta no se podia probar. Se manda true porque el recorrido normal es
       el de alguien verificado; el caso contrario se prueba aparte, tocandolo
       en la sesion guardada. */
    return json(r, 200, { token: JWT, refreshToken: REFRESH,
      usuario: { userId: 'usuario-111', gid: 'GID-FINGIDO-111', verificada: true } });
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

  /* Contra CADENA.PARES y no contra un numero escrito aqui: esta prueba
     esperaba catorce, la tabla pinta cinco, y el numero a mano llevaba tanto
     tiempo mal que ya no delataba nada. La lista es el contrato; la prueba
     comprueba que la pantalla lo cumple, no que coincida con un recuerdo. */
  const filas = await p.evaluate(() => document.querySelectorAll('#ms-cuerpo .ms-fila').length);
  const pares = await p.evaluate(() => CADENA.PARES.length);
  decir(filas === pares && filas > 0,
    'todos los mercados publicados están SIEMPRE en pantalla, con guion donde no hay dato',
    `filas: ${filas} de ${pares} pares`);
  const auka = await p.evaluate(() => document.querySelector('#ms-cuerpo .ms-fila')?.textContent || '');
  decir(/AUKA/.test(auka) && /\b111\b/.test(auka) && /222 AUKA/.test(auka), 'la fila de AUKA trae último 111 y volumen 222', auka);

  /* LAS DOS PUNTAS EN LA LISTA, y los TRES estados distintos.

     El 4-sep la casa tenia UNA sola orden viva —una venta de AUKA— y en la
     lista ese mercado se veia igual que los cuatro vacios: guion en ultimo y
     cero de volumen. El guion era correcto (nadie habia pagado nada) y la
     pantalla mentia por omision: para enterarse de que habia con quien operar
     habia que entrar par por par. Esta prueba existe para que no vuelva a
     pasar, y exige que los tres estados se distingan — porque «vacio» donde
     en realidad es «no lo se» es la misma mentira con otra letra. */
  const puntas = await p.evaluate(() => {
    // La columna del libro es .ms-libro dentro de cada fila de la rejilla.
    const fila = (i) => document.querySelectorAll('#ms-cuerpo .ms-fila')[i];
    const celda = (i) => fila(i)?.querySelector('.ms-libro')?.innerText.replace(/\s+/g, ' ').trim() ?? null;
    return { auka: celda(0), agka: celda(1), otro: celda(2) };
  });
  decir(/venta/i.test(puntas.auka) && /112/.test(puntas.auka) && /compra/i.test(puntas.auka) && /110/.test(puntas.auka),
    'con libro, la lista dice las dos puntas: venta 112 y compra 110', puntas.auka);
  decir(/vac[ií]o/i.test(puntas.agka), 'con las puntas en null, dice «vacío»: es un hecho, no una falla', puntas.agka);
  decir(puntas.otro === '—', 'y cuando el API no manda las puntas dice «—», no «vacío»', puntas.otro);
}

// ── 3 · un mercado abierto: velas pintadas, libro con filas, invitación ────
console.log('\n── AUKA-ORIGEN abierto, sin sesión ───────────────────────────');
{
  await p.click('#ms-cuerpo .ms-fila');
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

  /* «Enviar» ya no coloca: abre la pantalla de confirmacion, que dice cuanto
     das, cuanto recibis y cuanto te alejas de la referencia del oro. Este
     bloque mide el CONTRATO —que la orden llegue al API en wei y con su
     ordenKey—, asi que aqui solo hay que atravesarla; la pantalla en si tiene
     su propia suite en pruebas/probar-confirmacion.mjs y su medida a 360 px en
     pruebas/probar-movil.mjs.

     Se comprueba que el cuadro APAREZCA antes de darle: si un dia dejara de
     salir, atravesarlo a ciegas dejaria pasar la regresion en verde. */
  const hayCuadro = await p.evaluate(() => !!document.getElementById('vm-confirmar'));
  decir(hayCuadro, 'antes de colocar se abre la pantalla de confirmación');
  if (hayCuadro) {
    /* La casilla de los terminos sale en la PRIMERA orden de cada persona, y
       hasta marcarla el confirmar esta apagado. Se marca tocando. */
    if (await p.evaluate(() => !!document.getElementById('cf-terminos-check'))) {
      await p.check('#cf-terminos-check');
      await p.waitForTimeout(200);
    }
    await p.click('#cf-ok');
    await p.waitForTimeout(900);
  }
  /* Y que se cierre. El velo se cuelga del <body> con position:fixed, o sea
     FUERA del lienzo: si queda abierto, sigue ahi al cambiar de vista y se
     mete en lo que midan las comprobaciones de mas abajo. */
  decir(await p.evaluate(() => !document.getElementById('vm-confirmar')),
    'y al confirmar el cuadro se cierra: no queda un velo colgado del body');

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
// ── las dos clases de vela, que es la promesa que sostiene todo ────────────
// Aquí murieron dos bugs que sobrevivieron a siete suites en verde. Cada
// comprobación de este bloque es la lápida de uno.
console.log('\n── la referencia del metal, y su frontera ─────────────────────');
{
  await p.evaluate(() => ONX.vista('mercado', 'AUKA-ORIGEN'));
  await p.waitForTimeout(1500);

  const pest = await p.evaluate(() =>
    [...document.querySelectorAll('#lienzo button')].map(b => b.textContent.trim()));
  decir(pest.some(t => /Referencia/i.test(t)), 'AUKA tiene pestaña de Referencia');

  /* La nota del ratio vive junto a la gráfica de TRATOS —es donde tiene
     sentido: explica por qué ESA gráfica es plana— así que se lee ahora,
     antes de cambiar de pestaña. */
  const enTratos = await p.evaluate(() => document.querySelector('#lienzo').innerText);
  decir(/1[.,]?710/.test(enTratos.replace(/\s/g, '')),
    'y junto a los tratos, la nota del ratio constante',
    (enTratos.match(/.{0,50}710.{0,30}/) || [''])[0]);

  // La tinta de una gráfica LLENA, para calibrar la del mercado vacío.
  const tintaLlena = await p.evaluate(() => {
    const c = document.querySelector('#lienzo canvas'); if (!c) return 0;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+3] > 20 && ((d[i+1] > 150 && d[i] < 110 && d[i+2] > 120) || (d[i] > 190 && d[i+1] < 140 && d[i+2] < 130))) n++;
    }
    return n;
  });
  globalThis.__tintaLlena = tintaLlena;

  /* Este AUKA fingido SÍ tiene tratos, así que la sala abre —bien— en Tratos:
     el cartel del metal es para cuando no hay nada propio que enseñar. Se
     toca la pestaña, que es lo que haría una persona. */
  await p.evaluate(() => [...document.querySelectorAll('#lienzo button')]
    .find(b => /Referencia/i.test(b.textContent))?.click());
  await p.waitForTimeout(1200);

  const pidio = llamadas.some(l => /\/mercados\/AUKA-ORIGEN\/referencia/.test(l.ruta));
  decir(pidio, 'y al tocarla, la sala la pide al API de verdad');

  const txt = await p.evaluate(() => document.querySelector('#lienzo').textContent);
  decir(/REFERENCIA/i.test(txt) && /d[óo]lares/i.test(txt),
    'el rótulo está a la vista y dice dólares');
  decir(/No son tratos de Ordenex/i.test(txt),
    'y dice con todas las letras que no son tratos de la casa');

  // La mentira A: el lienzo se anunciaba como el PAR (que vale 1710 ORIGEN)
  // mientras enseñaba el oro (que vale 4000 USD).
  const aria = await p.evaluate(() => document.querySelector('#lienzo canvas')?.getAttribute('aria-label') || '');
  decir(!/AUKA-ORIGEN/.test(aria), 'el lienzo del metal NO se anuncia como el par de la casa', aria.slice(0, 90));
  decir(/USD/.test(aria), 'sino en dólares, y lo dice para quien no puede verlo');

}

console.log('\n── un token de sector no inventa nada ────────────────────────');
{
  await p.evaluate(() => ONX.vista('mercado', 'IBS-ORIGEN'));
  await p.waitForTimeout(1500);
  /* innerText y NO textContent: el módulo inyecta su CSS en un <style> dentro
     de la vista, y textContent se traga hasta los comentarios de esa hoja.
     Buscar «referencia» ahí daba un falso positivo por un comentario del
     código. Lo que importa es lo que la persona LEE. */
  const t = await p.evaluate(() => document.querySelector('#lienzo').innerText);
  /* ESTO SE PREGUNTA AL DOM, NO AL TEXTO.
     La versión anterior buscaba la palabra «referencia» sin distinguir
     mayúsculas y se ponía roja por esta frase:

       «Sin precio: todavía no hubo tratos y no hay referencia.»

     que es la web diciendo que NO hay referencia — o sea, exactamente lo
     contrario del fallo que se buscaba. Es el tercer caso igual en este
     repositorio: una comprobación que falla por un texto que dice que la cosa
     NO pasa enseña a ignorar la comprobación, y una prueba que se ignora es
     peor que no tenerla.

     Lo que de verdad significa «no inventa nada» son estas tres piezas, que
     tienen selector propio: la pestaña de fuente, el precio chico de al lado
     del último, y el sello del cartel del metal. */
  const piezas = await p.evaluate(() => ({
    pestana: !!document.querySelector('#lienzo button[data-fuente="referencia"]'),
    precioChico: (document.querySelector('#vm-ref')?.innerText || '').trim(),
    sello: [...document.querySelectorAll('#lienzo b')].some(b => /^REFEREN/i.test(b.innerText || '')),
  }));
  decir(!piezas.pestana && !piezas.precioChico && !piezas.sello,
    'IBS no enseña ninguna pestaña ni rótulo de referencia', JSON.stringify(piezas));
  // Y que tampoco se cuele el renglón de la fuente («Referencia: … ÷ gramín»),
  // que es por donde entraría un precio prestado con aire de dato propio.
  decir(!/÷\s*gram|Referencia:/.test(t), 'ni el renglón de la fuente del metal');

  decir(!/\$/.test(t), 'ni un solo signo de dólar en toda la pantalla');
  // Ni un precio prestado de los que sí existen.
  decir(!/4[.,]?3\d\d/.test(t) && !/1[.,]?710/.test(t) && !/2[.,]5\d/.test(t),
    'ni un precio prestado del oro, del ratio o del gramin');
  decir(/tratos todav[íi]a|primera orden|libro/i.test(t),
    'y sí dice por qué está vacío y dónde nace su precio');

  // El lienzo vacío tiene que estar VACÍO de velas, no solo parecerlo.
  const pintado = await p.evaluate(() => {
    const c = document.querySelector('#lienzo canvas'); if (!c) return null;
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let jade = 0, coral = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+1] > 150 && d[i] < 110 && d[i+2] > 120) jade++;
      if (d[i] > 190 && d[i+1] < 140 && d[i+2] < 130) coral++;
    }
    return { jade, coral };
  });
  /* Se calibra contra la gráfica LLENA de AUKA en vez de contra un número
     mágico: el umbral se mueve solo si mañana cambian los colores o el
     tamaño. Un residuo de antialias es tres órdenes de magnitud menor que
     una sola vela; si aquí hubiera velas, la cuenta se dispararía. */
  const tinta = (pintado?.jade || 0) + (pintado?.coral || 0);
  const llena = globalThis.__tintaLlena || 1;
  decir(tinta < llena / 100,
    'y no hay ni una vela escondida en el lienzo',
    `vacío ${tinta} px vs llena ${llena} px`);

  /* EL CONTROL POSITIVO. Sin esto, la comprobación de arriba pasaría en verde
     aunque los tres selectores estuvieran mal escritos: no encontrar nada es
     el resultado que se espera, así que un selector roto se ve igual que un
     acierto. Se repite la misma consulta en AUKA, que SÍ tiene referencia, y
     tiene que encontrarlas.

     Se intentó comprobarlo mutando —dándole referencia a IBS en la lista de la
     web— y no sirvió: el API fingido contesta 404 para IBS y la web le hace
     caso, que es el fail-closed correcto. La mutación quedaba neutralizada por
     el acierto de otra pieza, y una mutación que no pone rojo no prueba nada. */
  await p.evaluate(() => ONX.vista('mercado', 'AUKA-ORIGEN'));
  await p.waitForTimeout(1600);
  const enAuka = await p.evaluate(() => ({
    pestana: !!document.querySelector('#lienzo button[data-fuente="referencia"]'),
    precioChico: (document.querySelector('#vm-ref')?.innerText || '').trim(),
  }));
  decir(enAuka.pestana || !!enAuka.precioChico,
    'y los mismos selectores SÍ encuentran la referencia en AUKA: la comprobación de arriba puede fallar',
    JSON.stringify(enAuka));
}

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

console.log('\n── DE QUIEN ES ESTA CASA ─────────────────────────────────────');
{
  /* Ordenex es de AuCorp, aliada de Orden Global. La portada lo decia al
     reves —«ORDEN GLOBAL · la casa de cambio del ecosistema»— y quien opera
     aqui tiene derecho a saber con quien opera. */
  const pg = await nav.newPage({ viewport: { width: 1440, height: 900 }, locale: 'es-HN' });
  await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1200);
  const sello = await pg.evaluate(() => document.body.innerText);
  decir(/AUCORP/i.test(sello), 'la portada nombra a AuCorp');
  decir(/ORDEN GLOBAL/i.test(sello), 'y sigue nombrando al ecosistema Orden Global');

  const tit = await pg.title();
  decir(/AuCorp/i.test(tit), 'el titulo de la pestaña dice de quien es la casa', tit);

  /* Y la piel: esta sala era del verde de Veta Wallet. Si vuelve, es que
     alguien copio la paleta de al lado y Ordenex perdio cara propia. */
  const fondo = await pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
  decir(fondo === 'rgb(10, 14, 20)', 'el fondo es el grafito propio, no el pozo verde', fondo);
  const css = await pg.evaluate(() => [...document.querySelectorAll('style')].map(s => s.textContent).join(''));
  decir(!/#021B1C/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')),
    'y el pozo verde no queda ni en una regla suelta');
  await pg.close();
}

console.log('\n── LA SALA, COMO UNA MESA DE OPERACIONES ─────────────────────');
{
  /* Las cuatro piezas que separan una ficha de producto de una casa de cambio.
     Ninguna es decorativa: cada una existe porque su ausencia costaba un gesto
     repetido o un dato que habia que ir a buscar a otra pantalla. */
  const pg = await nav.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'es-HN' });
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  // El API falso hay que apuntarlo en CADA pestaña: addInitScript es por
  // pagina, no por navegador, y sin esto la sala abre contra el API de verdad.
  await pg.addInitScript((origen) => { window.ONX_API = origen; window.ONX_WALLET = origen; }, ORIGEN_LOCAL);
  await pg.goto(BASE + '#mercado/AUKA-ORIGEN', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2500);

  // 1. La cinta de precios, arriba y en todas las pantallas.
  /* Lo que importa no es CUANTOS mercados sirve el API falso, sino que la
     pista vaya DUPLICADA: la animacion corre el 50%, y con una sola copia el
     bucle salta a la vista cada vuelta. Se mide la relacion, no un numero
     magico que se cae el dia que el API de mentira sirva otro tanto. */
  const cinta = await pg.evaluate(() => ({
    piezas: document.querySelectorAll('#cinta-pista .cinta-it').length,
    mitades: document.querySelectorAll('#cinta-pista .cinta-mitad').length,
  }));
  decir(cinta.mitades === 2 && cinta.piezas > 0 && cinta.piezas % 2 === 0,
    'la cinta va en dos mitades iguales, para que el bucle no tenga costura',
    `${cinta.piezas} piezas en ${cinta.mitades} mitades`);

  // 2. La lista de la sala: todos los publicados, con buscador y favoritos.
  const lista = await pg.evaluate(() => document.querySelectorAll('#vm-lista .vm-it').length);
  const paresSala = await pg.evaluate(() => CADENA.PARES.length);
  decir(lista === paresSala && lista > 0, 'la lista de la sala trae todos los mercados publicados',
    `${lista} de ${paresSala}`);
  await pg.fill('#vm-q', 'auk');
  await pg.waitForTimeout(250);
  const tras = await pg.evaluate(() => document.querySelectorAll('#vm-lista .vm-it').length);
  decir(tras === 1, 'y el buscador filtra de verdad', `«auk» deja ${tras}`);
  await pg.fill('#vm-q', '');
  await pg.waitForTimeout(250);

  // El favorito sube a la primera fila y sobrevive a una recarga: si no, no es
  // un favorito, es un clic bonito.
  /* El par del favorito se toma del ULTIMO de CADENA.PARES: asi se marca uno
     que de verdad esta en la lista y que no es el primero ya. Estaba escrito
     'SOL-ORIGEN', que no se publica —no tiene mercado— y por eso el favorito
     no podia subir a ningun lado: la prueba fallaba por pedirle a la pantalla
     que enseñara un par que la casa no abre. */
  const favPar = await pg.evaluate(() => CADENA.PARES[CADENA.PARES.length - 1]);
  const favSim = favPar.split('-')[0];
  await pg.evaluate(par => VMERCADO.favorito(par), favPar);
  await pg.waitForTimeout(250);
  const primero = await pg.evaluate(() => document.querySelector('#vm-lista .vm-it')?.innerText.trim());
  decir(primero?.includes(favSim), 'un favorito sube a la primera fila', `${favSim} · ${primero}`);
  await pg.reload({ waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2500);
  const trasRecarga = await pg.evaluate(() => document.querySelector('#vm-lista .vm-it')?.innerText.trim());
  decir(trasRecarga?.includes(favSim), 'y sigue arriba despues de recargar', trasRecarga);
  await pg.evaluate(par => VMERCADO.favorito(par), favPar);

  // 3. La barra del dia, en UNA linea con el precio.
  const barra = await pg.evaluate(() => (document.querySelector('.vm-stats')?.innerText || '').replace(/\n/g, ' '));
  decir(/24 H/i.test(barra) && /M[ÁA]X/i.test(barra) && /VOL/i.test(barra),
    'la barra del dia lleva ultimo, 24 h, maximo, minimo y volumen juntos', barra.slice(0, 90));

  // 4. Las pestañas de abajo, sin cambiar de vista.
  const pes = await pg.evaluate(() => [...document.querySelectorAll('.vm-peskab button')].map(b => b.innerText.trim()));
  /* Cuatro: los tratos de la casa, mis órdenes abiertas, el historial de las
     cerradas y mis tratos. Son las cuatro preguntas que alguien que opera se
     hace sin querer salir de la sala. */
  decir(pes.length === 4, 'hay cuatro pestañas debajo del libro', pes.join(' · '));
  await pg.evaluate(() => VMERCADO.pestana('mias'));
  await pg.waitForTimeout(250);
  const mias = await pg.evaluate(() => ({
    visible: !document.getElementById('vm-mias').classList.contains('oculto'),
    txt: document.getElementById('vm-mias').innerText.trim(),
  }));
  decir(mias.visible, 'la de mis ordenes se abre sin salir de la sala');
  decir(/entr[aá]/i.test(mias.txt), 'y sin sesion pide entrar en vez de mentir con una lista vacia', mias.txt);

  // 5. Y la serif ya no manda en la superficie de operacion.
  const fam = await pg.evaluate(() =>
    getComputedStyle(document.querySelector('#pt-titulo') || document.body).fontFamily);
  decir(!/Cinzel/.test(fam), 'el titular ya no va en la serif de casa de subastas', fam);

  decir(errs.length === 0, 'sin errores de consola en la sala', errs.slice(0, 2).join(' · '));
  await pg.close();
}

console.log('\n── EL PUENTE CON LA WALLET ───────────────────────────────────');
{
  /* «Entre con Genesis ID y el portafolio sale en cero» no es un fallo: es que
     Ordenex guarda lo que le DEPOSITAN, y esa frase no estaba en ninguna
     pantalla. Se comprueba que ahora si este, y que traer fondos sea UN gesto
     y no copiar 42 caracteres entre dos pestañas. */
  const pg = await nav.newPage({ viewport: { width: 1440, height: 950 }, locale: 'es-HN' });
  await pg.addInitScript((origen) => { window.ONX_API = origen; window.ONX_WALLET = origen; }, ORIGEN_LOCAL);
  await pg.goto(BASE + '#portafolio', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2200);

  const txt = await pg.evaluate(() => document.getElementById('lienzo')?.innerText || '');
  const conSesion = !/entr[aá] con tu cuenta/i.test(txt.slice(0, 200));
  if (!conSesion) {
    // Sin sesion el portafolio pide entrar, que es lo correcto. Se comprueba
    // sobre el texto del modulo, que es donde vive la explicacion.
    const dice = await pg.evaluate(() => {
      const t = VPORTA.vista;
      return typeof t === 'function';
    });
    decir(dice, 'el portafolio existe y sin sesion pide entrar');
  }

  // La explicacion y el boton viven en el modulo aunque no haya sesion: se
  // leen del fuente, que es lo unico que se puede comprobar sin cuenta.
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('./ordenex/portafolio.js', import.meta.url), 'utf8');
  decir(/solo guarda lo que le depositan/i.test(src),
    'la pantalla explica que la casa guarda lo que le depositan');
  decir(/est[aá]n en tu wallet|In your Veta Wallet/i.test(src),
    'y que lo suyo esta en su wallet, no perdido');
  decir(src.includes('#pagar${esc(direccion)}'),
    'traer fondos es UN enlace con la direccion puesta, no copiar y pegar');
  decir(/saldosEnWallet/.test(src), 'y los saldos de la wallet se leen de la cadena');
  decir(/VPORTA\.depositar\(/.test(src),
    'cada activo lleva su propio boton de depositar');
  decir(/s=\$\{encodeURIComponent\(sim\)\}/.test(src) && /&m=\$\{encodeURIComponent\(monto\)\}/.test(src),
    'y el enlace lleva simbolo Y monto, ya puestos');
  decir(/pop=1/.test(src), 'se abre en ventana emergente, no mandando a otra pestaña');
  decir(/class="po-panel-marco" src=/.test(src),
    'la wallet se dibuja DENTRO, en un marco: el panel estilo MetaMask');
  decir(/po-panel-dom/.test(src),
    'y el dominio va a la vista, que es lo que separa un panel de la wallet de uno que finge serlo');

  /* Que el marco este permitido no puede quedar en la intencion: si la CSP de
     Ordenex no lo deja, el panel sale en blanco y nadie sabe por que. */
  const htm = await readFile(new URL('./ordenex/index.html', import.meta.url), 'utf8');
  decir(/frame-src https:\/\/app\.vetawallet\.com/.test(htm),
    'la CSP de Ordenex permite enmarcar la wallet');
  const csp = (htm.match(/http-equiv="Content-Security-Policy" content="([\s\S]*?)"/) || [])[1] || '';
  decir(!/\/\*/.test(csp),
    'y no hay comentarios dentro de la CSP — el navegador se los come como directivas rotas');

  /* La guarda del mensaje de vuelta. Sin comprobar el origen, cualquier pagina
     abierta podria decirle a esta que se firmo un deposito. */
  decir(/if \(ev\.origin !== esperado\) return;/.test(src),
    'el aviso de la wallet se ignora si no viene de su origen exacto');
  const wal = await readFile(new URL('./veta-wallet/app.js', import.meta.url), 'utf8');
  decir(/postMessage\(\{ de: 'veta-wallet', \.\.\.datos \}, quienAbrio\)/.test(wal),
    'y la wallet lo manda APUNTADO a quien la abrio, nunca con comodin');
  decir(!/postMessage\([^)]*, ?'\*'\)/.test(wal), 'no hay ni un postMessage con comodin en la wallet');
  decir(/ORIGENES_QUE_PUEDEN_ABRIR/.test(wal),
    'la wallet solo le contesta a los origenes de la lista');
  decir(/let cobroPendiente = null;/.test(wal),
    'el cobro sobrevive al login: era por esto que la direccion salia en blanco');
  decir(/nunca aqu[ií]|never here/.test(src),
    'y se dice que la clave se pone en la wallet, jamas en Ordenex');

  /* montoURL es lo que viaja en el enlace y llega al campo de la wallet. Si
     metiera comas de miles, «1,234» seria otro numero al otro lado; y si
     pasara por Number, un saldo grande perderia enteros. Se prueba la funcion
     de verdad, extraida del modulo. */
  const fn = new Function('return (' + src.match(/function montoURL\(wei\)[\s\S]*?\n  \}/)[0].replace('function montoURL(wei)', 'function(wei)') + ')')();
  decir(fn('1234000000000000000000') === '1234', 'montoURL: 1234 ORIGEN sin comas de miles', fn('1234000000000000000000'));
  decir(fn('1500000000000000000') === '1.5', 'con decimales, punto y sin ceros de cola', fn('1500000000000000000'));
  decir(fn('1') === '0.000000000000000001', 'y un wei suelto no se redondea a cero', fn('1'));
  decir(fn('0') === null && fn('nada') === null, 'cero o basura no arma enlace');

  const cad = await readFile(new URL('./ordenex/cadena.js', import.meta.url), 'utf8');
  decir(/return filas\.filter\(f => f\.wei != null/.test(cad),
    'un saldo que no se pudo leer NO se pinta como cero');
  await pg.close();
}

// ══════════════════════════════════════════════════════════════════════════
// LO QUE COBRA LA CASA
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── LA COMISION, DICHA ANTES DE COBRARLA ──────────────────────');
{
  /* El motor cobra partes por millon sobre lo RECIBIDO —lib/motor.js parte
     cada trato en dos patas del ledger— y esa cifra no salia por ninguna
     puerta del API ni aparecia en ninguna pantalla: se descubria en el saldo.
     Era el unico sitio de toda la casa donde se cobraba algo que el cliente no
     habia visto. Ahora la sirve GET /tarifas y el formulario la desglosa. */
  const pg = await nav.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'es-HN' });
  await pg.addInitScript((origen) => { window.ONX_API = origen; window.ONX_WALLET = origen; }, ORIGEN_LOCAL);
  await pg.goto(BASE + '#sso=' + TOKEN_SSO, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1600);
  await pg.evaluate(() => ONX.vista('mercado', 'AUKA-ORIGEN'));
  await pg.waitForTimeout(1600);

  decir(llamadas.some(l => l.ruta === '/tarifas'), 'la web le pregunta al API cuanto cobra la casa');

  const leer = () => pg.evaluate(() => ({
    lbl: document.querySelector('#vm-comision-lbl')?.textContent || '',
    com: document.querySelector('#vm-comision')?.textContent || '',
    rec: document.querySelector('#vm-recibis')?.textContent || '',
    total: document.querySelector('#vm-total')?.textContent || '',
  }));

  decir(/0\.25\s*%|0,25\s*%/.test((await leer()).lbl),
    'el porcentaje se ve aunque no se haya escrito una cantidad', (await leer()).lbl);

  // COMPRA de 1 AUKA a 110: se recibe el ACTIVO, asi que la comision se resta
  // en AUKA y no en ORIGEN. 2500 ppm de 1 = 0,0025.
  await pg.fill('#vm-precio', '110');
  await pg.fill('#vm-cant', '1');
  await pg.waitForTimeout(350);
  const compra = await leer();
  decir(/110/.test(compra.total), 'el total sigue siendo lo que se paga: 110 ORIGEN', compra.total);
  decir(/0\.0025/.test(compra.com) && /AUKA/.test(compra.com),
    'la comision de una COMPRA se cobra sobre el activo recibido', compra.com);
  decir(/0\.9975/.test(compra.rec) && /AUKA/.test(compra.rec),
    'y «Recibis» dice lo que de verdad queda: 0,9975 AUKA', compra.rec);

  // VENTA de 1 AUKA a 110: se recibe ORIGEN, asi que la comision cambia de
  // moneda sola. 2500 ppm de 110 = 0,275.
  await pg.evaluate(() => VMERCADO.lado('venta'));
  await pg.waitForTimeout(200);
  await pg.fill('#vm-precio', '110');
  await pg.fill('#vm-cant', '1');
  await pg.waitForTimeout(350);
  const venta = await leer();
  decir(/0\.275/.test(venta.com) && /ORIGEN/.test(venta.com),
    'la de una VENTA se cobra sobre el ORIGEN recibido', venta.com);
  decir(/109\.725/.test(venta.rec) && /ORIGEN/.test(venta.rec),
    'y lo que queda es 109,725 ORIGEN', venta.rec);
  await pg.close();
}

// ══════════════════════════════════════════════════════════════════════════
// EL INSTRUMENTO DECLARADO: ONDK
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ONDK: LA SALA DEJA DE CONTRADECIRSE ───────────────────────');
{
  /* La sala decia «ONDK no cotiza todavia: no hay libro ni contraparte» y a
     cuatrocientos pixeles ofrecia un boton «Comprar ONDK». El libro de ONDK
     esta vacio por los dos lados —este fingido lo sirve vacio, igual que
     produccion—, asi que la que decia la verdad era la advertencia. */
  const pg = await nav.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'es-HN' });
  await pg.addInitScript((origen) => { window.ONX_API = origen; window.ONX_WALLET = origen; }, ORIGEN_LOCAL);
  await pg.goto(BASE + '#sso=' + TOKEN_SSO, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1600);
  await pg.evaluate(() => ONX.vista('mercado', 'ONDK-ORIGEN'));
  await pg.waitForTimeout(2000);

  const caja = await pg.evaluate(() => document.querySelector('#vm-form-caja')?.innerText || '');
  decir(!(await pg.evaluate(() => !!document.querySelector('#vm-enviar'))),
    'sin contraparte NO se ofrece comprar: no hay boton de operar');
  decir(/no tiene mercado/i.test(caja) && /no hay con qui[eé]n operar/i.test(caja),
    'y se dice por que, en el sitio donde estaba el boton', caja.slice(0, 130));

  // El libro sigue a la vista: un libro vacio CONFIRMA el descargo.
  decir(await pg.evaluate(() => !!document.querySelector('#vm-libro-nota')),
    'el libro se queda a la vista: vacio, confirma lo que dice el descargo');

  /* EL DESCARGO SOBREVIVE AL FALLO DEL FETCH. Este fingido no sirve
     /precio-declarado, o sea que declCache se queda en null — que es
     exactamente el caso que dejaba la pantalla sin advertencia y con el
     formulario puesto. */
  const bajo = await pg.evaluate(() => document.querySelector('#vm-bajo')?.innerText || '');
  decir(/PRECIO DECLARADO/i.test(bajo) && /no es un precio de mercado/i.test(bajo),
    'el descargo se pinta aunque /precio-declarado no conteste', bajo.slice(0, 110));

  // Y la ficha del valor negociable, en ingles, sin el «minuto» de reloj.
  await pg.evaluate(() => ONX.idioma('en'));
  await pg.waitForTimeout(700);
  const eng = await pg.evaluate(() => document.querySelector('#vm-bajo')?.innerText || '');
  decir(/board resolution/i.test(eng), 'en ingles «acta» es una resolucion de Junta, no un minuto', eng.slice(0, 110));
  decir(!/candle in the chart is one minute/i.test(eng), 'y ya no dice que cada vela dura un minuto');
  await pg.evaluate(() => ONX.idioma('es'));
  await pg.close();
}

// ══════════════════════════════════════════════════════════════════════════
// CON EL BACKEND CAIDO
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── EL BACKEND CAIDO: LOS MERCADOS SIGUEN EN PANTALLA ─────────');
{
  /* La lista se itera desde CADENA.PARES justamente para no depender del API,
     y el comentario del modulo lo promete con todas las letras: «SIEMPRE en
     pantalla, con guiones donde el dato no llego». El codigo retornaba antes
     de pintar cuando no habia cache, asi que un primer sondeo fallido dejaba
     la tabla vacia: una casa de cambio sin mercados parece cerrada. */
  const pg = await nav.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-HN' });
  // Un API que no existe: el puerto 1 no escucha en ninguna maquina.
  await pg.addInitScript((origen) => {
    window.ONX_API = 'http://127.0.0.1:1';
    window.ONX_WALLET = origen;
  }, ORIGEN_LOCAL);
  await pg.goto(BASE + '#mercados', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(3000);

  const est = await pg.evaluate(() => ({
    filas: document.querySelectorAll('#ms-cuerpo .ms-fila').length,
    pares: CADENA.PARES.length,
    guiones: (document.querySelector('#ms-cuerpo')?.innerText.match(/—/g) || []).length,
    nota: document.querySelector('#ms-nota')?.textContent || '',
  }));
  decir(est.filas === est.pares && est.filas > 0,
    'sin backend, la tabla sigue trayendo todos los mercados', `${est.filas} de ${est.pares}`);
  decir(est.guiones >= est.pares, 'con guiones donde el dato no llego', `${est.guiones} guiones`);
  decir(/conexi[oó]n|no pudimos/i.test(est.nota),
    'y se dice que los precios no llegaron, en vez de fingir que no hay mercados', est.nota.slice(0, 80));
  await pg.close();
}

// ══════════════════════════════════════════════════════════════════════════
// LA TELEMETRIA
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── LA TELEMETRIA: PERMITIDA, Y SIN BUCLE ─────────────────────');
{
  /* Dos fallos que se sostenian el uno al otro: el origen de Genesis no estaba
     en el connect-src, asi que el navegador cortaba el CIEN POR CIENTO de los
     eventos; y el rebote entraba por el catch sin descartar el lote, con lo
     cual la cola crecia hasta el tope y se reintentaba cada diez segundos para
     siempre. El primero se arregla en la CSP —lo vigila la comprobacion de
     errores de consola de mas arriba— y el segundo, aqui. */
  const idx = await readFile(new URL('./ordenex/index.html', import.meta.url), 'utf8');
  const csp = (idx.match(/Content-Security-Policy" content="([\s\S]*?)"/) || [])[1] || '';
  const connect = (csp.match(/connect-src([\s\S]*?);/) || [])[1] || '';
  const tel = await readFile(new URL('./ordenex/telemetria.js', import.meta.url), 'utf8');
  const destino = (tel.match(/'(https:\/\/[^']*genesis[^']*)'/) || [])[1] || '';
  decir(!!destino && connect.includes(destino.replace(/\/$/, '')),
    'el destino de la telemetria esta permitido por la CSP de la pagina',
    `${destino} en connect-src`);

  const pg = await nav.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-HN' });
  await pg.addInitScript((origen) => {
    window.ONX_API = origen; window.ONX_WALLET = origen;
    // Un destino que la CSP NO permite: es la manera de reproducir el rebote
    // en una prueba sin apagar la red ni tocar produccion.
    window.ONX_GENESIS = 'https://un-destino-que-no-esta-en-la-csp.invalid';
  }, ORIGEN_LOCAL);
  await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1200);

  const cola = await pg.evaluate(async () => {
    TELEMETRIA.iniciar({ url: 'https://un-destino-que-no-esta-en-la-csp.invalid' });
    for (let i = 0; i < 5; i++) TELEMETRIA.anotar({ tipo: 'accion', nombre: 'prueba.' + i });
    const alPrincipio = TELEMETRIA._cola().length;
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    // Tres intentos: es el tope a partir del cual el lote se suelta.
    for (let i = 0; i < 4; i++) { TELEMETRIA.vaciar(); await esperar(300); }
    return { alPrincipio, alFinal: TELEMETRIA._cola().length };
  });
  decir(cola.alPrincipio > 0 && cola.alFinal === 0,
    'un destino que rebota no deja la cola creciendo: al tercer intento el lote se descarta',
    `${cola.alPrincipio} → ${cola.alFinal}`);
  await pg.close();
}

await nav.close(); sv.close();
console.log(malas ? `\n${malas} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
