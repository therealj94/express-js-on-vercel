/* La casa de cambio EN UN TELEFONO, medida a 360 px.
 *
 *   node apps-web/ordenex/pruebas/probar-movil.mjs
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * Las demas suites de Ordenex se corren a 1280 px, que es donde todo entra.
 * Y a 360 px la casa tenia tres agujeros que ninguna vio:
 *
 *   1. la tabla de «mis ordenes abiertas» mide 443 px de ancho, el `body`
 *      lleva `overflow-x:hidden` —que RECORTA en vez de dejar desplazar— y la
 *      columna que quedaba fuera del borde era la del boton «Cancelar». Una
 *      orden que ya reservo saldo y no se puede cancelar es dinero atrapado,
 *      no un defecto de maquetacion;
 *   2. la tabla de mercados se salia por lo mismo;
 *   3. `.riel-pie` se escondia por debajo de 900 px, y ahi viven SALIR y el
 *      cambio de idioma: en un telefono no habia manera de cerrar sesion.
 *
 * Asi que esto no comprueba que la pantalla «se vea bien»: comprueba que se
 * pueda LLEGAR con el dedo a lo que libera dinero y a lo que cierra la sesion,
 * y mide los numeros para que la proxima regresion se lea como un numero y no
 * como una impresion.
 *
 * LO QUE SE LE FUE SUMANDO, Y QUE ENSEÑA CADA COSA
 *
 *   5. La portada EN INGLES. El boton de entrar no envuelve y en ingles dice
 *      «Sign in with my Veta Wallet account»: sus 371 px eran el ancho minimo
 *      de la columna, y la portada entera se desplazaba a lo ancho en 320 y en
 *      360. Un fallo que vive solo en el segundo idioma es la regla, no la
 *      excepcion — nadie prueba la pagina en el idioma que no habla.
 *   6. El blanco de toque de los MANDOS. 40 px, y solo a lo que elige, envia,
 *      cancela o cierra sesion. Un enlace de texto dentro de una frase no
 *      entra en la lista: engordarlo partiria la frase.
 *   7. Un nombre largo al lado de un boton. El fallo de Jose, reproducido acá:
 *      la caja del nombre se queda en 33 px, perfectamente dentro de la fila,
 *      y las LETRAS se dibujan encima del boton. Por eso se mide la tinta y no
 *      la caja — preguntarle su rectangulo al elemento diria que todo va bien.
 *   8. La grafica a 360 y a 320. El lienzo salia mas alto que ancho, y la
 *      leyenda con precios de nueve cifras se pintaba fuera del canvas: la
 *      mitad de los datos estaba dibujada donde no hay pantalla.
 *   9. El teclado. No empuja la pagina: le recorta la ventana, y las pestañas
 *      fijas suben con el y se plantan encima del campo que se teclea.
 *
 * Y una regla que se paga cara: cada comprobacion de aca se verifico POR
 * MUTACION — quitando el arreglo y viendo el rojo. Una prueba que no se ha
 * visto fallar no es una prueba, es una frase de buenos deseos.
 *
 * ONX_RAIZ apunta a otra copia de la web (por ejemplo una sacada de git) para
 * poder medir el antes y el despues con la MISMA vara. Es tambien lo que hace
 * barata la mutacion: se copia la web, se le quita un arreglo y se corre esto
 * contra la copia, sin tocar la de verdad.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = process.env.ONX_RAIZ ? resolve(process.env.ONX_RAIZ) : join(AQUI, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
                '.woff2': 'font/woff2', '.woff': 'font/woff' };

// El ancho del telefono mas angosto que sigue en la calle. Si entra aqui,
// entra en todos.
const ANCHO = 360;

const U = 10n ** 18n;
const wei = n => (BigInt(n) * U).toString();
// La misma cuenta pero admitiendo decimales, por texto y no multiplicando por
// 1e18: un flotante por 1e18 sale torcido y acá se están fabricando precios.
const weiF = n => {
  const [ent, dec = ''] = Number(n).toFixed(6).split('.');
  return (BigInt(ent) * U + BigInt(dec.padEnd(18, '0').slice(0, 18))).toString();
};
const TOKEN_SSO = 'token-sso-fingido-111';
const JWT = 'jwt-fingido-111';

/* AUKA se queda con las cifras chicas de siempre —es el par donde se coloca y
   se cancela la orden, y ahí lo que se mide es llegar con el dedo, no leer un
   número—. AGKA pasa a cifras de nueve dígitos A PROPÓSITO: es el par con el
   que se prueba la gráfica y la barra de estadísticas, y todo lo que se rompe
   por ancho se rompe con números largos, no con «111». Un saldo de nueve
   dígitos no es un caso raro: ORIGEN es el gramo de oro y la gente tiene
   millones de graminos. */
const GRANDE = 123456789.12;

/* LA REFERENCIA DEL ORO, con los números de verdad del 4 de septiembre. No es
   decoración del decorado: desde que colocar pasa por la confirmación, un
   mercado referenciado SIN referencia es 'sinRef' y no se coloca — fail-closed
   a propósito. Con la referencia inventada a ojo, o el precio quedaba a un
   93 % de distancia y salía 'bloqueo', o había que fingir una onza de oro a
   282 dólares. Un decorado que miente se copia.

     onza de oro   $4.389,89
     ORIGEN        $2,566148   = (onza / 31,1035) / 55
     AUKA/ORIGEN   = onza / gramín = 1.710,69 — y es fijo, porque los dos son
                     oro: lo que se mueve es el par de la plata. */
const ORO_USD = 4389.89;
const ORIGEN_USD = 2.566148;
const AUKA_ORIGEN = ORO_USD / ORIGEN_USD;   // 1710,69
const REF_ORO = { usd: ORO_USD, origenUsd: ORIGEN_USD, rotulo: 'onza de oro',
                  fuente: 'metals.dev', en: new Date().toISOString() };

const MERCADOS = [
  { mercado: 'AUKA-ORIGEN', ultimo: weiF(AUKA_ORIGEN), cambio24h: 1.11,
    vol24h: wei(222), referencia: REF_ORO },
  { mercado: 'AGKA-ORIGEN', ultimo: weiF(GRANDE), cambio24h: -12.34, vol24h: weiF(987654321.5),
    alto24h: weiF(123456999), bajo24h: weiF(111111111) },
];
const LIBRO = {
  compras: [[weiF(AUKA_ORIGEN - 1), wei(222)], [weiF(AUKA_ORIGEN - 2), wei(111)]],
  ventas: [[weiF(AUKA_ORIGEN + 1), wei(111)], [weiF(AUKA_ORIGEN + 2), wei(222)]],
};

/* Los umbrales y la versión de los términos, como los sirve el API de verdad.
   Sin `/limites` el nivel es 'sinLimites', que pinta una casilla más; y sin
   versión de términos no aparece la casilla de aceptarlos. Los dos se sirven
   porque la primera orden de cualquiera —la que se coloca desde un teléfono
   que estrena la app— es justo la que trae el cuadro MÁS ALTO, y ese es el
   caso que hay que medir a 360 px, no el corto. */
const LIMITES = {
  desvio: { avisoPct: 5, bloqueoPct: 20 },
  terminos: { version: '2026-09-01', terminos: 'legal.html#terminos', riesgo: 'legal.html#riesgo' },
};
const VERSION_TERMINOS = LIMITES.terminos.version;

/* 120 velas de nueve dígitos para AGKA. Son las que hacen ancha la leyenda: el
   renglón «O … H … L … C … %» con precios así mide más de 500 px, y el lienzo
   de un teléfono mide 287. */
const AHORA = Date.now();
const VELAS_AGKA = Array.from({ length: 120 }, (_, i) => {
  const base = GRANDE + Math.sin(i / 7) * 900;
  return { t0: AHORA - (120 - i) * 3600e3, o: weiF(base), h: weiF(base + 260),
           l: weiF(base - 260), c: weiF(base + 90), v: weiF(1234567 + i) };
});

/* El agente con el nombre largo. Es el caso de José, con nombre y apellidos
   de verdad: cuatro palabras y pico al lado de un botón que no envuelve. El
   segundo es el otro filo del mismo cuchillo — una razón social sin un solo
   espacio, que no tiene por dónde partirse. */
const NOMBRE_LARGO = 'Mayra Carolina Enamorado Alvarez de la Cruz Motagua';
const AGENTES = [
  { id: 'ag-1', nombre: NOMBRE_LARGO, monedas: ['HNL', 'USD'],
    bancos: ['BAC', 'Ficohsa', 'Atlántida', 'Banpaís'] },
  { id: 'ag-2', nombre: 'Superintendencia-de-Intermediacion-Cambiaria-Centroamericana',
    monedas: ['HNL'], bancos: ['BAC'] },
];

// ── el servidor: la web y un API fingido en el MISMO origen ────────────────
const json = (r, codigo, obj) => {
  r.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  r.end(JSON.stringify(obj));
};
const cuerpoDe = q => new Promise(res => {
  let t = '';
  q.on('data', d => { t += d; });
  q.on('end', () => { try { res(JSON.parse(t || '{}')); } catch { res({}); } });
});

const ordenes = [];
let terminosAceptados = false;

async function api(q, r, ruta) {
  const un = ruta.match(/^\/mercados\/([^/]+)\/(libro|velas|tratos)$/);
  if (q.method === 'GET' && ruta === '/mercados') return json(r, 200, MERCADOS);
  if (q.method === 'GET' && ruta === '/tarifas') return json(r, 200, { comisionPpm: 2500, sobre: 'recibido' });
  if (q.method === 'GET' && ruta === '/limites') return json(r, 200, LIMITES);
  if (q.method === 'GET' && un) {
    const vivo = MERCADOS.some(m => m.mercado === un[1] && m.ultimo != null);
    if (un[2] === 'libro') return json(r, 200, vivo ? LIBRO : { compras: [], ventas: [] });
    // Solo AGKA trae velas: es el par con el que se mide la gráfica. AUKA
    // sigue sin ninguna, que es como estaba y como lo esperan los pasos de
    // colocar y cancelar.
    if (un[2] === 'velas' && un[1] === 'AGKA-ORIGEN') return json(r, 200, VELAS_AGKA);
    return json(r, 200, []);
  }
  if (q.method === 'GET' && /^\/fiat\/agentes/.test(ruta)) return json(r, 200, AGENTES);
  if (q.method === 'GET' && /^\/mercados\/[^/]+\/referencia$/.test(ruta)) {
    return json(r, 404, { error: 'Este activo no tiene referencia.', codigo: 'SIN_REFERENCIA' });
  }
  if (q.method === 'GET' && /^\/precio-declarado\//.test(ruta)) {
    return json(r, 404, { error: 'No declarable.', codigo: 'NO_DECLARABLE' });
  }
  if (q.method === 'POST' && ruta === '/auth/sso') {
    const { token } = await cuerpoDe(q);
    if (token !== TOKEN_SSO) return json(r, 401, { error: 'No vale.', codigo: 'SSO_INVALIDO' });
    // `verificada: true` porque esta suite mide geometria, no idoneidad: la
    // puerta de ONDK tiene su propia prueba en probar-ordenex.mjs.
    return json(r, 200, { token: JWT, refreshToken: 'refresco-222',
      usuario: { gid: 'GID-FINGIDO-111', nombre: 'Fingido', verificada: true } });
  }
  const borra = ruta.match(/^\/ordenes\/([^/]+)$/);
  const guardada = ['/portafolio', '/movimientos', '/ordenes', '/fiat/solicitudes', '/auth/terminos'].includes(ruta) || !!borra;
  if (!guardada) return null;
  if ((q.headers.authorization || '') !== 'Bearer ' + JWT) {
    return json(r, 401, { error: 'Sin sesión.', codigo: 'SIN_SESION' });
  }
  if (q.method === 'GET' && ruta === '/portafolio') {
    return json(r, 200, {
      /* El saldo de ORIGEN da para la orden que se coloca abajo: 2 AUKA a
         1700 son 3400 ORIGEN, y con los 999 de antes —de cuando el par valía
         110— la orden ni llegaba al cuadro de confirmación. AUKA se queda en
         cifras chicas a propósito: el par de los números largos es AGKA. */
      cuentas: [{ activo: 'ORIGEN', disponible: wei(9999), reservado: '0' },
                { activo: 'AUKA', disponible: wei(222), reservado: '0' }],
      direccionDeposito: '0x' + 'a111'.repeat(10),
    });
  }
  if (q.method === 'GET' && ruta === '/ordenes') return json(r, 200, ordenes);
  if (q.method === 'GET' && (ruta === '/movimientos' || ruta === '/fiat/solicitudes')) return json(r, 200, []);
  if (ruta === '/auth/terminos') {
    if (q.method === 'POST') {
      const { version } = await cuerpoDe(q);
      if (version !== VERSION_TERMINOS) {
        return json(r, 409, { error: 'Otra versión.', codigo: 'TERMINOS_VERSION' });
      }
      terminosAceptados = true;
      return json(r, 200, { ...LIMITES.terminos, aceptada: true });
    }
    return json(r, 200, { ...LIMITES.terminos, aceptada: terminosAceptados });
  }
  if (q.method === 'POST' && ruta === '/ordenes') {
    /* El API de verdad NO coloca sin términos aceptados, y acá se hace igual:
       si el decorado los diera por buenos, la casilla de la confirmación
       podría dejar de mandar la aceptación y esta prueba seguiría en verde
       mientras en producción no se coloca ni una orden. */
    if (!terminosAceptados) {
      return json(r, 409, { error: 'Faltan los términos.', codigo: 'TERMINOS_NO_ACEPTADOS' });
    }
    const o = await cuerpoDe(q);
    const orden = { id: 'orden-111', mercado: o.mercado, lado: o.lado, tipo: o.tipo,
      precio: o.precio ?? null, cantidad: o.cantidad, resta: o.cantidad,
      estado: 'abierta', en: new Date().toISOString() };
    ordenes.push(orden);
    return json(r, 200, orden);
  }
  if (q.method === 'DELETE' && borra) {
    const i = ordenes.findIndex(o => o.id === decodeURIComponent(borra[1]));
    if (i < 0) return json(r, 404, { error: 'No existe.', codigo: 'ORDEN_NO_EXISTE' });
    return json(r, 200, { ...ordenes.splice(i, 1)[0], estado: 'cancelada' });
  }
  return json(r, 405, { error: 'Fuera del contrato.', codigo: 'METODO_INVALIDO' });
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
await new Promise(res => sv.listen(0, res));
const ORIGEN = `http://127.0.0.1:${sv.address().port}`;

// ── decir/comprobar, como toda prueba de la casa ───────────────────────────
let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 150)}`);
};

const nav = await chromium.launch({
  executablePath: process.env.ONX_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
/* Con `hasTouch` el navegador aplica las reglas de puntero grueso, que es
   donde vive la mitad de esta clase de fallos. Sin `isMobile` a proposito:
   ese modo mete la ventana virtual de Chrome por medio y `innerWidth` deja de
   ser los 360 px que se estan midiendo — y una prueba que mide otra cosa que
   la que dice medir no sirve de vara. */
const p = await nav.newPage({
  viewport: { width: ANCHO, height: 740 }, deviceScaleFactor: 3, hasTouch: true,
});
await p.addInitScript(o => { window.ONX_API = o; window.ONX_WALLET = o; }, ORIGEN);

/* La medida que resume todo el asunto: ¿algo de esta pantalla se sale de los
   360 px? Se pregunta al documento y a CADA elemento, porque el `body` lleva
   `overflow-x:hidden` y un desbordamiento recortado no mueve el scrollWidth
   del documento: se lo traga en silencio, que es justo lo que pasaba. */
const desbordes = () => p.evaluate((ancho) => {
  const nombre = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    + (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const fuera = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (r.right <= ancho + 1) return;

    /* Desbordar no es el pecado: el pecado es desbordar SIN SALIDA. Se sube
       por los padres hasta encontrar quién manda sobre lo que sobra:
         · un contenedor que desplaza (overflow-x auto/scroll) → se llega con
           el dedo, y ese es justamente el arreglo;
         · la cinta de precios, que es un carrusel infinito: su desborde ES la
           pieza, y recortarlo es lo que se quiere;
         · cualquier otro recorte, o ninguno → lo que sobra no se alcanza. */
    let padre = el.parentElement, veredicto = 'suelto';
    while (padre && padre !== document.body) {
      if (padre.classList.contains('cinta')) { veredicto = 'cinta'; break; }
      const s = getComputedStyle(padre);
      if (/auto|scroll/.test(s.overflowX)) { veredicto = 'riel'; break; }
      if (/hidden|clip/.test(s.overflowX)) { veredicto = 'recortado'; break; }
      padre = padre.parentElement;
    }
    if (veredicto === 'riel' || veredicto === 'cinta') return;
    fuera.push({ que: nombre(el), derecha: Math.round(r.right), como: veredicto });
  });
  return { documento: document.documentElement.scrollWidth, fuera: fuera.slice(0, 6) };
}, ANCHO);

console.log(`\n════ ORDENEX A ${ANCHO} px ${'═'.repeat(30)}`);
console.log(`     web: ${RAIZ}`);

await p.goto(`${ORIGEN}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);
await p.evaluate(() => ONX.idioma('es'));
await p.waitForTimeout(400);

// ── 1 · la portada ────────────────────────────────────────────────────────
console.log('\n── la portada ────────────────────────────────────────────────');
{
  const d = await desbordes();
  decir(d.fuera.length === 0, 'nada se sale del ancho del teléfono',
    d.fuera.length ? JSON.stringify(d.fuera) : `documento: ${d.documento}px`);
}

// ── 2 · la lista de mercados ──────────────────────────────────────────────
console.log('\n── la lista de mercados ──────────────────────────────────────');
{
  await p.click('button[data-t="pt.ver"]');
  await p.waitForTimeout(900);
  const d = await desbordes();
  decir(d.fuera.length === 0, 'la tabla de mercados no se sale: desliza dentro de su riel',
    d.fuera.length ? JSON.stringify(d.fuera) : `documento: ${d.documento}px`);
}

// ── 3 · salir y cambiar de idioma existen en el teléfono ──────────────────
console.log('\n── salir y el idioma, a 360 px ───────────────────────────────');
{
  const m = await p.evaluate(() => {
    const vis = el => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const salir = [...document.querySelectorAll('#app button[data-t="nav.salir"]')].find(vis) || null;
    const es = [...document.querySelectorAll('#app .idiomas button[data-lang="en"]')].find(vis) || null;
    const caja = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; };
    return { salir: salir ? caja(salir) : null, idioma: es ? caja(es) : null };
  });
  decir(!!m.salir, 'el botón de SALIR se ve dentro de la aplicación', JSON.stringify(m.salir));
  decir(!!m.idioma, 'y el cambio de idioma también', JSON.stringify(m.idioma));

  if (m.idioma) {
    await p.click('#app .idiomas button[data-lang="en"]');
    await p.waitForTimeout(500);
    const en = await p.evaluate(() => document.documentElement.lang);
    decir(en === 'en', 'y cambiarlo desde el teléfono funciona de verdad', `lang=${en}`);
    await p.evaluate(() => ONX.idioma('es'));
    await p.waitForTimeout(400);
  }
}

// ── 4 · LA PRUEBA CARA: cancelar una orden desde el teléfono ──────────────
console.log('\n── cancelar una orden, con el dedo ───────────────────────────');
{
  // El canje se recoge al arrancar la página, como en la vuelta de verdad
  // desde la billetera: el token llega en el hash y la casa lo canjea sola.
  await p.goto('about:blank');
  await p.goto(`${ORIGEN}/index.html#sso=${TOKEN_SSO}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1600);
  await p.evaluate(() => ONX.vista('mercado', 'AUKA-ORIGEN'));
  await p.waitForTimeout(1500);

  // 1700 contra una referencia de 1710,69: medio punto por ciento de desvío,
  // o sea 'ok'. Es el mismo par de números que el comentario de mercado.js usa
  // de ejemplo — 4365,3 bloquea, 1700 pasa.
  await p.fill('#vm-precio', '1700');
  await p.fill('#vm-cant', '2');
  await p.click('#vm-enviar');
  await p.waitForTimeout(1200);

  /* ── EL CUADRO DE CONFIRMACIÓN ────────────────────────────────────────────
     «Enviar» ya no coloca nada: abre este cuadro, que dice cuánto das, cuánto
     recibís y cuánto se aleja tu precio de la referencia del oro. Se puso
     después de que esta prueba se escribiera, y por eso la prueba llevaba en
     rojo — buscaba la orden en la lista y la orden seguía esperando detrás de
     un botón que nadie había pulsado.

     Pero lo interesante no es arreglar el paso. Es que este cuadro se cuelga
     del `body` con `position:fixed`, o sea FUERA del lienzo de la aplicación,
     y hoy está en el camino de TODAS las órdenes. Si en un teléfono su botón
     de confirmar cae fuera de la pantalla, no es que se vea mal: es que no se
     puede colocar una orden desde un teléfono, y nada más lo diría. Es el
     mismo agujero número 1 de este archivo —el «Cancelar» recortado por el
     `overflow-x:hidden` del body— una pantalla más adelante. */
  const cuadro = await p.evaluate(() => {
    const velo = document.getElementById('vm-confirmar');
    if (!velo) return null;
    const caja = el => { const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width),
               d: Math.round(r.right), ab: Math.round(r.bottom) }; };
    const ok = velo.querySelector('#cf-ok');
    const volver = velo.querySelector('.cf-botones .btn-linea');
    const terminos = velo.querySelector('#cf-terminos-check');
    const refOro = [...velo.querySelectorAll('.cf-fila')]
      .some(f => /onza de oro|metals\.dev/.test(f.textContent || ''));
    // Lo que se sale del ancho DENTRO del cuadro: las filas llevan números en
    // ORIGEN con cuatro decimales y la del oro trae fuente y hora.
    const fuera = [...velo.querySelectorAll('*')]
      .filter(el => { const r = el.getBoundingClientRect();
        return r.width && r.height && r.right > window.innerWidth + 1; })
      .map(el => el.className || el.tagName).slice(0, 4);
    return {
      ok: ok ? caja(ok) : null, volver: volver ? caja(volver) : null,
      deshabilitado: ok ? ok.disabled : null,
      terminos: terminos ? caja(terminos) : null, refOro,
      alto: Math.round(velo.querySelector('.cf-caja')?.getBoundingClientRect().height || 0),
      ventana: window.innerHeight, fuera,
    };
  });
  decir(!!cuadro, 'antes de colocar se abre el cuadro de confirmación', JSON.stringify(cuadro));

  if (cuadro) {
    decir(!!cuadro.ok && cuadro.ok.d <= ANCHO + 1 && cuadro.ok.x >= 0,
      'y el botón de confirmar entra entero en los 360 px',
      JSON.stringify(cuadro.ok));
    decir(!!cuadro.volver && cuadro.volver.x >= 0,
      'y el de volver también: se puede salir sin colocar', JSON.stringify(cuadro.volver));
    decir(cuadro.fuera.length === 0, 'y ninguna fila del cuadro se sale del ancho',
      cuadro.fuera.length ? JSON.stringify(cuadro.fuera) : 'nada fuera');
    /* Que el botón esté A LA VISTA, no solo dentro del ancho. La caja crece
       con las filas del oro y del desvío; si se pasa del alto de la ventana,
       el confirmar queda por debajo del borde y hay que poder desplazarse
       hasta él. */
    decir(cuadro.ok != null && cuadro.ok.ab <= cuadro.ventana,
      'y no queda por debajo del borde de la pantalla',
      `botón termina en ${cuadro.ok?.ab}px · ventana ${cuadro.ventana}px · caja ${cuadro.alto}px`);
    decir(cuadro.refOro, 'el cuadro enseña la referencia del oro con su fuente y su hora',
      cuadro.refOro ? 'onza y gramín, con fuente' : 'no aparece la fila del oro');

    /* LA CASILLA DE LOS TÉRMINOS. Sale en la PRIMERA orden de cada persona, y
       la primera orden de casi todos va a ser desde el teléfono. Es una
       etiqueta con dos enlaces dentro de una frase, o sea lo que peor envuelve
       en 360 px, y hasta que no se marca el confirmar está apagado: si la
       casilla cayera fuera de la pantalla, el botón se vería y no se
       encendería nunca. Ese fallo se lee como «la app no deja operar». */
    decir(!!cuadro.terminos, 'en la primera orden pide aceptar los términos',
      JSON.stringify(cuadro.terminos));
    if (cuadro.terminos) {
      decir(cuadro.terminos.x >= 0 && cuadro.terminos.d <= ANCHO + 1
            && cuadro.terminos.ab <= cuadro.ventana,
        'y se llega a la casilla con el dedo, dentro de la pantalla',
        JSON.stringify(cuadro.terminos));
      decir(cuadro.deshabilitado === true,
        'y hasta marcarla el confirmar está apagado', `disabled=${cuadro.deshabilitado}`);
      // Se marca TOCANDO. `check()` de Playwright toca de verdad y falla si
      // algo se pone encima, que es la mitad de lo que se busca acá.
      try { await p.locator('#cf-terminos-check').check({ timeout: 8000 }); }
      catch { decir(false, 'y se puede marcar con el dedo', 'el toque no llegó a la casilla'); }
      await p.waitForTimeout(300);
      const tras = await p.evaluate(() => document.getElementById('cf-ok')?.disabled);
      decir(tras === false, 'y al marcarla se enciende el confirmar', `disabled=${tras}`);
    }

    // Y se confirma TOCANDO, no llamando a la función: si algo se pone encima
    // del botón, llamarla lo taparía.
    try { await p.locator('#cf-ok').click({ timeout: 8000 }); }
    catch { decir(false, 'y se puede tocar el confirmar', 'el toque no llegó'); }
    await p.waitForTimeout(1500);
  }

  const antes = await p.evaluate(() => {
    const b = document.querySelector('#vm-ordenes button');
    if (!b) return null;
    const t = document.querySelector('#vm-ordenes')?.closest('table');
    const r = b.getBoundingClientRect();
    return { derechaBoton: Math.round(r.right), anchoTabla: Math.round(t?.getBoundingClientRect().width || 0),
             ventana: window.innerWidth };
  });
  decir(!!antes, 'la orden colocada aparece en «mis órdenes abiertas»', JSON.stringify(antes));

  if (antes) {
    console.log(`           medida: tabla ${antes.anchoTabla}px · «Cancelar» termina en ${antes.derechaBoton}px de ${antes.ventana}px`);
    /* La comprobacion no es «el boton entra en la pantalla»: una tabla de
       cinco columnas en 360 px no entra y no tiene por que. Es que se pueda
       LLEGAR — o sea, que su contenedor desplace hasta el. */
    const alcanzable = await p.evaluate(() => {
      const b = document.querySelector('#vm-ordenes button');
      if (!b) return { ok: false, por: 'no hay botón' };
      let padre = b.parentElement, riel = null;
      while (padre && padre !== document.body) {
        const s = getComputedStyle(padre);
        if (/auto|scroll/.test(s.overflowX)) { riel = padre; break; }
        padre = padre.parentElement;
      }
      const r0 = b.getBoundingClientRect();
      if (r0.right <= window.innerWidth) return { ok: true, por: 'ya estaba a la vista', riel: !!riel };
      if (!riel) return { ok: false, por: 'se sale de la pantalla y ningún contenedor desplaza' };
      riel.scrollLeft = riel.scrollWidth;
      const r1 = b.getBoundingClientRect();
      return { ok: r1.right <= window.innerWidth + 1 && r1.left >= 0,
               por: `desplazando el riel: ${Math.round(r0.right)} → ${Math.round(r1.right)}`, riel: true };
    });
    decir(alcanzable.ok, 'se puede LLEGAR al botón «Cancelar» con el dedo', alcanzable.por);

    /* Y que llegar sirva: se TOCA de verdad, con el dedo y sin trampas.
       Nada de `dispatchEvent`: el clic sintético atraviesa cualquier cosa que
       esté encima, y «hay algo encima del botón» es exactamente uno de los
       fallos que esta prueba busca. Si el toque no llega, Playwright espera
       hasta el plazo y eso ES el resultado — se anota y se sigue. */
    let toco = true, porQue = '';
    try {
      await p.locator('#vm-ordenes button').first().scrollIntoViewIfNeeded({ timeout: 5000 });
      await p.locator('#vm-ordenes button').first().click({ timeout: 8000 });
    } catch (e) {
      toco = false;
      porQue = /intercepts pointer events/.test(String(e?.message || ''))
        ? 'algo se pone encima del botón y se come el toque'
        : 'el toque no llegó al botón';
    }
    await p.waitForTimeout(1200);
    const quedan = await p.evaluate(() => document.querySelectorAll('#vm-ordenes button').length);
    /* Se exige TAMBIEN que fuera alcanzable: `scrollIntoViewIfNeeded` mueve la
       página aunque el CSS no deje desplazarla —es una orden del guion, no un
       dedo— así que sin esta condición un botón irrecortablemente fuera de
       pantalla se cancelaría igual y la prueba diría que todo bien. */
    decir(toco && quedan === 0 && alcanzable.ok, 'y tocarlo cancela la orden: el saldo reservado vuelve',
      porQue || (alcanzable.ok ? `quedan ${quedan}` : 'la cancelación funciona, pero al botón no se llega con el dedo'));
  }

  const d = await desbordes();
  decir(d.fuera.length === 0, 'y en la sala tampoco se sale nada del ancho',
    d.fuera.length ? JSON.stringify(d.fuera) : `documento: ${d.documento}px`);
}

// ── 5 · LA PORTADA EN INGLÉS ──────────────────────────────────────────────
/* Todo lo de arriba se medía en español, que es el idioma en el que se
   escribió la página y en el que la mira quien la hizo. Y en inglés la portada
   se desplazaba a lo ancho en 320 y en 360 px, desde siempre.

   El culpable: `.btn` lleva `white-space:nowrap`, y en inglés el rótulo de
   entrar es «Sign in with my Veta Wallet account». Un botón que no envuelve
   tiene el ancho de su rótulo entero como ancho MÍNIMO, y la columna de la
   portada es `1fr` — o sea `minmax(auto,1fr)`, donde ese `auto` es el mínimo
   del contenido. Los 371 px del botón se comían la rejilla completa y el
   sello, el titular y el párrafo se iban con ella.

   Que un fallo viva solo en el segundo idioma es la regla y no la excepción:
   nadie prueba la página en el idioma que no habla. Por eso esto se mide. */
console.log('\n── la portada, en inglés ─────────────────────────────────────');
{
  /* Se tira la sesión ANTES de recargar. DATOS la guarda en el navegador, así
     que sin esto la página vuelve a abrir directamente en la aplicación y la
     portada —que es lo que se va a medir acá— no se llega a pintar nunca. Una
     prueba que mide otra pantalla que la que dice medir es peor que no
     tenerla: pasa siempre, y en verde. */
  await p.evaluate(() => { try { localStorage.clear(); } catch {} });
  await p.goto('about:blank');
  await p.goto(`${ORIGEN}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  const enPortada = await p.evaluate(() =>
    !!document.querySelector('#portada') && !document.body.classList.contains('en-app'));
  decir(enPortada, 'la portada se abre sin sesión, que es donde se mide esto');
  await p.evaluate(() => ONX.idioma('en'));
  await p.waitForTimeout(500);

  const d = await desbordes();
  decir(d.fuera.length === 0, 'en inglés tampoco se sale nada del ancho del teléfono',
    d.fuera.length ? JSON.stringify(d.fuera) : `documento: ${d.documento}px`);
  decir(d.documento <= ANCHO, 'y la página no se desplaza a lo ancho',
    `documento ${d.documento}px vs pantalla ${ANCHO}px`);

  /* La medida de la causa, no del síntoma: el botón de entrar tiene que caber
     en la pantalla. Si vuelve a no envolver, esto se rompe antes que nada. */
  const b = await p.evaluate(() => {
    const el = [...document.querySelectorAll('.bv-btns .btn')]
      .find(x => x.getBoundingClientRect().width > 0);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { texto: el.textContent.trim(), ancho: Math.round(r.width), der: Math.round(r.right) };
  });
  decir(b && b.der <= ANCHO + 1, 'el botón de entrar cabe en el ancho del teléfono',
    JSON.stringify(b));

  await p.evaluate(() => ONX.idioma('es'));
  await p.waitForTimeout(400);
}

// ── 6 · LOS BLANCOS DE TOQUE DE LOS MANDOS ────────────────────────────────
/* 40 px es la recomendación de accesibilidad y es el ancho real de la yema de
   un dedo. No se le exige a cualquier cosa que se pueda pulsar: un enlace de
   texto dentro de una frase no tiene por qué ser un botón, y engordarlo
   partiría la frase. Se le exige a los MANDOS — lo que elige, envía, cancela o
   cierra sesión. Esta lista es esa distinción, escrita.

   Lo que había: SALIR medía 25×16 y las pastillas de idioma de la aplicación
   18×16, porque `.riel-pie button{padding:0}` les comía el relleno; los marcos
   de la gráfica y el selector de fuente, 28 de alto; los lados comprar/vender,
   35; «Usar todo», 14; los mandos del zoom, 26×26; las filas del libro, 26. */
console.log('\n── el blanco de toque de los mandos ──────────────────────────');
{
  const MINIMO = 40;
  const mide = (sel) => p.evaluate((s) => {
    const el = [...document.querySelectorAll(s)]
      .find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);

  const exigir = async (nombre, sel) => {
    const m = await mide(sel);
    decir(!!m && m.w >= MINIMO && m.h >= MINIMO, `${nombre} llega a 40 px de blanco`,
      m ? `${m.w}×${m.h}` : `no se encontró: ${sel}`);
  };

  // En la portada
  await exigir('el cambio de idioma de la portada', '#techo .idiomas button');

  /* Y de vuelta con sesión: los mandos que mueven dinero —comprar, vender,
     «usar todo»— sencillamente NO EXISTEN sin ella, y medir su tamaño sin
     entrar da «no se encontró», que en una prueba de geometría se lee como un
     fallo cuando es un descuido del guion. */
  await p.goto('about:blank');
  await p.goto(`${ORIGEN}/index.html#sso=${TOKEN_SSO}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1600);
  await p.evaluate(() => ONX.idioma('es'));
  await p.waitForTimeout(400);
  await exigir('SALIR', '#app .riel-pie button[data-t="nav.salir"]');
  await exigir('el cambio de idioma de la aplicación', '#app .riel-pie .idiomas button');

  // En la sala de mercado, que es donde viven los mandos que mueven dinero
  await p.evaluate(() => ONX.vista('mercado', 'AGKA-ORIGEN'));
  await p.waitForTimeout(1800);
  await exigir('volver a los mercados', '.vm-volver');
  await exigir('el selector de fuente', '.vm-fuentes button');
  await exigir('el marco de la gráfica', '.vm-marcos button');
  await exigir('los mandos del zoom', '#vm-zoom button');
  await exigir('comprar/vender', '.vm-seg.lados button');
  await exigir('«usar todo»', '.vm-max');
  await exigir('una fila del libro', '.vm-fila');
  await exigir('las pestañas de órdenes', '.vm-peskab button');

  // Y en fiat
  await p.evaluate(() => ONX.vista('fiat'));
  await p.waitForTimeout(1400);
  await exigir('las pestañas de fiat', '.ft-tabs button');
}

// ── 7 · EL NOMBRE LARGO NO SE METE POR DEBAJO DEL BOTÓN ───────────────────
/* Éste es el fallo de José, reproducido en Ordenex con un nombre de verdad.

   La hilera de la casa es [icono][texto que encoge][acción]. La acción es un
   `.btn` y un `.btn` no envuelve: su ancho mínimo es el rótulo entero. En una
   fila de 328 px con «Comprarle ORIGEN» al lado, al texto le quedaban 30 px —
   el nombre bajaba a una palabra por renglón y, si el nombre venía en una sola
   palabra larga, se metía POR DEBAJO del botón.

   Y esto no lo atrapa medir desbordes: nada se sale del ancho de la pantalla.
   Se PISAN dentro de ella. Por eso la comprobación es de solape y de reparto,
   no de borde — que es exactamente la lección de la captura de José. */
console.log('\n── un nombre largo, al lado de un botón ──────────────────────');
{
  await p.evaluate(() => VFIAT.pestana('comprar'));
  await p.waitForTimeout(1200);

  const m = await p.evaluate(() => {
    const hs = [...document.querySelectorAll('#lienzo .hilera')]
      .filter(h => h.querySelector('.btn'));
    if (!hs.length) return null;
    return hs.map(h => {
      const nom = h.querySelector('.txt b');
      const btn = h.querySelector('.btn');
      const rn = nom.getBoundingClientRect(), rb = btn.getBoundingClientRect();
      const rh = h.getBoundingClientRect();

      /* Se mide la TINTA, no la caja. Y esa distinción es el fallo entero:
         cuando el botón le come el sitio, la caja del nombre se queda en 33 px
         —chiquita y perfectamente dentro de la fila— pero las LETRAS se
         desbordan de ella y se dibujan encima del botón. Preguntarle su
         `getBoundingClientRect` al elemento diría que todo está en orden
         mientras la pantalla enseña el nombre metido por debajo de un botón.
         Los rectángulos de un Range sobre el nodo de texto sí dan dónde caen
         las letras de verdad. */
      const ra = document.createRange();
      ra.selectNodeContents(nom);
      const tinta = [...ra.getClientRects()].filter(x => x.width > 0 && x.height > 0);
      const derTinta = tinta.length ? Math.max(...tinta.map(x => x.right)) : rn.right;
      const abajoTinta = tinta.length ? Math.max(...tinta.map(x => x.bottom)) : rn.bottom;
      const arribaTinta = tinta.length ? Math.min(...tinta.map(x => x.top)) : rn.top;

      const pisa = derTinta > rb.left + 1 && rb.right > rn.left + 1
                && abajoTinta > rb.top + 1 && rb.bottom > arribaTinta + 1;

      return {
        nombre: nom.textContent.trim().slice(0, 24),
        pisa,
        // Y el otro filo: que la tinta se salga de su propia caja ya es el
        // síntoma, tenga o no un botón justo ahí donde caer.
        seSaleDeSuCaja: nom.scrollWidth > nom.clientWidth + 1,
        anchoNombre: Math.round(rn.width),
        anchoHilera: Math.round(rh.width),
        derNombre: Math.round(derTinta),
      };
    });
  });

  decir(!!m && m.length >= 2, 'la lista de agentes trae los dos nombres largos',
    m ? m.map(x => x.nombre).join(' | ') : 'no hay hileras con botón');

  if (m) {
    decir(m.every(x => !x.pisa), 'ningún nombre se mete por debajo de su botón',
      JSON.stringify(m.map(x => ({ n: x.nombre, pisa: x.pisa }))));
    decir(m.every(x => !x.seSaleDeSuCaja), 'ni se sale de su propia caja',
      JSON.stringify(m.map(x => ({ n: x.nombre, sale: x.seSaleDeSuCaja }))));
    /* Y que no se pisen no basta: el nombre tiene que tener sitio para
       LEERSE. Con 30 px de ancho no se pisaba nada y aun así el nombre salía
       en columna, una palabra por renglón. Se pide la mitad de la fila, que es
       poco y ya descarta el estrujado. */
    decir(m.every(x => x.anchoNombre >= x.anchoHilera * 0.5),
      'y cada nombre se lleva al menos media fila para leerse',
      JSON.stringify(m.map(x => `${x.anchoNombre}/${x.anchoHilera}`)));
    decir(m.every(x => x.derNombre <= ANCHO + 1),
      'ni se sale del ancho del teléfono',
      JSON.stringify(m.map(x => x.derNombre)));
  }
}

// ── 8 · LA GRÁFICA DE VELAS A 360 px ──────────────────────────────────────
/* Dos cosas estaban documentadas y las dos eran ciertas.
   Una: el lienzo salía MÁS ALTO QUE ANCHO — 287×385, o sea 0,75 — porque el
   alto era `clamp(340px,52vh,620px)` y el ancho lo daba la pantalla. Una vela
   es una figura ancha: en vertical se estiran los cuerpos y caben menos velas
   de las que entrarían.
   Dos: la leyenda se cortaba. Con precios de nueve cifras el renglón
   «O … H … L … C … %» mide más de 500 px, y un canvas no envuelve: lo que
   sobraba se pintaba fuera de la imagen. L, C y el cambio del día estaban
   dibujados donde no hay pantalla, o sea que no estaban.

   Ahora la leyenda se reparte en renglones que caben, y cuando ni así entra
   sin taparle la gráfica a nadie, se queda con el par y el cierre y MUDA el
   resto a la tira de debajo del lienzo. Mudar no es esconder: la prueba exige
   que los mismos números estén, y que se pueda leer dónde. */
console.log('\n── la gráfica de velas, a 360 px ─────────────────────────────');
{
  await p.evaluate(() => ONX.vista('mercado', 'AGKA-ORIGEN'));
  await p.waitForTimeout(2200);

  const g = await p.evaluate(() => {
    const c = document.getElementById('vm-velas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height),
             prop: +(r.width / r.height).toFixed(2), der: Math.round(r.right) };
  });
  decir(!!g && g.w > g.h, 'el lienzo es apaisado: más ancho que alto',
    g ? `${g.w}×${g.h} (proporción ${g.prop})` : 'no hay lienzo');
  decir(!!g && g.der <= ANCHO + 1, 'y cabe en el ancho del teléfono', JSON.stringify(g));

  const tira = await p.evaluate(() => {
    const t = document.getElementById('vm-ohlc');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return {
      visible: !t.hidden && r.width > 0 && r.height > 0,
      der: Math.round(r.right),
      etiquetas: [...t.querySelectorAll('.vm-ohlc-d i')].map(x => x.textContent),
      valores: [...t.querySelectorAll('.vm-ohlc-d b')].map(x => x.textContent),
    };
  });

  decir(!!tira && tira.visible,
    'lo que no cabía en la leyenda aterriza debajo del lienzo, a la vista',
    tira ? JSON.stringify(tira.etiquetas) : 'no existe la tira');
  if (tira && tira.visible) {
    const tieneOHL = ['O', 'H', 'L'].every(k => tira.etiquetas.includes(k));
    decir(tieneOHL, 'con apertura, máximo y mínimo — los tres, no un resumen',
      tira.etiquetas.join(' '));
    decir(tira.etiquetas.some(k => /^EMA/.test(k)), 'y las medias móviles',
      tira.etiquetas.filter(k => /^EMA/.test(k)).join(' '));
    decir(tira.valores.every(v => v && v !== '—' && v.length > 3),
      'con números de verdad, no guiones de relleno', tira.valores.join(' | '));
    decir(tira.der <= ANCHO + 1, 'y sin salirse del ancho', String(tira.der));
  }

  /* Y las dos direcciones del encogido, medidas sobre lienzos de mentira para
     no tocar el de la sala: en un lienzo de teléfono la leyenda TIENE que
     encogerse, y en uno de escritorio NO. La segunda mitad no es un adorno —
     sin ella, «encoger siempre» pasaría esta prueba, y encoger siempre le
     arranca la leyenda entera a la gráfica ancha, que es donde sí cabe y donde
     se opera de verdad. */
  const dosLienzos = await p.evaluate(async () => {
    if (typeof VELAS === 'undefined') return null;
    const velas = await fetch(window.ONX_API + '/mercados/AGKA-ORIGEN/velas?marco=1h').then(r => r.json());
    const probar = (w, h) => {
      const c = document.createElement('canvas');
      c.style.width = w + 'px'; c.style.height = h + 'px';
      document.body.appendChild(c);
      // `dpr:1` para que el resultado no dependa de la pantalla de quien corre
      // la prueba: acá se mide el reparto de la leyenda, no la densidad.
      const inf = VELAS.dibujar(c, velas, { par: 'AGKA-ORIGEN', marco: '1h', unidad: 'ORIGEN',
        decimales: 4, emas: [9, 21, 55], dpr: 1 });
      c.remove();
      return inf && inf.leyenda ? inf.leyenda.recortada : null;
    };
    return { telefono: probar(287, 240), escritorio: probar(900, 420) };
  }).catch(() => null);

  decir(dosLienzos && dosLienzos.telefono === true,
    'en un lienzo de teléfono la leyenda se encoge en vez de pintarse fuera',
    JSON.stringify(dosLienzos));
  decir(dosLienzos && dosLienzos.escritorio === false,
    'y en uno de escritorio se queda entera: el encogido no se contagia',
    JSON.stringify(dosLienzos));

  /* La barra de estadísticas de arriba. En un escritorio entra en una fila y
     su hueco entre renglones no se usa nunca; en un teléfono se parte en tres,
     y con `gap:0` la etiqueta de un renglón nacía pegada a los números del de
     arriba — «SE PAGA EN» salía colgando de «987,654,321.5» como si fuera su
     decimal. Solo se ve con cifras largas, que es por lo que este par las
     tiene. */
  const st = await p.evaluate(() => {
    const s = document.querySelector('.vm-stats');
    if (!s) return null;
    const cajas = [...s.querySelectorAll('.vm-stat')].map(e => {
      const r = e.getBoundingClientRect();
      return { izq: r.left, der: r.right, arriba: r.top, abajo: r.bottom,
               t: e.textContent.trim().replace(/\s+/g, ' ').slice(0, 22) };
    });
    /* El hueco no se busca por «renglones»: dos cajas del mismo renglón no
       empiezan exactamente en el mismo píxel y agruparlas por su `top` inventa
       renglones que no existen. Se buscan PARES: una caja que está debajo de
       otra y comparte columna con ella. Ese par es justo el que se ve mal —
       una etiqueta colgando del número de arriba— y su distancia es el dato. */
    let minHueco = Infinity, par = null;
    for (const a of cajas) for (const b of cajas) {
      if (a === b) continue;
      if (!(a.izq < b.der - 1 && b.izq < a.der - 1)) continue;   // no comparten columna
      if (b.arriba < a.abajo - 1) continue;                      // no está debajo
      const h = b.arriba - a.abajo;
      if (h < minHueco) { minHueco = h; par = `«${a.t}» → «${b.t}»`; }
    }
    return { cuantas: cajas.length, minHueco: Number.isFinite(minHueco) ? Math.round(minHueco) : null, par };
  });
  decir(!!st && st.minHueco != null,
    'la barra de estadísticas se parte en varios renglones acá', JSON.stringify(st));
  if (st && st.minHueco != null) {
    decir(st.minHueco >= 6,
      'y entre renglón y renglón queda aire: la etiqueta no cuelga del número de arriba',
      `${st.minHueco}px de hueco · ${st.par}`);
  }
}

// ── 8b · Y LA MISMA SALA EN 320 px ────────────────────────────────────────
/* 360 es el ancho de la prueba porque es el más común, pero el iPhone SE y los
   Android baratos que se siguen vendiendo acá miden 320. Y la sala de mercado
   se salía por 25 px justo ahí, en 320 y no en 360: la tira de fuentes
   —«Tratos · ORIGEN» y «Referencia · USD»— mide 287 px y no encoge, porque es
   una pastilla; la columna de la rejilla era `1fr`, o sea `minmax(auto,1fr)`,
   y ese `auto` es el mínimo del contenido, así que la tira empujaba la columna
   a 329 y con ella la gráfica, el formulario y el libro.

   En 360 entraba por poco y por eso no se veía. 40 px de diferencia entre «se
   ve bien» y «la sala entera se sale de la pantalla» es exactamente el motivo
   de medir en más de un ancho. */
console.log('\n── la misma sala, en 320 px ──────────────────────────────────');
{
  const ANGOSTO = 320;
  await p.setViewportSize({ width: ANGOSTO, height: 740 });
  await p.evaluate(() => ONX.vista('mercado', 'AGKA-ORIGEN'));
  await p.waitForTimeout(2000);

  const d = await p.evaluate((ancho) => {
    const fuera = [];
    document.querySelectorAll('#lienzo *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= ancho + 1) return;
      let padre = el.parentElement, veredicto = 'suelto';
      while (padre && padre !== document.body) {
        const s = getComputedStyle(padre);
        if (/auto|scroll/.test(s.overflowX)) { veredicto = 'riel'; break; }
        if (/hidden|clip/.test(s.overflowX)) { veredicto = 'recortado'; break; }
        padre = padre.parentElement;
      }
      if (veredicto === 'riel') return;
      fuera.push({ que: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/)[0] : ''), der: Math.round(r.right), como: veredicto });
    });
    const c = document.getElementById('vm-velas');
    const rc = c ? c.getBoundingClientRect() : null;
    return {
      documento: document.documentElement.scrollWidth,
      fuera: fuera.slice(0, 6),
      lienzo: rc ? { w: Math.round(rc.width), h: Math.round(rc.height) } : null,
    };
  }, ANGOSTO);

  decir(d.documento <= ANGOSTO, 'a 320 px la página tampoco se desplaza a lo ancho',
    `documento ${d.documento}px`);
  decir(d.fuera.length === 0, 'y en la sala de mercado no se sale nada',
    d.fuera.length ? JSON.stringify(d.fuera) : 'nada fuera');
  decir(!!d.lienzo && d.lienzo.w > d.lienzo.h, 'la gráfica sigue siendo apaisada a 320 px',
    d.lienzo ? `${d.lienzo.w}×${d.lienzo.h}` : 'no hay lienzo');

  await p.setViewportSize({ width: ANCHO, height: 740 });
  await p.waitForTimeout(400);
}

// ── 9 · EL TECLADO NO TAPA EL CAMPO ───────────────────────────────────────
/* El teclado de un teléfono no empuja la página: le RECORTA la ventana por
   abajo. De 740 px se pasa a unos 380, y las pestañas de navegación, que van
   `position:fixed` pegadas al borde de esa ventana, suben con él y se plantan
   encima de lo que se está escribiendo.

   Se simula encogiendo la ventana con el campo enfocado y pidiendo que se
   traiga a la vista, que es exactamente lo que hace el navegador de verdad.
   Antes del arreglo, a 360×380 el campo de precio quedaba en 346–394 con la
   barra empezando en 309: se tecleaba un precio sin verlo. En una casa de
   cambio, escribir un número a ciegas es donde se pierde un cero. */
console.log('\n── con el teclado abierto ────────────────────────────────────');
{
  await p.evaluate(() => ONX.vista('mercado', 'AGKA-ORIGEN'));
  await p.waitForTimeout(1800);

  const campo = p.locator('#vm-precio');
  await campo.scrollIntoViewIfNeeded().catch(() => {});
  await campo.focus().catch(() => {});
  // El alto de una pantalla de teléfono con el teclado abierto.
  await p.setViewportSize({ width: ANCHO, height: 380 });
  await p.waitForTimeout(400);
  /* `nearest` y no `center`: así es como el navegador trae a la vista el campo
     que acaba de recibir el foco — con el desplazamiento MÍNIMO, o sea dejando
     el campo pegado al filo de abajo, que es justo donde el teclado y la barra
     lo esperan. Centrarlo sería regalarle a la prueba el aire que el fallo se
     comía, y entonces pasaría con el fallo puesto. */
  await p.evaluate(() => document.getElementById('vm-precio')?.scrollIntoView({ block: 'nearest' }));
  await p.waitForTimeout(500);

  const m = await p.evaluate(() => {
    const i = document.getElementById('vm-precio');
    const t = document.querySelector('.tabs');
    if (!i) return null;
    const ri = i.getBoundingClientRect();
    const rt = t ? t.getBoundingClientRect() : null;
    const barraVisible = !!rt && rt.width > 0 && rt.height > 0;
    return {
      enfocado: document.activeElement === i,
      campo: { arriba: Math.round(ri.top), abajo: Math.round(ri.bottom) },
      barra: barraVisible ? Math.round(rt.top) : null,
      tapado: barraVisible && ri.bottom > rt.top && ri.top < rt.bottom,
      aLaVista: ri.top >= 0 && ri.bottom <= window.innerHeight,
      ventana: window.innerHeight,
    };
  });

  decir(!!m && m.enfocado, 'el campo de precio tiene el foco', JSON.stringify(m));
  decir(!!m && m.barra === null,
    'mientras se teclea, la barra de pestañas se retira: no navega quien escribe',
    JSON.stringify(m));
  decir(!!m && !m.tapado, 'y no se planta encima del campo que se teclea',
    JSON.stringify(m));
  decir(!!m && m.aLaVista, 'y el campo entra entero en la ventana que deja el teclado',
    JSON.stringify(m));

  await p.setViewportSize({ width: ANCHO, height: 740 });
  await p.waitForTimeout(300);
}

console.log(`\n${malas === 0 ? 'todo en pie.' : malas + ' comprobación(es) fallaron'}\n`);
await nav.close();
sv.close();
process.exit(malas === 0 ? 0 : 1);
